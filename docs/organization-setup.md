# Organization Setup

Do this once for an organization, then reuse the same decisions across repositories.

## Choose Authentication

Release Runner needs a token for checkout, tags, GitHub Releases, promotion branches, and promotion PRs. Docker registry login still uses `github-token` or the workflow `GITHUB_TOKEN`.

| Auth mode | Best fit | Required workflow permission |
|---|---|---|
| `public-app` | Default hosted app/broker flow; no private key in consumer repos | `id-token: write` |
| `private-app` | Organization-owned GitHub App and private key | none beyond normal job permissions |
| `github-token` | Simple repos where `GITHUB_TOKEN` can write releases/tags | none beyond normal job permissions |
| `auto` | Mixed repos; prefer private app when secrets are configured | depends on selected token |

## Public App Mode

Use `auth-mode: public-app` when repositories can install the hosted Release Runner GitHub App.

Checklist:

- Install the app on each repository that will release.
- Grant release jobs `id-token: write`.
- Keep the default `token-broker-url` unless you run your own broker.
- Allow the app through branch protection or repository rulesets when releases need to push protected refs.

Workflow shape:

```yaml
permissions:
  contents: read
  id-token: write
  packages: write

steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
```

## Private App Mode

Use `auth-mode: private-app` when your organization wants to own the GitHub App, private key, permissions, and installation lifecycle.

Create a GitHub App with repository permissions:

| Permission | Access |
|---|---|
| Contents | Read and write |
| Pull requests | Read and write |
| Metadata | Read-only |

Add `Workflows: Read and write` only if your release process intentionally edits workflow files.

Then:

1. Install the app on target repositories.
2. Save the app ID as `SEMANTIC_RELEASE_APP_ID`.
3. Generate a private key and save the full PEM as `SEMANTIC_RELEASE_APP_PRIVATE_KEY`.
4. Allow the app in any branch protection or rulesets that would otherwise block release writes.

Workflow input:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    auth-mode: private-app
    app-id: ${{ secrets.SEMANTIC_RELEASE_APP_ID }}
    app-private-key: ${{ secrets.SEMANTIC_RELEASE_APP_PRIVATE_KEY }}
```

## Workflow Token Mode

Use `auth-mode: github-token` when the default workflow token is allowed to create the release commit, tag, GitHub Release, and any promotion PR branch.

```yaml
permissions:
  contents: write
  pull-requests: write
  packages: write

steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
      auth-mode: github-token
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

This is the simplest mode, but it often fails in repositories with strict protected branches or rulesets.

## Branch Protection And Rulesets

Confirm the selected actor can perform the writes your workflow needs:

- create and push tags
- create GitHub Releases
- push release commits when the versioning tool updates files
- push `promote/<environment>/<version>` branches when `create-promotion-pr: 'true'`
- open promotion pull requests

If your rulesets require signed commits, linear history, status checks, or specific bypass actors, configure the selected GitHub App or token actor before enabling releases.

## Package Permissions

When `image_name` is set, CI and release jobs need package access:

- `packages: write` for GHCR publish/promote
- package visibility that allows the repository workflow to push
- a Docker Bake file in the repository

Version-only releases do not need package permissions.
