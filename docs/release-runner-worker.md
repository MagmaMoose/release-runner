# Release Runner Worker

This page is only for teams that host their own token broker for `auth-mode: public-app`.

Skip it when you use the hosted broker configured by the action default:

```yaml
with:
  auth-mode: public-app
```

## What The Worker Does

The Worker exchanges a GitHub Actions OIDC token for a short-lived GitHub App installation token.

It accepts only `POST /token`.

Request checks:

- request body contains `oidcToken`, `owner`, and `repo`
- OIDC token is issued by GitHub Actions
- OIDC audience matches `OIDC_AUDIENCE`
- OIDC `repository` claim matches `owner/repo`
- repository is allowed by `ALLOWED_REPOSITORIES`, when configured
- GitHub App is installed on the target repository

Successful responses include the installation token, expiry, and repository.

## GitHub App Requirements

Create a GitHub App with these repository permissions:

| Permission | Access |
|---|---|
| Contents | Read and write |
| Pull requests | Read and write |
| Metadata | Read-only |

Add `Workflows: Read and write` only if release automation must edit workflow files.

Disable the webhook unless you need it for another process. Install the app on every repository the broker should support.

## Deploy The Worker

From the repository root:

```bash
npm ci
npm --workspace worker run deploy
```

Or from `worker/`:

```bash
npm install
npx wrangler deploy
```

## Configure Secrets

Required Worker secrets:

| Secret | Value |
|---|---|
| `GITHUB_APP_ID` | Numeric GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Full private key PEM |
| `OIDC_AUDIENCE` | Audience expected from GitHub Actions, usually `release-runner` |

Optional settings:

| Setting | Purpose |
|---|---|
| `ALLOWED_REPOSITORIES` | Comma-separated allow-list such as `org/api,org/web` |
| `TOKEN_PERMISSIONS` | JSON or delimited permissions; defaults to `contents:write,pull_requests:write` |

Set secrets with Wrangler:

```bash
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put OIDC_AUDIENCE
```

## Point Repositories At Your Broker

Consumer workflow:

```yaml
permissions:
  contents: read
  id-token: write
  packages: write

steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
      auth-mode: public-app
      token-broker-url: https://your-worker.example.com
      oidc-audience: release-runner
```

The workflow audience and Worker `OIDC_AUDIENCE` must match.

## Operational Checks

Before using the broker broadly:

1. Trigger a release workflow in a test repository.
2. Confirm missing or bad OIDC tokens return safe error codes.
3. Confirm a repository outside `ALLOWED_REPOSITORIES` is rejected when the allow-list is set.
4. Confirm the GitHub App token is scoped to the requested repository.
5. Confirm branch protection allows the GitHub App to create the release refs your workflow needs.

Keep the private key only in Cloudflare Worker secrets. Do not commit it to source control, `wrangler.jsonc`, workflow files, repository variables, or docs.
