# Repository Setup

Use this checklist after the organization-level app and ruleset setup is done.

## 1. Add A Versioning Config

Pick one release tool and commit its config.

| `versioning-tool` | Required config |
|---|---|
| `semantic-release-python` | `pyproject.toml` |
| `semantic-release-npm` | `.releaserc.json` or `package.json` |
| `gitversion` | `GitVersion.yml` |
| `release-please` | `release-please-config.json` |

Template files live in `examples/config/` in the repository.

## 2. Choose Docker Or Version-Only

If Release Runner should only create versions, tags, and GitHub Releases, do not set `image_name`.

If Release Runner should build and promote container images, add:

- a Docker Bake file, usually `docker-bake.hcl`
- a PR workflow using `mode: ci`
- `image_name` in the release workflow
- `packages: write` permissions

Single-image Bake target:

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

For multiple images, make `default` a Bake group and give each target its own tag.

## 3. Add CI For Docker Repositories

Skip this section for version-only releases.

TBD pull request CI:

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

BBD pull request CI:

```yaml
name: CI

on:
  pull_request:
    branches: [dev, staging, main]
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
          enforce_branch_naming: 'false'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## 4. Add The Release Workflow

### Production-Only

Use this when every release from `main` is stable.

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

Add `packages: write` and `image_name` when Docker promotion is enabled.

### TBD Promotion PRs

Use this when a merge to `main` releases to the first environment and the action opens promotion PRs for the next environments.

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

Remove `packages: write` and `image_name` for a version-only flow.

### BBD Branch Mapping

Use this when each environment has its own long-lived branch.

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
        id: release
        with:
          mode: release
          deployment-model: bbd
          branch-map: '{"dev": "dev", "staging": "staging", "main": "prod"}'
          environments: '["dev", "staging", "prod"]'
          prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
          image_name: my-app
```

Remove `packages: write` and `image_name` for a version-only flow.

## 5. Use Outputs In Deployment Jobs

Release Runner stops at release orchestration. Deployment jobs should consume its outputs.

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    outputs:
      version: ${{ steps.release.outputs.version }}
      tag: ${{ steps.release.outputs.tag }}
      released: ${{ steps.release.outputs.released }}
    steps:
      - uses: calebsargeant/semantic-release@v1
        id: release
        with:
          mode: release
          environment: prod
          environments: '["prod"]'
          prerelease-identifiers: '{}'

  deploy:
    needs: release
    if: needs.release.outputs.released == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy ${{ needs.release.outputs.tag }}"
```

## 6. Validate The First Run

Before relying on the workflow:

1. Open a PR and confirm Docker CI publishes `pr-<number>` when Docker is enabled.
2. Merge a Conventional Commit and confirm a tag is created.
3. Confirm the selected versioning tool updates only expected files.
4. Confirm a promotion PR is created when using `tbd-pr`.
5. Confirm downstream deployment jobs read `tag`, `version`, and `released` correctly.
