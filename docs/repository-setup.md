# Repository Setup

Use this page when adding `calebsargeant/semantic-release@v1` to a repository.

## 1. Add Release Tool Configuration

Pick one versioning engine and commit its config.

| `versioning-tool` | Required config |
|---|---|
| `semantic-release-python` | `pyproject.toml` |
| `semantic-release-npm` | `.releaserc.json` or `package.json` |
| `gitversion` | `GitVersion.yml` |
| `release-please` | `release-please-config.json` |

Template files are available in `examples/config/` in the repository.

## 2. Decide Whether Docker Is In Scope

Leave `image_name` empty for version-only releases.

Set `image_name` when the action should build or promote container images. The repository then needs a Docker Bake file, usually `docker-bake.hcl`.

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

Multi-image repositories should make `default` a Bake group. Release Runner expands the group and processes every target.

## 3. Add Pull Request CI When Docker Is Enabled

CI mode builds the PR image tag that release mode later promotes.

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

For BBD repositories, disable TBD branch naming checks:

```yaml
with:
  mode: ci
  image_name: my-app
  enforce_branch_naming: 'false'
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

## 4. Add A Release Workflow

### Single Production Environment

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

### TBD With Promotion PRs

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

### BBD Branch Mapping

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

## 5. Use Outputs For Deployment

Release Runner does not deploy your application. Use outputs in later jobs.

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

1. Open a PR and confirm `mode: ci` publishes `pr-<number>` if Docker is enabled.
2. Merge a Conventional Commit and confirm a tag is created.
3. Confirm the release tool updates only expected files.
4. Confirm a promotion PR is created when using `tbd-pr`.
5. Confirm downstream deployment jobs read `tag`, `version`, and `released` correctly.
