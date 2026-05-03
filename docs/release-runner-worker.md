# Release Runner Worker setup
Use this only if you host your own token broker for `auth-mode: public-app`.

If you are using the default hosted broker (`https://release-runner.sargeant.workers.dev`), you can skip this page.

## 1) Prepare GitHub App
Create a GitHub App with at least:

- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read-only

Install it on the repositories you want to support.

## 2) Deploy the Worker
From this repository:

```bash
cd worker
npm install
npx wrangler deploy
```

## 3) Set Worker secrets
Configure:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `OIDC_AUDIENCE` (for example `release-runner`)

Optional:

- `ALLOWED_REPOSITORIES` (comma-separated `org/repo` list)
- `TOKEN_PERMISSIONS` (JSON or `key:level` pairs)

## 4) Point consumer workflows to your broker
In consumer repositories:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    auth-mode: public-app
    token-broker-url: https://<your-worker-domain>
    oidc-audience: release-runner
```

## 5) Validate end-to-end
Trigger a release workflow and verify:

- OIDC token exchange succeeds
- release steps can create tags/PRs as expected
- token scope is restricted to the target repository
