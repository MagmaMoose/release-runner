# TBD Release

A GitHub Marketplace action for **Trunk-Based Development** semantic release management.

Calculates and publishes the correct semantic version for any environment in a
dual-, tri-, or quad-environment TBD pipeline. Supports multiple versioning tools
and keeps the version tag format consistent regardless of which tool is used underneath.

---

## The model

```
main (trunk)
  │
  ├─► merge  →  v1.2.3-dev.1    (DEV — automated, every merge)
  │                  │
  │            QA sign-off
  │                  │
  ├──────────────►  v1.2.3-rc.1  (STAGING — gated)
  │                       │
  │               QA + Stakeholder
  │                       │
  └──────────────────────► v1.2.3   (PROD — gated, stable)
```

One branch. One image, built once. Version tag is the promotion mechanism.
The last environment in your `environments` array always produces a stable semver tag.
All preceding environments produce prerelease tags with configurable identifiers.

---

## Quick start

```yaml
- uses: calebsargeant/tbd-release@v1
  with:
    versioning-tool: semantic-release-python
    environment:     dev          # or staging, prod — drives stable vs prerelease
    environments:    '["dev", "staging", "prod"]'
    prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    github-token:    ${{ secrets.GITHUB_TOKEN }}
```

**That single step produces `v1.2.3-dev.1` when run for `dev`, `v1.2.3-rc.1` for `staging`,
and `v1.2.3` for `prod`.** No extra logic required.

---

## Environment profiles

| Profile | `environments` | `prerelease-identifiers` | Tag examples |
|---|---|---|---|
| **Dual** | `["dev", "prod"]` | `{"dev": "dev"}` | `v1.2.3-dev.1` → `v1.2.3` |
| **Tri** *(default)* | `["dev", "staging", "prod"]` | `{"dev": "dev", "staging": "rc"}` | `v1.2.3-dev.1` → `v1.2.3-rc.1` → `v1.2.3` |
| **Quad** | `["dev", "tst", "acc", "prd"]` | `{"dev": "dev", "tst": "alpha", "acc": "beta"}` | `v1.2.3-dev.1` → `v1.2.3-alpha.1` → `v1.2.3-beta.1` → `v1.2.3` |

Environment names are fully configurable — use any naming convention your org prefers.

---

## Supported versioning tools

| `versioning-tool` | Tool | Config file |
|---|---|---|
| `semantic-release-python` *(default)* | [python-semantic-release](https://python-semantic-release.readthedocs.io/) v10 | `pyproject.toml` |
| `semantic-release-npm` | [semantic-release](https://semantic-release.gitbook.io/) v24 | `.releaserc.json` / `package.json` |
| `gitversion` | [GitVersion](https://gitversion.net/) v6 via gittools/actions | `GitVersion.yml` |
| `release-please` | [release-please](https://github.com/googleapis/release-please) v4 | `release-please-config.json` |

Example config files for each tool are in [`examples/config/`](examples/config/).

---

## Inputs

### Core

| Input | Required | Default | Description |
|---|---|---|---|
| `versioning-tool` | | `semantic-release-python` | Versioning tool to use |
| `environment` | ✅ | — | Target environment. Must be in `environments`. |
| `environments` | | `["dev","staging","prod"]` | Ordered JSON array. Last entry = production. |
| `prerelease-identifiers` | | `{"dev":"dev","staging":"rc"}` | JSON map of env → prerelease token |
| `tag-prefix` | | `v` | Git tag prefix |

### Auth

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | — | GitHub token for git push and releases. Use `secrets.GITHUB_TOKEN`. |
| `app-id` | | `''` | GitHub App ID. Generates a short-lived token to bypass branch protection. |
| `app-private-key` | | `''` | GitHub App private key (PEM). Required when `app-id` is set. |

### Behaviour

| Input | Default | Description |
|---|---|---|
| `working-directory` | `.` | Directory containing the versioning config file |
| `create-release` | `true` | Create a GitHub Release |
| `changelog` | `true` | Update CHANGELOG.md |

### Tool-specific

| Input | Default | For tool |
|---|---|---|
| `gitversion-spec` | `6.x` | `gitversion` |
| `gitversion-config` | `GitVersion.yml` | `gitversion` |
| `release-please-release-type` | `simple` | `release-please` |
| `release-please-config-file` | `release-please-config.json` | `release-please` |

---

## Outputs

| Output | Description |
|---|---|
| `version` | Semver string without prefix (e.g., `1.2.3` or `1.2.3-rc.1`) |
| `tag` | Full git tag (e.g., `v1.2.3` or `v1.2.3-rc.1`) |
| `is-prerelease` | `"true"` if this environment produces a prerelease |
| `released` | `"true"` if a new version was created and published |
| `prerelease-identifier` | The prerelease identifier (e.g., `rc`, `dev`). Empty for production. |
| `resolved-environment` | The environment that was targeted |

---

## Full tri-environment example

```yaml
# .github/workflows/release.yaml
name: Release

on:
  push:
    branches: [main]
    paths-ignore: ['**.md', 'CHANGELOG.md']
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, prod]

jobs:
  release:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-release.yaml@v1
    with:
      versioning-tool: semantic-release-python
      environment: ${{ github.event_name == 'push' && 'dev' || inputs.environment }}
      environments: '["dev", "staging", "prod"]'
      prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    secrets: inherit
```

Caller workflow examples for all environment profiles are in [`examples/`](examples/).

---

## Using outputs downstream

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.tbd.outputs.version }}
      tag:     ${{ steps.tbd.outputs.tag }}
    steps:
      - uses: calebsargeant/tbd-release@v1
        id: tbd
        with:
          versioning-tool: semantic-release-python
          environment:     dev
          github-token:    ${{ secrets.GITHUB_TOKEN }}

  build:
    needs: release
    if: needs.release.outputs.version != ''
    runs-on: ubuntu-latest
    steps:
      - run: docker build -t my-app:${{ needs.release.outputs.version }} .
```

---

## GitHub App setup (recommended for branch protection)

When `main` is protected, `GITHUB_TOKEN` cannot push release commits. Use a GitHub App token instead:

1. Create a GitHub App (Settings → Developer settings → GitHub Apps → New App)
   - Permissions: **Contents: Read and write**, **Metadata: Read**
2. Install the app on your repositories
3. Note the App ID and generate a private key
4. Add two repo secrets:
   - `SEMANTIC_RELEASE_APP_ID` — the numeric App ID
   - `SEMANTIC_RELEASE_APP_PRIVATE_KEY` — the full `.pem` file contents
5. Pass them to the action via `app-id` and `app-private-key`

---

## What's included in this repository

| Path | Purpose |
|---|---|
| [`action.yml`](action.yml) | **This marketplace action** — generic TBD versioning |
| [`.github/workflows/tbd-ci.yaml`](.github/workflows/tbd-ci.yaml) | Reusable: PR image build with TBD branch name enforcement |
| [`.github/workflows/tbd-release.yaml`](.github/workflows/tbd-release.yaml) | Reusable: wraps this action for use as a workflow_call target |
| [`.github/workflows/tbd-deploy-cloud-run.yaml`](.github/workflows/tbd-deploy-cloud-run.yaml) | Reusable: image promotion + Cloud Run deployment (optional) |
| [`.github/actions/cloud-run-deploy/`](.github/actions/cloud-run-deploy/) | Sub-action: GHCR → GAR mirror + `gcloud run deploy` |
| [`examples/`](examples/) | Caller workflow examples for dual/tri/quad environments |
| [`examples/config/`](examples/config/) | Config file templates for each versioning tool |

---

## License

MIT — see [LICENSE](LICENSE).
