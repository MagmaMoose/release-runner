import {
  SignJWT,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  type JWTPayload
} from "jose";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_AUDIENCE = "semantic-release-token-broker";
const DEFAULT_PERMISSIONS: TokenPermissions = {
  contents: "write",
  pull_requests: "write"
};

const remoteJwks = createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS_URL));

type PermissionLevel = "read" | "write";
type TokenPermissions = Record<string, PermissionLevel>;

export type BrokerEnv = Env & {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  OIDC_AUDIENCE?: string;
  ALLOWED_REPOSITORIES?: string;
  TOKEN_PERMISSIONS?: string;
};

interface TokenRequest {
  oidcToken: string;
  owner: string;
  repo: string;
  ref?: string;
  runId?: string;
  sha?: string;
}

interface VerifiedOidcPayload extends JWTPayload {
  repository?: string;
}

interface Dependencies {
  fetch: typeof fetch;
  verifyOidcToken: (
    token: string,
    audience: string
  ) => Promise<VerifiedOidcPayload>;
  createGitHubAppJwt: (
    appId: string,
    privateKey: string,
    now: Date
  ) => Promise<string>;
  now: () => Date;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

class OidcVerificationError extends Error {}

const defaultDependencies: Dependencies = {
  fetch,
  verifyOidcToken,
  createGitHubAppJwt,
  now: () => new Date()
};

export default {
  fetch(request: Request, env: BrokerEnv): Promise<Response> {
    return handleRequest(request, env);
  }
} satisfies ExportedHandler<BrokerEnv>;

export async function handleRequest(
  request: Request,
  env: BrokerEnv,
  deps: Partial<Dependencies> = {}
): Promise<Response> {
  const dependencies: Dependencies = {
    ...defaultDependencies,
    ...deps
  };

  try {
    const url = new URL(request.url);
    if (url.pathname !== "/token") {
      return jsonError(404, "not_found");
    }

    if (request.method !== "POST") {
      return jsonError(405, "method_not_allowed");
    }

    const body = await readTokenRequest(request);
    const repository = `${body.owner}/${body.repo}`;
    assertRepositoryParts(body.owner, body.repo);

    const audience = env.OIDC_AUDIENCE || DEFAULT_AUDIENCE;
    const oidcPayload = await verifyOidc(body.oidcToken, audience, dependencies);
    if (oidcPayload.repository !== repository) {
      return jsonError(403, "repo_mismatch");
    }

    if (!repositoryAllowed(repository, env.ALLOWED_REPOSITORIES)) {
      return jsonError(403, "repo_not_allowed");
    }

    const appJwt = await dependencies.createGitHubAppJwt(
      requiredSecret(env.GITHUB_APP_ID, "GITHUB_APP_ID"),
      requiredSecret(env.GITHUB_APP_PRIVATE_KEY, "GITHUB_APP_PRIVATE_KEY"),
      dependencies.now()
    );
    const installationId = await findInstallationId(
      dependencies.fetch,
      appJwt,
      body.owner,
      body.repo
    );
    const token = await createInstallationToken(
      dependencies.fetch,
      appJwt,
      installationId,
      body.repo,
      parsePermissions(env.TOKEN_PERMISSIONS)
    );

    return json(
      {
        token: token.token,
        expires_at: token.expires_at,
        repository
      },
      200
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.status, error.code);
    }

    if (error instanceof OidcVerificationError) {
      return jsonError(401, "invalid_oidc_token");
    }

    return jsonError(500, "internal_error");
  }
}

async function readTokenRequest(request: Request): Promise<TokenRequest> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json");
  }

  if (!isRecord(value)) {
    throw new HttpError(400, "invalid_request");
  }

  const oidcToken = asString(value.oidcToken);
  const owner = asString(value.owner);
  const repo = asString(value.repo);

  if (!oidcToken || !owner || !repo) {
    throw new HttpError(400, "missing_required_fields");
  }

  return {
    oidcToken,
    owner,
    repo,
    ref: asString(value.ref),
    runId: asString(value.runId),
    sha: asString(value.sha)
  };
}

async function verifyOidc(
  token: string,
  audience: string,
  deps: Dependencies
): Promise<VerifiedOidcPayload> {
  try {
    return await deps.verifyOidcToken(token, audience);
  } catch {
    throw new OidcVerificationError();
  }
}

async function verifyOidcToken(
  token: string,
  audience: string
): Promise<VerifiedOidcPayload> {
  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: GITHUB_OIDC_ISSUER,
    audience
  });
  return payload;
}

async function createGitHubAppJwt(
  appId: string,
  privateKey: string,
  now: Date
): Promise<string> {
  const epochSeconds = Math.floor(now.getTime() / 1000);
  const key = await importPKCS8(normalizePrivateKey(privateKey), "RS256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(epochSeconds - 60)
    .setExpirationTime(epochSeconds + 9 * 60)
    .setIssuer(appId)
    .sign(key);
}

async function findInstallationId(
  githubFetch: typeof fetch,
  appJwt: string,
  owner: string,
  repo: string
): Promise<number> {
  const response = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
    {
      headers: githubHeaders(appJwt)
    }
  );

  if (response.status === 404) {
    throw new HttpError(404, "app_not_installed");
  }

  if (!response.ok) {
    throw new HttpError(500, "github_installation_lookup_failed");
  }

  const body = await response.json();
  if (!isRecord(body) || typeof body.id !== "number") {
    throw new HttpError(500, "github_installation_lookup_failed");
  }

  return body.id;
}

async function createInstallationToken(
  githubFetch: typeof fetch,
  appJwt: string,
  installationId: number,
  repo: string,
  permissions: TokenPermissions
): Promise<{ token: string; expires_at: string }> {
  const response = await githubFetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(appJwt),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repositories: [repo],
        permissions
      })
    }
  );

  if (!response.ok) {
    throw new HttpError(500, "github_token_create_failed");
  }

  const body = await response.json();
  if (
    !isRecord(body) ||
    typeof body.token !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    throw new HttpError(500, "github_token_create_failed");
  }

  return {
    token: body.token,
    expires_at: body.expires_at
  };
}

function githubHeaders(appJwt: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${appJwt}`,
    "user-agent": "calebsargeant-semantic-release-token-broker",
    "x-github-api-version": GITHUB_API_VERSION
  };
}

function parsePermissions(rawPermissions: string | undefined): TokenPermissions {
  if (!rawPermissions || rawPermissions.trim() === "") {
    return DEFAULT_PERMISSIONS;
  }

  const trimmed = rawPermissions.trim();
  const parsed = trimmed.startsWith("{")
    ? parseJsonPermissions(trimmed)
    : parseDelimitedPermissions(trimmed);

  if (Object.keys(parsed).length === 0) {
    throw new HttpError(400, "invalid_token_permissions");
  }

  return parsed;
}

function parseJsonPermissions(rawPermissions: string): TokenPermissions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPermissions);
  } catch {
    throw new HttpError(400, "invalid_token_permissions");
  }

  if (!isRecord(parsed)) {
    throw new HttpError(400, "invalid_token_permissions");
  }

  return normalizePermissions(parsed);
}

function parseDelimitedPermissions(rawPermissions: string): TokenPermissions {
  const permissions: Record<string, string> = {};
  for (const entry of rawPermissions.split(",")) {
    const [rawKey, rawValue] = entry.includes("=")
      ? entry.split("=", 2)
      : entry.split(":", 2);
    if (!rawKey || !rawValue) {
      throw new HttpError(400, "invalid_token_permissions");
    }
    permissions[rawKey.trim()] = rawValue.trim();
  }
  return normalizePermissions(permissions);
}

function normalizePermissions(
  permissions: Record<string, unknown>
): TokenPermissions {
  const normalized: TokenPermissions = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (!/^[a-z_]+$/.test(key)) {
      throw new HttpError(400, "invalid_token_permissions");
    }
    if (value !== "read" && value !== "write") {
      throw new HttpError(400, "invalid_token_permissions");
    }
    normalized[key] = value;
  }
  return normalized;
}

function repositoryAllowed(
  repository: string,
  allowedRepositories: string | undefined
): boolean {
  if (!allowedRepositories || allowedRepositories.trim() === "") {
    return true;
  }

  return allowedRepositories
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(repository);
}

function assertRepositoryParts(owner: string, repo: string): void {
  const validPart = /^[A-Za-z0-9_.-]+$/;
  if (!validPart.test(owner) || !validPart.test(repo)) {
    throw new HttpError(400, "invalid_repository");
  }
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function requiredSecret(value: string | undefined, name: string): string {
  if (!value || value.trim() === "") {
    throw new HttpError(500, `${name.toLowerCase()}_missing`);
  }
  return value;
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function jsonError(status: number, error: string): Response {
  return json({ error }, status);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
