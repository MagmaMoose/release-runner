# Repository setup
Use this checklist in each consumer repository.

## 1) Add versioning config
Choose one versioning engine and commit its config:

- `pyproject.toml` for `semantic-release-python` (default)
- `.releaserc.json` for `semantic-release-npm`
- `GitVersion.yml` for `gitversion`
- `release-please-config.json` for `release-please`

Reference templates live in this repository under `examples/config/`.

## 2) Add CI workflow (pull requests)
Example:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      pull-requests: read
    steps:
      - uses: calebsargeant/semantic-release@v1
        with:
          mode: ci
          image_name: my-app
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## 3) Add release workflow (push/merge)
TBD with PR-based promotion example:

```yaml
name: Release
on:
  push:
    branches: [main]
  pull_request:
    types: [closed]
    branches: [main]
jobs:
  release:
    if: |
      github.event_name == 'push' ||
      (
        github.event.pull_request.merged == true &&
        startsWith(github.head_ref, 'promote/')
      )
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: calebsargeant/semantic-release@v1
        with:
          mode: release
          deployment-model: tbd-pr
          environment: ${{ github.event_name == 'push' && 'dev' || '' }}
          environments: '["dev", "staging", "prod"]'
          prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
          image_name: my-app
          create-promotion-pr: 'true'
```

For branch-based model examples, use `examples/bbd/`.

## 4) Confirm required permissions
At minimum, set workflow/job permissions for release jobs to include:

- `contents: write` capability through token/app strategy
- `id-token: write` when using `auth-mode: public-app`
- `packages: write` if Docker image publish/promote is enabled

## 5) Run a dry onboarding validation
Before enabling broad rollout:

1. Open a test PR and verify CI publishes expected `pr-<N>` image tag (if Docker is enabled).
2. Merge and verify release tag/version output.
3. Confirm promotion PR behavior (for `tbd-pr`).
