# TBD Release

A GitHub Marketplace action for semantic release management with built-in Docker image promotion.

Supports **Trunk-Based Development** (single `main` branch) and **branch-based** (GitFlow-esque) pipelines. Calculates the correct semantic version for any environment, then promotes the GHCR image built during CI to the new version tag — no rebuilds.

---

## The model

```
── Trunk-Based Development (TBD) ──────────────────────────────────────────────

main (trunk)
  │
  ├─► merge  →  version  →  v1.2.3-dev.1    Image: pr-N → v1.2.3-dev.1
  │                 │
  │           QA sign-off
  │                 │
  ├──────────────► v1.2.3-rc.1              Image: v1.2.3-dev.1 → v1.2.3-rc.1
  │                      │
  │              QA + Stakeholder
  │                      │
  └─────────────────────► v1.2.3             Image: v1.2.3-rc.1 → v1.2.3 + :latest


── Branch-Based (GitFlow-esque) ───────────────────────────────────────────────

feat/*  ──► dev   →  v1.2.3-dev.1    Image: pr-N → v1.2.3-dev.1
                │
                ▼
            staging  →  v1.2.3-rc.1  Image: v1.2.3-dev.1 → v1.2.3-rc.1
                │
                ▼
             main    →  v1.2.3       Image: v1.2.3-rc.1 → v1.2.3 + :latest
```

One image, built once on PR. Version tag is the promotion mechanism.
The last environment in your `environments` array always produces a stable semver tag.

---

## Quick start

### TBD (single trunk)

```yaml
# .github/workflows/ci.yaml  — builds image on every PR
- uses: calebsargeant/tbd-release/.github/workflows/tbd-ci.yaml@v1
  with:
    image_name: my-app
    bake_target: default

# .github/workflows/release.yaml  — versions + promotes image on merge/dispatch
- uses: calebsargeant/tbd-release/.github/workflows/tbd-release.yaml@v1
  with:
    versioning-tool: semantic-release-python
    environment:     ${{ github.event_name == 'push' && 'dev' || inputs.environment }}
    environments:    '["dev", "staging", "prod"]'
    prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    images:          '[{"name": "my-app", "bake_target": "default"}]'
    github-token:    ${{ secrets.GITHUB_TOKEN }}
```

### Branch-based (GitFlow-esque)

```yaml
# .github/workflows/release.yaml  — one workflow, all branches
- uses: calebsargeant/tbd-release/.github/workflows/tbd-release.yaml@v1
  with:
    versioning-tool:  semantic-release-python
    deployment-model: branch-based
    branch-map:       '{"dev": "dev", "staging": "staging", "main": "prod"}'
    environments:     '["dev", "staging", "prod"]'
    prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    images:           '[{"name": "my-app", "bake_target": "default"}]'
```

---

## Docker image lifecycle

The full CI → release → promote flow:

| Stage | Trigger | Versioning | Image action |
|---|---|---|---|
| **CI** | PR opened/updated | — | Build → push `pr-<N>` to GHCR |
| **Dev release** | push to `main` (TBD) or push to `dev` (branch-based) | `v1.2.3-dev.1` | Retag `pr-<N>` → `v1.2.3-dev.1` |
| **Staging release** | `workflow_dispatch` (TBD) or push to `staging` | `v1.2.3-rc.1` | Retag `v1.2.3-dev.1` → `v1.2.3-rc.1` |
| **Prod release** | `workflow_dispatch` (TBD) or push to `main` | `v1.2.3` | Retag `v1.2.3-rc.1` → `v1.2.3` + `:latest` |

Image promotion uses `docker buildx imagetools create` — a manifest-level retag with no layer download.
If the source image is not found (e.g., PR image expired or repo is new), a fresh `docker buildx bake` build is performed as a fallback.

### Multi-image support

Pass a JSON array to `images`. Each entry is promoted independently:

```yaml
images: >-
  [
    {"name": "my-app-api",    "bake_target": "api"},
    {"name": "my-app-worker", "bake_target": "worker"}
  ]
```

Images are published to `ghcr.io/{owner}/{name}:{version}`.

In your CI workflow, call `tbd-ci.yaml` once per image (one build job per target):

```yaml
jobs:
  build-api:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-ci.yaml@v1
    with: {image_name: my-app-api, bake_target: api}
    secrets: inherit

  build-worker:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-ci.yaml@v1
    with: {image_name: my-app-worker, bake_target: worker}
    secrets: inherit
```

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

### Core (`action.yml` / `tbd-release.yaml`)

| Input | Required | Default | Description |
|---|---|---|---|
| `versioning-tool` | | `semantic-release-python` | Versioning tool to use |
| `environment` | (TBD) | — | Target environment. Must be in `environments`. Required for `deployment-model: tbd`. |
| `environments` | | `["dev","staging","prod"]` | Ordered JSON array. Last entry = production. |
| `prerelease-identifiers` | | `{"dev":"dev","staging":"rc"}` | JSON map of env → prerelease token |
| `tag-prefix` | | `v` | Git tag prefix |
| `deployment-model` | | `tbd` | `tbd` or `branch-based` |
| `branch-map` | | `''` | JSON map of branch → env. Required for `branch-based`. |

### Authentication

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | — | GitHub token for git push and releases |
| `app-id` | | `''` | GitHub App ID. Generates a short-lived token to bypass branch protection |
| `app-private-key` | | `''` | GitHub App private key (PEM). Required when `app-id` is set |

### Docker image promotion (`tbd-release.yaml`)

| Input | Default | Description |
|---|---|---|
| `images` | `''` | JSON array of `{name, bake_target}` objects. When set, promotes GHCR images after release. |
| `bake_file` | `docker-bake.hcl` | Path to Docker Bake file |
| `registry` | `ghcr.io` | Container registry |
| `platforms` | `linux/amd64,linux/arm64` | Target platforms for fallback fresh builds |

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
| `resolved-environment` | The environment that was targeted (useful for branch-based mode) |

---

## Full tri-environment TBD example

```yaml
# .github/workflows/ci.yaml
name: CI
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
jobs:
  build-api:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-ci.yaml@v1
    with:
      image_name: my-app-api
      bake_target: api
      enforce_branch_naming: true
    secrets: inherit
  build-worker:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-ci.yaml@v1
    with:
      image_name: my-app-worker
      bake_target: worker
      enforce_branch_naming: true
    secrets: inherit
```

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
      images: >-
        [
          {"name": "my-app-api",    "bake_target": "api"},
          {"name": "my-app-worker", "bake_target": "worker"}
        ]
      bake_file: docker-bake.hcl
    secrets: inherit
```

---

## Branch-based (GitFlow-esque) example

```yaml
# .github/workflows/release.yaml
# Triggers on push to any branch in branch-map.
# Environment is auto-detected — no workflow_dispatch inputs needed.
name: Release
on:
  push:
    branches: [dev, staging, main]
    paths-ignore: ['**.md', 'CHANGELOG.md']
jobs:
  release:
    uses: calebsargeant/tbd-release/.github/workflows/tbd-release.yaml@v1
    with:
      versioning-tool:  semantic-release-python
      deployment-model: branch-based
      branch-map:       '{"dev": "dev", "staging": "staging", "main": "prod"}'
      environments:     '["dev", "staging", "prod"]'
      prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
      images:           '[{"name": "my-app", "bake_target": "default"}]'
    secrets: inherit
```

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

  deploy:
    needs: release
    if: needs.release.outputs.version != ''
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Deploying version ${{ needs.release.outputs.version }}"
          # docker pull ghcr.io/my-org/my-app:${{ needs.release.outputs.tag }}
          # kubectl set image deployment/my-app my-app=ghcr.io/my-org/my-app:${{ needs.release.outputs.tag }}
```

---

## GitHub App setup (recommended for branch protection)

When `main` is protected, `GITHUB_TOKEN` cannot push release commits. Use a GitHub App token:

1. Create a GitHub App (Settings → Developer settings → GitHub Apps → New App)
   - Permissions: **Contents: Read and write**, **Metadata: Read**
2. Install the app on your repositories
3. Note the App ID and generate a private key
4. Add two repo secrets:
   - `SEMANTIC_RELEASE_APP_ID` — the numeric App ID
   - `SEMANTIC_RELEASE_APP_PRIVATE_KEY` — the full `.pem` file contents
5. Pass them to the action via `app-id` and `app-private-key` (or use `secrets: inherit`)

---

## What's included in this repository

| Path | Purpose |
|---|---|
| [`action.yml`](action.yml) | **This marketplace action** — generic TBD versioning |
| [`.github/workflows/tbd-ci.yaml`](.github/workflows/tbd-ci.yaml) | Reusable: PR image build with TBD branch name enforcement |
| [`.github/workflows/tbd-release.yaml`](.github/workflows/tbd-release.yaml) | Reusable: versioning + GHCR image promotion |
| [`.github/workflows/tbd-deploy-cloud-run.yaml`](.github/workflows/tbd-deploy-cloud-run.yaml) | Reusable: image promotion + Cloud Run deployment (optional) |
| [`.github/actions/cloud-run-deploy/`](.github/actions/cloud-run-deploy/) | Sub-action: GHCR → GAR mirror + `gcloud run deploy` |
| [`examples/tri-env/`](examples/tri-env/) | Tri-environment TBD caller examples (ci + release + deploy) |
| [`examples/dual-env/`](examples/dual-env/) | Dual-environment TBD caller examples |
| [`examples/quad-env/`](examples/quad-env/) | Quad-environment TBD caller examples |
| [`examples/branch-based/`](examples/branch-based/) | Branch-based (GitFlow-esque) caller examples |
| [`examples/config/`](examples/config/) | Config file templates for each versioning tool |

---

## License

MIT — see [LICENSE](LICENSE).
