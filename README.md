# Release Runner

Release Runner is the published GitHub Marketplace Action at `calebsargeant/semantic-release@v1`.

For setup guides, environment patterns, authentication choices, and anything beyond the Marketplace Action interface, start with [semver.calebsargeant.com](https://semver.calebsargeant.com).

## What The Action Does

Release Runner is a composite GitHub Action for repositories that want one release step to:

- run semantic versioning
- create git tags and GitHub Releases
- publish Docker PR images in CI
- promote Docker images during release runs
- optionally open promotion PRs between environments

It supports three deployment models:

| Model | Use it when | Environment resolution |
|---|---|---|
| `tbd` | one trunk branch releases directly to a named environment | pass `environment` |
| `tbd-pr` | one trunk branch promotes by reviewed PRs | pass the first `environment`; promotion PR branches resolve later environments |
| `bbd` | long-lived branches map to environments | pass `branch-map` |

It supports four versioning engines:

| `versioning-tool` | Config expected in your repo |
|---|---|
| `semantic-release-python` | `pyproject.toml` |
| `semantic-release-npm` | `.releaserc.json` or `package.json` |
| `gitversion` | `GitVersion.yml` |
| `release-please` | `release-please-config.json` |

## Minimal Release Job

This creates a production release from `main` without Docker image promotion.

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: calebsargeant/semantic-release@v1
        id: release
        with:
          mode: release
          environment: prod
          environments: '["prod"]'
          prerelease-identifiers: '{}'
```

By default, release jobs use `auth-mode: public-app`, which exchanges the workflow OIDC token for a short-lived GitHub App installation token. Grant `id-token: write` and install the Release Runner app for repositories that use the hosted public app mode.

If you prefer to use the workflow token instead:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    auth-mode: github-token
    github-token: ${{ secrets.GITHUB_TOKEN }}
    environment: prod
    environments: '["prod"]'
    prerelease-identifiers: '{}'
```

## CI Docker Build

Use `mode: ci` on pull requests when you want the action to build and push a `pr-<number>` image to GHCR. The action reads your Docker Bake file and injects:

- `REGISTRY`
- `IMAGE_NAME`
- `VERSION`
- `PLATFORMS`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

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

## TBD With Promotion PRs

This pattern releases first to `dev`, then opens reviewed promotion PRs for `staging` and `prod`.

```yaml
name: Release

on:
  push:
    branches: [main]
    paths-ignore: ['**.md', '.gitignore', 'LICENSE', 'CHANGELOG.md']
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
        id: release
        with:
          mode: release
          deployment-model: tbd-pr
          environment: ${{ github.event_name == 'push' && 'dev' || '' }}
          environments: '["dev", "staging", "prod"]'
          prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
          image_name: my-app
          create-promotion-pr: 'true'
```

Release order:

| Step | Version example | Image behavior |
|---|---|---|
| feature PR CI | `pr-42` | Build and push the PR image |
| merge to `main` | `v1.2.3-dev.1` | Promote `pr-42` to the dev tag |
| merge `promote/staging/...` | `v1.2.3-rc.1` | Promote the previous prerelease image |
| merge `promote/prod/...` | `v1.2.3` | Promote to the stable tag and `latest` |

## BBD Branch Mapping

Use `deployment-model: bbd` when each environment has its own long-lived branch.

```yaml
name: Release

on:
  push:
    branches: [dev, staging, main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: calebsargeant/semantic-release@v1
        with:
          mode: release
          deployment-model: bbd
          branch-map: '{"dev": "dev", "staging": "staging", "main": "prod"}'
          environments: '["dev", "staging", "prod"]'
          prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
          image_name: my-app
```

For BBD pull request CI, set `enforce_branch_naming: 'false'` because the destination branches are environment names.

## Docker Bake Contract

For a single image:

```hcl
variable "VERSION"    { default = "latest" }
variable "REGISTRY"   { default = "ghcr.io" }
variable "IMAGE_NAME" { default = "my-org/my-app" }
variable "PLATFORMS"  { default = "linux/amd64" }

target "default" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = split(",", PLATFORMS)
  tags       = ["${REGISTRY}/${IMAGE_NAME}:${VERSION}"]
}
```

For multiple images, make `default` a Bake group and give each target its own tag. Release Runner expands the group and promotes each target.

## Key Inputs

| Input | Default | Notes |
|---|---|---|
| `mode` | `release` | `ci` builds PR images; `release` versions and optionally promotes |
| `auth-mode` | `public-app` | `public-app`, `private-app`, `github-token`, or `auto` |
| `deployment-model` | `tbd` | `tbd`, `tbd-pr`, or `bbd` |
| `versioning-tool` | `semantic-release-python` | Selects the release engine |
| `environment` | `''` | Required for `tbd`; first environment for initial `tbd-pr` releases |
| `environments` | `["dev", "staging", "prod"]` | Ordered promotion path; last entry is stable |
| `prerelease-identifiers` | `{"dev": "dev", "staging": "rc"}` | Omit the production environment |
| `image_name` | `''` | Enables Docker build or promotion when set |
| `bake_file` | `docker-bake.hcl` | Docker Bake file path |
| `bake_target` | `default` | Target or group to build/promote |
| `create-promotion-pr` | `false` | Only used with `deployment-model: tbd-pr` |

The complete generated input and output reference is maintained at [semver.calebsargeant.com/reference/action-inputs-outputs/](https://semver.calebsargeant.com/reference/action-inputs-outputs/).

## Outputs

| Output | Meaning |
|---|---|
| `version` | Semver without prefix, for example `1.2.3` |
| `tag` | Full git tag, for example `v1.2.3` |
| `released` | `true` when a new version was created |
| `is-prerelease` | `true` for prerelease environments |
| `prerelease-identifier` | Prerelease token such as `dev` or `rc` |
| `resolved-environment` | Environment selected for the run |

## Repository Requirements

Before using the action, your repository needs:

- one supported versioning config file
- Conventional Commit history, or a release tool config that matches your process
- `contents: read` in the workflow and a token/app that can write tags/releases
- `packages: write` when Docker promotion is enabled
- a Docker Bake file when `image_name` is set

See the full setup guide at [semver.calebsargeant.com](https://semver.calebsargeant.com) for organization auth setup, broker details, environment examples, and troubleshooting.
