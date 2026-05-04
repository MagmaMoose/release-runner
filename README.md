# Release Runner

<p align="center">
  <img src="docs/release-runner-logo.png" alt="Release Runner" width="200">
</p>


[![CI](https://github.com/calebsargeant/semantic-release/actions/workflows/ci.yaml/badge.svg)](https://github.com/calebsargeant/semantic-release/actions/workflows/ci.yaml)
[![Release](https://github.com/calebsargeant/semantic-release/actions/workflows/release.yaml/badge.svg)](https://github.com/calebsargeant/semantic-release/actions/workflows/release.yaml)
[![Docs](https://github.com/calebsargeant/semantic-release/actions/workflows/docs-pages.yaml/badge.svg)](https://semver.calebsargeant.com)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Release%20Runner-purple?logo=github)](https://github.com/marketplace/actions/release-runner)
[![License](https://img.shields.io/github/license/calebsargeant/semantic-release)](https://github.com/calebsargeant/semantic-release/blob/main/LICENSE)

Release Runner is the GitHub Marketplace Action published as
`calebsargeant/semantic-release@v1`.

Use it when a repository should create semantic version releases from GitHub
Actions. It can create Git tags and GitHub Releases, and it can optionally build
or promote GHCR Docker images with the same release tag.

Full setup docs: [semver.calebsargeant.com](https://semver.calebsargeant.com)

## What You Need

### 1. Install the Release Runner GitHub App

If you use the default `public-app` auth mode (recommended):

- Install the [Release Runner GitHub App](https://github.com/apps/release-runner/installations/new)
  on the repository or organization before your first release run.
- Alternatively, you can use a
  [private GitHub App or the built-in workflow token](https://semver.calebsargeant.com/concepts/#release-write-token).

### 2. Bypass Branch Rulesets

If branch rulesets or branch protection rules guard your release branches,
allow the Release Runner app to bypass:

- Tag creation and pushes
- Release commits (when the versioning tool updates files)
- Promotion branches (`promote/<environment>/<version>`)
- Opening promotion pull requests

Without this, the app cannot push tags or version bumps.
See the full [branch protection checklist](https://semver.calebsargeant.com/organization-setup/#branch-protection-checklist).

### 3. Choose a Release Tool

Add one supported release-tool config to your repository:

| Tool | Input | Config file |
|---|---|---|
| python-semantic-release | `semantic-release-python` | `pyproject.toml` |
| semantic-release for Node.js | `semantic-release-npm` | `.releaserc.json` or `package.json` |
| GitVersion | `gitversion` | `GitVersion.yml` |
| release-please | `release-please` | `release-please-config.json` |

- semantic-release and release-please use
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) —
  `fix` → patch, `feat` → minor, breaking changes → major.
- GitVersion follows your `GitVersion.yml`.

## Production Release

This creates stable releases from `main`, for example `v1.0.0`.

Before running it with the default auth mode:

- Complete the [setup steps above](#what-you-need).
- Give the release job `id-token: write`.

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
[Other auth modes](https://semver.calebsargeant.com/concepts/#release-write-token)
are also supported.

## Docker Image Releases

Set `image_name` to build PR images in CI mode and promote or rebuild them
with the release tag in release mode:

- Your repository needs a [Docker Bake file](https://semver.calebsargeant.com/repository-setup/#2-choose-docker-or-version-only)
  that declares the `REGISTRY`, `IMAGE_NAME`, `VERSION`, and `PLATFORMS` variables.
- CI mode builds `pr-<number>` images from pull requests.
- Release mode promotes or rebuilds the image with the release tag.

## Environment Releases

Release Runner supports multiple environments with
[two release models](https://semver.calebsargeant.com/choose-your-setup/):

- **Trunk-Based Development** — one branch creates release tags for one or
  more environments.
- **Branch-Based Development** — long-lived branches map to environments.

For example, `["dev", "staging", "prod"]` creates prerelease tags for `dev`
and `staging`, then stable tags for `prod`.

## Outputs

| Output | Meaning |
|---|---|
| `version` | Semver without prefix, for example `1.0.0` |
| `tag` | Full Git tag, for example `v1.0.0` |
| `released` | `true` when a new release was created |
| `is-prerelease` | `true` for prerelease environments |
| `resolved-environment` | Environment selected for the run |

For the complete input/output reference, see the
[action reference](https://semver.calebsargeant.com/reference/action-inputs-outputs/).
