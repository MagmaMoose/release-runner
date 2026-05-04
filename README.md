# Release Runner

Release Runner is the GitHub Marketplace Action published as
`calebsargeant/semantic-release@v1`.

Use it when a repository should create semantic version releases from GitHub
Actions. It can create Git tags and GitHub Releases, and it can optionally build
or promote GHCR Docker images with the same release tag.

Full setup docs: [semver.calebsargeant.com](https://semver.calebsargeant.com)

## What You Need

Before using the action, add one supported release-tool config to your
repository.

| Tool | Input | Config file |
|---|---|---|
| python-semantic-release | `semantic-release-python` | `pyproject.toml` |
| semantic-release for Node.js | `semantic-release-npm` | `.releaserc.json` or `package.json` |
| GitVersion | `gitversion` | `GitVersion.yml` |
| release-please | `release-please` | `release-please-config.json` |

The semantic-release and release-please examples use
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), where
`fix` creates a patch release, `feat` creates a minor release, and breaking
changes create major releases. GitVersion follows your `GitVersion.yml`.

## Production Release

This creates stable releases from `main`, for example `v1.0.0`.

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

By default, release jobs use the Release Runner GitHub App.
[Install the app](https://github.com/apps/release-runner/installations/new) on
the repository or organization, then give the job `id-token: write`.

To use the workflow token instead:

```yaml
permissions:
  contents: write

steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
      auth-mode: github-token
      github-token: ${{ secrets.GITHUB_TOKEN }}
      environment: prod
      environments: '["prod"]'
      prerelease-identifiers: '{}'
```

## Docker Image Releases

Set `image_name` when the release should also tag a GHCR image.

For pull requests, build a `pr-<number>` image:

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

For releases, promote or rebuild the image with the release tag:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    environment: prod
    environments: '["prod"]'
    prerelease-identifiers: '{}'
    image_name: my-app
```

Your Docker Bake file must use the variables `REGISTRY`, `IMAGE_NAME`,
`VERSION`, and `PLATFORMS`.

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

## Environment Releases

Release Runner supports two release models.

| Model | Use when | Docs |
|---|---|---|
| Trunk-Based Development | One branch creates release tags for one or more environments | [TBD setup](https://semver.calebsargeant.com/choose-your-setup/#trunk-based-development) |
| Branch-Based Development | Long-lived branches map to environments | [BBD setup](https://semver.calebsargeant.com/choose-your-setup/#branch-based-development) |

For example, `["dev", "staging", "prod"]` creates prerelease tags for `dev`
and `staging`, then stable tags for `prod`.

```yaml
with:
  mode: release
  deployment-model: tbd-pr
  environment: ${{ github.event_name == 'push' && 'dev' || '' }}
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
  create-promotion-pr: 'true'
```

## Outputs

| Output | Meaning |
|---|---|
| `version` | Semver without prefix, for example `1.0.0` |
| `tag` | Full Git tag, for example `v1.0.0` |
| `released` | `true` when a new release was created |
| `is-prerelease` | `true` for prerelease environments |
| `resolved-environment` | Environment selected for the run |

Use the full docs for setup choices, authentication details, release models,
Docker promotion behavior, and the generated input/output reference:
[semver.calebsargeant.com](https://semver.calebsargeant.com).
