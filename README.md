# semantic-release

A GitHub Marketplace action for semantic release management with built-in Docker image promotion.

Supports **Trunk-Based Development** (single `main` branch) and **Branch-Based Development** (one branch per environment) pipelines. Calculates the correct semantic version for any environment, then retags the GHCR image built during CI — no rebuilds for TBD, fresh builds per environment for BBD.

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


── Branch-Based Development (BBD) ─────────────────────────────────────────────

feat/* ─PR→ dev     → v1.2.3-dev.1    Build on PR: pr-N → v1.2.3-dev.1
               │
              PR
               │
            staging → v1.2.3-rc.1    Rebuild on PR: pr-N → v1.2.3-rc.1
               │
              PR
               │
             main   → v1.2.3         Rebuild on PR: pr-N → v1.2.3 + :latest
```

For TBD, the image is built once on the feature PR and promoted by retagging through each environment.
For BBD, the image is rebuilt on each environment's PR so it can be tested against environment-specific config before release.
The last environment in your `environments` array always produces a stable semver tag.

---

## Quick start

### TBD (single trunk)

```yaml
# .github/workflows/ci.yaml  — builds image on every PR to main
- uses: calebsargeant/semantic-release/.github/workflows/tbd-ci.yaml@v1
  with:
    image_name:  my-app
    bake_target: default

# .github/workflows/release.yaml  — versions + promotes image on merge or promote/* PR
- uses: calebsargeant/semantic-release/.github/workflows/tbd-release.yaml@v1
  with:
    versioning-tool:        semantic-release-python
    deployment-model:       tbd-pr
    promote-branch-prefix:  promote
    environment:            ${{ github.event_name == 'push' && 'dev' || '' }}
    environments:           '["dev", "staging", "prod"]'
    prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    image_name:             my-app
    bake_file:              docker-bake.hcl
    bake_target:            default
```

### Branch-Based Development (BBD)

```yaml
# .github/workflows/release.yaml  — one workflow, all branches
- uses: calebsargeant/semantic-release/.github/workflows/tbd-release.yaml@v1
  with:
    versioning-tool:  semantic-release-python
    deployment-model: bbd
    branch-map:       '{"dev": "dev", "staging": "staging", "main": "prod"}'
    environments:     '["dev", "staging", "prod"]'
    prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
    image_name:       my-app
    bake_file:        docker-bake.hcl
    bake_target:      default
```

---

## Docker image lifecycle

The full CI → release → promote flow:

**TBD** — image built once, promoted by retagging:

| Stage | Trigger | Versioning | Image action |
|---|---|---|---|
| **CI** | PR opened/updated to `main` | — | Build → push `pr-<N>` to GHCR |
| **Dev release** | PR merged to `main` | `v1.2.3-dev.1` | Retag `pr-<N>` → `v1.2.3-dev.1` |
| **Staging release** | `promote/staging/*` PR merged to `main` | `v1.2.3-rc.1` | Retag `v1.2.3-dev.1` → `v1.2.3-rc.1` |
| **Prod release** | `promote/prod/*` PR merged to `main` | `v1.2.3` | Retag `v1.2.3-rc.1` → `v1.2.3` + `:latest` |

**BBD** — image rebuilt per environment:

| Stage | Trigger | Versioning | Image action |
|---|---|---|---|
| **CI (dev)** | PR opened/updated to `dev` | — | Build → push `pr-<N>` to GHCR |
| **Dev release** | PR merged to `dev` | `v1.2.3-dev.1` | Retag `pr-<N>` → `v1.2.3-dev.1` |
| **CI (staging)** | PR opened/updated to `staging` | — | **Rebuild** → push `pr-<N>` to GHCR |
| **Staging release** | PR merged to `staging` | `v1.2.3-rc.1` | Retag `pr-<N>` → `v1.2.3-rc.1` |
| **CI (prod)** | PR opened/updated to `main` | — | **Rebuild** → push `pr-<N>` to GHCR |
| **Prod release** | PR merged to `main` | `v1.2.3` | Retag `pr-<N>` → `v1.2.3` + `:latest` |

TBD promotion uses `docker buildx imagetools create` — a manifest-level retag with no layer download.
If the source image is not found (e.g., PR image expired), a fresh `docker buildx bake` build is performed as a fallback.

### Multi-image support

Use a Docker Bake group target that contains all your images as sub-targets. Both `tbd-ci.yaml` and `tbd-release.yaml` accept a single `bake_target` — they run `docker buildx bake --print` to discover all sub-targets in the group and handle each one automatically.

> **Why not just call `docker buildx bake` for promotion?**
> Bake is for _building_. Image promotion (retag without rebuild) uses `docker buildx imagetools create`, which operates on one fully-qualified image at a time. Additionally, the GitHub Actions cache backend (`type=gha`) requires a unique scope per target to avoid cache collisions between images. Both requirements mean we discover targets via `bake --print`, then loop over them — either in a matrix (for promotion) or per-target cache args during build.

```hcl
# docker-bake.hcl
variable "REGISTRY"   { default = "ghcr.io" }
variable "IMAGE_NAME" { default = "my-org/my-app" }
variable "VERSION"    { default = "local" }

target "api" {
  tags = ["${REGISTRY}/${IMAGE_NAME}-api:${VERSION}"]
}
target "worker" {
  tags = ["${REGISTRY}/${IMAGE_NAME}-worker:${VERSION}"]
}
group "default" {
  targets = ["api", "worker"]
}
```

Pass `image_name: my-app` and `bake_target: default` — both workflows expand the group and operate on each target:

```yaml
# CI — one job builds all images in the group
build:
  uses: calebsargeant/semantic-release/.github/workflows/tbd-ci.yaml@v1
  with:
    image_name:  my-app
    bake_target: default   # builds api + worker in parallel
  secrets: inherit

# Release — discovers all targets, promotes each one independently
release:
  uses: calebsargeant/semantic-release/.github/workflows/tbd-release.yaml@v1
  with:
    image_name:  my-app
    bake_file:   docker-bake.hcl
    bake_target: default   # promotes ghcr.io/<owner>/my-app-api and my-app-worker
  secrets: inherit
```

---

## Environment profiles

| Profile | `environments` | `prerelease-identifiers` | Tag examples |
|---|---|---|---|
| **Solo** | `["prod"]` | `{}` | `v1.2.3` |
| **Dual** | `["dev", "prod"]` | `{"dev": "dev"}` | `v1.2.3-dev.1` → `v1.2.3` |
| **Tri** *(default)* | `["dev", "staging", "prod"]` | `{"dev": "dev", "staging": "rc"}` | `v1.2.3-dev.1` → `v1.2.3-rc.1` → `v1.2.3` |
| **Quad** | `["dev", "tst", "acc", "prd"]` | `{"dev": "dev", "tst": "alpha", "acc": "beta"}` | `v1.2.3-dev.1` → `v1.2.3-alpha.1` → `v1.2.3-beta.1` → `v1.2.3` |

Environment names are fully configurable — use any naming convention your org prefers. See [`examples/solo/`](examples/solo/) for a single-environment caller.

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
| `deployment-model` | | `tbd` | `tbd`, `tbd-pr`, or `bbd` |
| `branch-map` | | `''` | JSON map of branch → env. Required for `bbd`. |

### Authentication

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | — | GitHub token for git push and releases |
| `app-id` | | `''` | GitHub App ID. Generates a short-lived token to bypass branch protection |
| `app-private-key` | | `''` | GitHub App private key (PEM). Required when `app-id` is set |

### Docker image promotion (`tbd-release.yaml`)

| Input | Default | Description |
|---|---|---|
| `image_name` | `''` | Base image name (e.g. `my-app`). Sets `IMAGE_NAME=<owner>/my-app` when evaluating the bake file. Omit to skip image promotion. |
| `bake_file` | `docker-bake.hcl` | Path to Docker Bake file |
| `bake_target` | `default` | Bake target or group. Groups are expanded automatically — all sub-targets are promoted. |
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
| `gitversion-appsettings-file` | `''` | `gitversion` — path to a JSON file (e.g. `appsettings.json`) where the version should be injected and committed back to the branch |
| `gitversion-appsettings-version-path` | `.Application.Version` | `gitversion` — jq path for the version field in the appsettings file (e.g. `.Application.Version`) |
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
| `resolved-environment` | The environment that was targeted (useful for BBD and `tbd-pr` modes) |

---

## Full tri-environment TBD example

```yaml
# .github/workflows/ci.yaml
name: CI
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    uses: calebsargeant/semantic-release/.github/workflows/tbd-ci.yaml@v1
    with:
      image_name:  my-app
      bake_file:   docker-bake.hcl
      bake_target: default        # group containing api + worker sub-targets
      platforms:   linux/amd64
      enforce_branch_naming: true
    secrets: inherit
```

```yaml
# .github/workflows/release.yaml
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
    uses: calebsargeant/semantic-release/.github/workflows/tbd-release.yaml@v1
    with:
      versioning-tool:         semantic-release-python
      deployment-model:        tbd-pr
      promote-branch-prefix:   promote
      environment:             ${{ github.event_name == 'push' && 'dev' || '' }}
      environments:            '["dev", "staging", "prod"]'
      prerelease-identifiers:  '{"dev": "dev", "staging": "rc"}'
      image_name:              my-app
      bake_file:               docker-bake.hcl
      bake_target:             default
    secrets: inherit

  create-promotion-pr:
    needs: release
    if: needs.release.outputs.released == 'true' && needs.release.outputs.is-prerelease == 'true'
    uses: calebsargeant/semantic-release/.github/workflows/tbd-promote.yaml@v1
    with:
      version:             ${{ needs.release.outputs.version }}
      tag:                 ${{ needs.release.outputs.tag }}
      current-environment: ${{ needs.release.outputs.resolved-environment }}
      environments:        '["dev", "staging", "prod"]'
    secrets: inherit
```

Flow: merge `feat/*` → dev release (`v1.2.3-dev.1`) → bot creates `promote/staging/1.2.3-dev.1` PR → team reviews → merge → staging release (`v1.2.3-rc.1`) → bot creates `promote/prod/1.2.3-rc.1` PR → merge → production release (`v1.2.3`).

---

## Branch-Based Development (BBD) example

```yaml
# .github/workflows/ci.yaml
# Triggered on PRs to every env branch — CI rebuilds for each environment.
name: CI
on:
  pull_request:
    branches: [dev, staging, main]
    types: [opened, synchronize, reopened]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    uses: calebsargeant/semantic-release/.github/workflows/tbd-ci.yaml@v1
    with:
      image_name:  my-app
      bake_file:   docker-bake.hcl
      bake_target: default
      platforms:   linux/amd64
      enforce_branch_naming: false  # BBD uses env branches, not feat/* prefixes
    secrets: inherit
```

```yaml
# .github/workflows/release.yaml
# Triggers on push to any branch in branch-map.
# Environment is auto-detected from the branch — no dispatch inputs needed.
name: Release
on:
  push:
    branches: [dev, staging, main]
    paths-ignore: ['**.md', '.gitignore', 'LICENSE', 'CHANGELOG.md']
jobs:
  release:
    uses: calebsargeant/semantic-release/.github/workflows/tbd-release.yaml@v1
    with:
      versioning-tool:  semantic-release-python
      deployment-model: bbd
      branch-map:       '{"dev": "dev", "staging": "staging", "main": "prod"}'
      environments:     '["dev", "staging", "prod"]'
      prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
      image_name:       my-app
      bake_file:        docker-bake.hcl
      bake_target:      default
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
      - uses: calebsargeant/semantic-release@v1
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

When `main` is protected, `GITHUB_TOKEN` cannot push the release commit that semantic-release creates. A GitHub App token bypasses branch protection without disabling it.

**Each organisation creates its own App** — the private key cannot be safely shared, so a single "public" app for everyone is not possible. Setup takes about 5 minutes per organisation:

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
   - App name: e.g. `my-org-semantic-release`
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read-only**
   - Uncheck "Active" under Webhook
2. Install the app on the target repositories (or all repos in the org)
3. Note the **App ID** (shown on the app's general settings page)
4. Generate a **private key** (bottom of the page) — download the `.pem` file
5. Add these as repository (or organisation) secrets:
   - `SEMANTIC_RELEASE_APP_ID` — the numeric App ID
   - `SEMANTIC_RELEASE_APP_PRIVATE_KEY` — the full `.pem` file contents
6. Pass via `secrets: inherit` in your caller workflow — the reusable workflows pick them up automatically

---

## What's included in this repository

| Path | Purpose |
|---|---|
| [`action.yml`](action.yml) | **This marketplace action** — versioning orchestrator (use directly or via `tbd-release.yaml`) |
| [`.github/workflows/tbd-ci.yaml`](.github/workflows/tbd-ci.yaml) | Reusable: PR image build with branch name enforcement |
| [`.github/workflows/tbd-release.yaml`](.github/workflows/tbd-release.yaml) | Reusable: versioning + GHCR image promotion |
| [`.github/workflows/tbd-promote.yaml`](.github/workflows/tbd-promote.yaml) | Reusable: create promotion PR for next environment (TBD) |
| [`.github/workflows/tbd-deploy-cloud-run.yaml`](.github/workflows/tbd-deploy-cloud-run.yaml) | Reusable: image promotion + Cloud Run deployment (optional) |
| [`examples/solo/`](examples/solo/) | Solo (prod-only) caller example |
| [`examples/dual-env/`](examples/dual-env/) | Dual-environment TBD caller examples |
| [`examples/tri-env/`](examples/tri-env/) | Tri-environment TBD caller examples (ci + release + deploy) |
| [`examples/quad-env/`](examples/quad-env/) | Quad-environment TBD caller examples |
| [`examples/bbd/`](examples/bbd/) | Branch-Based Development (BBD) caller examples |
| [`examples/config/`](examples/config/) | Config file templates for each versioning tool |

---

## Background

### Trunk-Based Development (TBD)

A source control branching model where all developers integrate their work directly into a shared trunk (`main`) at least once per day. There are no long-lived feature branches — only short-lived branches (hours to a day or two) that are merged via pull request.

- Eliminates merge hell and "big bang" integrations
- Encourages small, frequent, reversible changes
- Requires a robust CI pipeline to keep trunk always releasable

**Reference:** [trunkbaseddevelopment.com](https://trunkbaseddevelopment.com)

### Branch-Based Development (BBD)

A branching model where each environment has a dedicated long-lived branch (`dev`, `staging`, `main`). Code moves between environments by merging branches in sequence. Each merge triggers a CI rebuild and release for that environment.

BBD is a more traditional approach; choose it when environment-specific builds are required (e.g. different config baked into the image per environment) or when your team is not yet comfortable with TBD's rapid cadence.

### Semantic Versioning (semver)

Versions take the form `MAJOR.MINOR.PATCH[-PRERELEASE]`. The rules:

- `PATCH` — backwards-compatible bug fixes
- `MINOR` — new backwards-compatible functionality
- `MAJOR` — incompatible API changes (or intentional breaking change)
- Prerelease: `1.2.3-dev.1`, `1.2.3-rc.1` — not yet stable, not suitable for production

**Reference:** [semver.org](https://semver.org)

### Conventional Commits

A lightweight commit message specification that semantic-release tools parse to determine the next version automatically:

| Prefix | Version bump | Example |
|---|---|---|
| `fix:` | PATCH | `fix: handle null user in login` |
| `feat:` | MINOR | `feat: add password reset flow` |
| `feat!:` or `BREAKING CHANGE:` | MAJOR | `feat!: drop Python 3.9 support` |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:` | no bump | routine maintenance |

**Reference:** [conventionalcommits.org](https://www.conventionalcommits.org)

### GitVersion

A tool from the .NET ecosystem that calculates the current semantic version from your git history and branch structure, without requiring a config file per branch. It reads a `GitVersion.yml` to understand your branching strategy and outputs variables like `MajorMinorPatch`, `SemVer`, `FullSemVer`.

GitVersion is the de-facto versioning standard for .NET/C# projects. Unlike semantic-release, it does not parse commit messages — it derives the version from git tags and branch names. Useful when your team does not want to enforce conventional commits.

**Reference:** [gitversion.net](https://gitversion.net)

---

## License

MIT — see [LICENSE](LICENSE).
