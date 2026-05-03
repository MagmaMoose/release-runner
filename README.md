# semantic-release

A GitHub Marketplace action for semantic release management with built-in Docker image promotion.

Supports **Trunk-Based Development (TBD)** (single `main` branch) and **Branch-Based Development (BBD)** (one branch per environment) pipelines. Calculates the correct semantic version for any environment, then retags the GHCR image built during CI — no rebuilds for TBD, fresh builds per environment for BBD.

Supports three authentication modes: the workflow `GITHUB_TOKEN`, a bring-your-own GitHub App, or a shared public GitHub App through the Release Runner token broker (Cloudflare Worker) in [`worker/`](worker/).

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

### Trunk-Based Development (TBD)

```yaml
# .github/workflows/ci.yaml
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

### Branch-Based Development (BBD)

```yaml
# .github/workflows/ci.yaml
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

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    branches: [dev, staging, main]
    paths-ignore: ['**.md', '.gitignore', 'LICENSE', 'CHANGELOG.md']
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

---

## Architecture

`calebsargeant/semantic-release@v1` is the root action published to the GitHub Marketplace. It is **all-inclusive** — a single step handles CI builds, versioning, Docker image promotion, and promotion PR creation.

Two modes:

| `mode` | When to use | What it does |
|---|---|---|
| `ci` | On every `pull_request` event | Enforces branch naming, builds the Docker image with Bake, pushes `pr-<N>` to GHCR |
| `release` *(default)* | On merge to trunk or promote PR | Calculates semver, creates git tag + GitHub Release, promotes the Docker image, optionally creates the next environment's promotion PR |

## Docker image lifecycle

The full CI → release → promote flow:

**Trunk-Based Development (TBD)** — image built once, promoted by retagging:

| Stage | Trigger | Versioning | Image action |
|---|---|---|---|
| **Feature PR opened** | PR opened/updated to `main` | — | Build → push `pr-<N>` to GHCR |
| **Dev release** | Feature PR merged to `main` | `v1.2.3-dev.1` | Retag `pr-<N>` → `v1.2.3-dev.1` |
| **Staging promotion PR created** | Bot creates `promote/staging/*` PR | — | — |
| **Staging release** | `promote/staging/*` PR reviewed and merged | `v1.2.3-rc.1` | Retag `v1.2.3-dev.1` → `v1.2.3-rc.1` |
| **Prod promotion PR created** | Bot creates `promote/prod/*` PR | — | — |
| **Prod release** | `promote/prod/*` PR reviewed and merged | `v1.2.3` | Retag `v1.2.3-rc.1` → `v1.2.3` + `:latest` |

**Branch-Based Development (BBD)** — image rebuilt per environment:

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

Use a Docker Bake group target that contains all your images as sub-targets. Pass a single `bake_target` — the action runs `docker buildx bake --print` to discover all sub-targets and handles each automatically.

> **Why not just call `docker buildx bake` for promotion?**
> Bake is for _building_. Image promotion (retag without rebuild) uses `docker buildx imagetools create`, which operates on one fully-qualified image at a time. Additionally, the GitHub Actions cache backend (`type=gha`) requires a unique scope per target to avoid cache collisions between images. Both requirements mean we discover targets via `bake --print`, then loop over them — applying per-target cache args during build and per-target imagetools operations during promotion.

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

Pass `image_name: my-app` and `bake_target: default` — both CI and release expand the group and operate on each target:

```yaml
# CI — builds api + worker in one step
steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: ci
      image_name:  my-app
      bake_target: default
      github-token: ${{ secrets.GITHUB_TOKEN }}

# Release — promotes ghcr.io/<owner>/my-app-api and my-app-worker
steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
      image_name:  my-app
      bake_target: default
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

### Mode

| Input | Default | Description |
|---|---|---|
| `mode` | `release` | `ci` — build + push `pr-<N>`. `release` — version + promote + optional promotion PR. |

### Versioning

| Input | Required | Default | Description |
|---|---|---|---|
| `versioning-tool` | | `semantic-release-python` | Versioning tool to use |
| `environment` | (TBD) | — | Target environment. Must be in `environments`. Required for `deployment-model: tbd`. |
| `environments` | | `["dev","staging","prod"]` | Ordered JSON array. Last entry = production. |
| `prerelease-identifiers` | | `{"dev":"dev","staging":"rc"}` | JSON map of env → prerelease token |
| `tag-prefix` | | `v` | Git tag prefix |
| `deployment-model` | | `tbd` | `tbd`, `tbd-pr`, or `bbd` |
| `branch-map` | (BBD) | `''` | JSON map of branch → env. |

### Authentication

| Input | Required | Default | Description |
|---|---|---|---|
| `auth-mode` | | `public-app` | `public-app`, `github-token`, `private-app`, or `auto` |
| `github-token` | | workflow `GITHUB_TOKEN` | Token for default auth and GHCR login |
| `token-broker-url` | | `https://release-runner.sargeant.workers.dev` | Cloudflare Worker URL for `auth-mode: public-app` |
| `oidc-audience` | | `release-runner` | Audience used when requesting the GitHub Actions OIDC token |
| `app-id` | (private app) | `''` | GitHub App ID. Generates a short-lived token to bypass branch protection |
| `app-private-key` | (private app) | `''` | GitHub App private key (PEM). Required when `app-id` is set |

### Docker

| Input | Default | Description |
|---|---|---|
| `image_name` | `''` | Base image name (e.g. `my-app`). Sets `IMAGE_NAME=<owner>/my-app` when evaluating the bake file. Omit to skip Docker entirely. |
| `bake_file` | `docker-bake.hcl` | Path to Docker Bake file |
| `bake_target` | `default` | Bake target or group. Groups are expanded automatically. |
| `registry` | `ghcr.io` | Container registry |
| `platforms` | `linux/amd64` | Target platforms for CI builds and fallback fresh builds |

### CI-specific

| Input | Default | Description |
|---|---|---|
| `enforce_branch_naming` | `true` | Enforce TBD branch naming on `pull_request` events (`mode: ci`). Set to `false` for BBD. |

### Release-specific

| Input | Default | Description |
|---|---|---|
| `create-promotion-pr` | `false` | Create the next environment's promotion PR after a prerelease (`deployment-model: tbd-pr` only). |
| `promote-target-branch` | `main` | Base branch for promotion PRs |
| `promote-branch-prefix` | `promote` | Prefix for promotion PR branches |
| `working-directory` | `.` | Directory containing the versioning config file |
| `create-release` | `true` | Create a GitHub Release |
| `changelog` | `true` | Update CHANGELOG.md |

### Tool-specific

| Input | Default | For tool |
|---|---|---|
| `gitversion-spec` | `6.x` | `gitversion` |
| `gitversion-config` | `GitVersion.yml` | `gitversion` |
| `gitversion-appsettings-file` | `''` | `gitversion` — path to a JSON file (e.g. `appsettings.json`) where the version is injected and committed back to the branch |
| `gitversion-appsettings-version-path` | `.Application.Version` | `gitversion` — jq path for the version field (e.g. `.Application.Version`) |
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

## Trunk-Based Development (TBD)

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

Flow: merge `feat/*` → dev release (`v1.2.3-dev.1`) → action creates `promote/staging/1.2.3-dev.1` PR → team reviews → merge → staging release (`v1.2.3-rc.1`) → action creates `promote/prod/1.2.3-rc.1` PR → merge → production release (`v1.2.3`).

---

## Branch-Based Development (BBD)

```yaml
# .github/workflows/ci.yaml
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

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    branches: [dev, staging, main]
    paths-ignore: ['**.md', '.gitignore', 'LICENSE', 'CHANGELOG.md']
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

---

## Using outputs downstream

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    outputs:
      version: ${{ steps.tbd.outputs.version }}
      tag:     ${{ steps.tbd.outputs.tag }}
    steps:
      - uses: calebsargeant/semantic-release@v1
        id: tbd
        with:
          mode: release
          environment: dev
          environments: '["dev", "prod"]'
          prerelease-identifiers: '{"dev": "dev"}'

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

## GitHub App auth for branch protection

When `main` is protected, `GITHUB_TOKEN` often cannot push the release commit, tag, promotion branch, or promotion PR that release tooling creates. A GitHub App can be allowed through branch protection/rulesets without disabling those protections.

A shared public GitHub App is possible, but it requires a hosted token broker because the shared app's private key must stay private. This repo includes the Release Runner Cloudflare Worker broker in [`worker/`](worker/) for that purpose.

### Option A: Shared public GitHub App (easiest)

Use this when you want users to install one public app and avoid storing any app private key in their repository.

```yaml
permissions:
  contents: read
  id-token: write
  packages: write # only required when image_name is set

steps:
  - uses: actions/checkout@v4
  - uses: CalebSargeant/semantic-release@v1
    with:
      mode: release
```

`auth-mode: public-app` and `token-broker-url: https://release-runner.sargeant.workers.dev` are the defaults. Override them only when using `GITHUB_TOKEN`, a private app, or your own broker.

How it works:

1. The user installs the public GitHub App on their repository or organisation.
2. The workflow grants `id-token: write`.
3. The action requests a GitHub Actions OIDC token for the configured audience.
4. The action posts that OIDC token to the Cloudflare Worker broker.
5. The broker verifies issuer, audience, expiry, and the `repository` claim.
6. The broker checks the app is installed on the requested repo.
7. The broker returns a short-lived installation token scoped to that single repo.

No private key is stored in the user's repository. The app can only act on repositories where it is installed. For protected branches, the repository or organisation must allow this GitHub App as an actor that may push or bypass according to the branch protection/ruleset configuration.

Public app install URL placeholder:

```text
https://github.com/apps/YOUR_APP_SLUG/installations/new
```

### Option B: Bring your own GitHub App (strict/enterprise)

Use this when an organisation does not want to install a third-party shared app, or wants to own the app permissions, private key, and installation lifecycle.

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
   - App name: e.g. `my-org-semantic-release`
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read-only**
   - Uncheck "Active" under Webhook
2. Install the app on the target repositories (or all repos in the org)
3. Note the **App ID** (shown on the app's general settings page)
4. Generate a **private key** (bottom of the page) and download the `.pem` file
5. Add these as repository or organisation secrets:
   - `SEMANTIC_RELEASE_APP_ID` — the numeric App ID
   - `SEMANTIC_RELEASE_APP_PRIVATE_KEY` — the full `.pem` file contents
6. Pass them to the action:

```yaml
- uses: calebsargeant/semantic-release@v1
  with:
    mode: release
    auth-mode: private-app
    app-id:          ${{ secrets.SEMANTIC_RELEASE_APP_ID }}
    app-private-key: ${{ secrets.SEMANTIC_RELEASE_APP_PRIVATE_KEY }}
    github-token:    ${{ secrets.GITHUB_TOKEN }}
```

### Deploying Release Runner

Release Runner is a Cloudflare Worker TypeScript package in [`worker/`](worker/). It accepts only `POST /token` and returns an installation token only after validating the GitHub Actions OIDC JWT.

1. Create a public GitHub App with repository permissions:
   - **Contents:** Read and write
   - **Pull requests:** Read and write
   - **Metadata:** Read-only
   - **Workflows:** Read and write only if the action will modify `.github/workflows`
2. Save the generated private key securely.
3. Deploy the Worker:

```bash
cd worker
npm install
npx wrangler deploy
```

4. Add Worker secrets:

```bash
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put OIDC_AUDIENCE
```

Optional broker settings:

| Setting | Purpose |
|---|---|
| `ALLOWED_REPOSITORIES` | Comma-separated allow-list such as `org/repo-a,org/repo-b`. Empty means any repo where the app is installed. |
| `TOKEN_PERMISSIONS` | JSON or comma-separated permissions. Defaults to `contents:write,pull_requests:write`. |

Keep the private key in Cloudflare Worker secrets only. Do not put it in `wrangler.jsonc`, repository variables, workflow files, or source control.

---

## What's included in this repository

| Path | Purpose |
|---|---|
| [`action.yml`](action.yml) | **This Marketplace action** — all-inclusive: CI builds, versioning, image promotion, promotion PRs |
| [`.github/workflows/tbd-ci.yaml`](.github/workflows/tbd-ci.yaml) | Thin wrapper: `mode: ci` at job level |
| [`.github/workflows/tbd-release.yaml`](.github/workflows/tbd-release.yaml) | Thin wrapper: `mode: release` at job level |
| [`.github/workflows/tbd-promote.yaml`](.github/workflows/tbd-promote.yaml) | Legacy: create promotion PR for next environment (use `create-promotion-pr: 'true'` instead) |
| [`.github/workflows/tbd-deploy-cloud-run.yaml`](.github/workflows/tbd-deploy-cloud-run.yaml) | Optional: image promotion + Cloud Run deployment |
| [`worker/`](worker/) | Release Runner (Cloudflare Worker) token broker for the shared public GitHub App auth mode |
| [`scripts/`](scripts/) | Shell helpers used by the composite action and test suite |
| [`tests/`](tests/) | Bats and Docker Bake validation tests |
| [`examples/solo/`](examples/solo/) | Solo (prod-only) caller example |
| [`examples/dual-env/`](examples/dual-env/) | Dual-environment TBD caller examples |
| [`examples/tri-env/`](examples/tri-env/) | Tri-environment TBD caller examples |
| [`examples/quad-env/`](examples/quad-env/) | Quad-environment TBD caller examples |
| [`examples/bbd/`](examples/bbd/) | BBD caller examples |
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

A GitFlow-style branching model where each environment has a dedicated long-lived branch (`dev`, `staging`, `main`). Code moves between environments by merging branches in sequence, similar to how GitFlow moves work from `develop` through release branches and into `main`. Each merge triggers a CI rebuild and release for that environment.

BBD is the more traditional option. Choose it when environment-specific builds are required (e.g. different config baked into the image per environment), when your organisation still needs GitFlow-like promotion gates, or when your team is not yet comfortable with TBD's rapid cadence.

**Reference:** [A successful Git branching model (GitFlow)](https://nvie.com/posts/a-successful-git-branching-model/)

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

### python-semantic-release

A Python implementation of the semantic-release specification. It reads your commit history, applies the Conventional Commits rules, and bumps `MAJOR`, `MINOR`, or `PATCH` accordingly. Configuration lives in `pyproject.toml` under `[tool.semantic_release]`. This is the default versioning tool for this action.

**Reference:** [python-semantic-release.readthedocs.io](https://python-semantic-release.readthedocs.io/)

### semantic-release (npm)

The original Node.js/JavaScript semantic-release package. Like `python-semantic-release`, it follows the Conventional Commits model. Configuration lives in `.releaserc.json` (or `package.json` under `"release"`). Use this when your project is already in the Node.js ecosystem or when you need its plugin ecosystem.

**Reference:** [semantic-release.gitbook.io](https://semantic-release.gitbook.io/)

### release-please

Google's release tooling, designed around a release-PR model. Rather than creating a tag on every merge, release-please accumulates unreleased commits into a pending "Release PR". The PR's title and body are updated automatically as new commits land. Merging the Release PR creates the tag and GitHub Release. Configuration lives in `release-please-config.json`.

Choose release-please when you want explicit human sign-off on the version bump before a tag is created, or when you prefer batch releases over continuous releases.

**Reference:** [github.com/googleapis/release-please](https://github.com/googleapis/release-please)

### When to use which

| Ecosystem / preference | Recommended tool |
|---|---|
| Python project | `semantic-release-python` (default) |
| Node.js / JavaScript project | `semantic-release-npm` |
| .NET / C# project, or no conventional commits | `gitversion` |
| Want explicit release PRs before tagging | `release-please` |
| Any ecosystem, want continuous releases | `semantic-release-python` or `semantic-release-npm` |

---

## License

MIT — see [LICENSE](LICENSE).
