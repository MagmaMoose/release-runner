import { handleRequest, type BrokerEnv } from "../src/index";

const env: BrokerEnv = {
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----",
  OIDC_AUDIENCE: "release-runner"
};

function tokenRequest(body: Record<string, unknown>): Request {
  return new Request("https://broker.example.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function deps(options: {
  repository?: string;
  githubResponses?: Response[];
  verifyThrows?: boolean;
} = {}) {
  const calls: Request[] = [];
  const githubResponses = [...(options.githubResponses ?? [])];

  return {
    calls,
    deps: {
      verifyOidcToken: async () => {
        if (options.verifyThrows) {
          throw new Error("bad oidc");
        }
        return {
          repository: options.repository ?? "octo-org/octo-repo"
        };
      },
      createGitHubAppJwt: async () => "app.jwt",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));
        return githubResponses.shift() ?? Response.json({ id: 42 });
      },
      now: () => new Date("2026-05-03T12:00:00Z")
    }
  };
}

describe("token broker", () => {
  it("rejects missing fields with 400", async () => {
    const response = await handleRequest(tokenRequest({ owner: "octo-org" }), env);

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: "missing_required_fields" });
  });

  it("rejects invalid OIDC tokens with 401", async () => {
    const { deps: injected } = deps({ verifyThrows: true });
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "bad.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      env,
      injected
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "invalid_oidc_token" });
  });

  it("rejects repo claim mismatch with 403", async () => {
    const { deps: injected } = deps({ repository: "octo-org/other-repo" });
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "valid.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      env,
      injected
    );

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ error: "repo_mismatch" });
  });

  it("rejects repos outside the allow-list with 403", async () => {
    const { deps: injected } = deps();
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "valid.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      {
        ...env,
        ALLOWED_REPOSITORIES: "octo-org/allowed-repo"
      },
      injected
    );

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ error: "repo_not_allowed" });
  });

  it("returns 404 when the app is not installed", async () => {
    const { deps: injected } = deps({
      githubResponses: [new Response("{}", { status: 404 })]
    });
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "valid.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      env,
      injected
    );

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ error: "app_not_installed" });
  });

  it("returns a generic error when GitHub token creation fails", async () => {
    const { deps: injected } = deps({
      githubResponses: [
        Response.json({ id: 42 }),
        new Response('{"token":"do-not-leak"}', { status: 500 })
      ]
    });
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "valid.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      env,
      injected
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe('{"error":"github_token_create_failed"}');
    expect(body).not.toContain("do-not-leak");
  });

  it("creates a repo-scoped installation token", async () => {
    const { calls, deps: injected } = deps({
      githubResponses: [
        Response.json({ id: 42 }),
        Response.json({
          token: "installation-token",
          expires_at: "2026-05-03T13:00:00Z"
        })
      ]
    });
    const response = await handleRequest(
      tokenRequest({
        oidcToken: "valid.jwt",
        owner: "octo-org",
        repo: "octo-repo"
      }),
      env,
      injected
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      token: "installation-token",
      expires_at: "2026-05-03T13:00:00Z",
      repository: "octo-org/octo-repo"
    });

    const tokenRequestBody = await calls[1].json();
    expect(tokenRequestBody).toEqual({
      repositories: ["octo-repo"],
      permissions: {
        contents: "write",
        pull_requests: "write"
      }
    });
  });
});
