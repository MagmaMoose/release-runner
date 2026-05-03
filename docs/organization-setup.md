# Organization setup
This page covers one-time setup at organization level before onboarding repositories.

## 1) Pick an authentication mode
Use one of these approaches:

- `public-app` (default): easiest onboarding, no app private key in consumer repositories
- `private-app`: best for strict enterprise ownership and control
- `github-token`: simplest, but may not bypass protected branch restrictions

## 2) Configure branch protection/rulesets
Whichever auth mode you choose, ensure the actor used by releases can:

- push release commits/tags
- create promotion branches
- open promotion pull requests

For GitHub App modes, allow the app in relevant branch protection/rulesets.

## 3) Configure GitHub Actions defaults
Ensure organization/repository settings allow workflows to:

- create and approve pull requests (if your process needs this)
- write contents when running release workflows
- request OIDC tokens (`id-token: write`) when using `public-app`

## 4) If using `private-app`, prepare org/repo secrets
Store:

- `SEMANTIC_RELEASE_APP_ID`
- `SEMANTIC_RELEASE_APP_PRIVATE_KEY`

Then pass them in workflow inputs:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    auth-mode: private-app
    app-id: ${{ secrets.SEMANTIC_RELEASE_APP_ID }}
    app-private-key: ${{ secrets.SEMANTIC_RELEASE_APP_PRIVATE_KEY }}
```

## 5) If using `public-app`, install the app where needed
Install the shared app (or your own public app) on all target repositories/org scopes before enabling release automation.
