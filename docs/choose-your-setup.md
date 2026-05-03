# Choose Your Setup

Release Runner is configured by combining four choices:

1. authentication
2. versioning tool
3. environment model
4. Docker behavior

This page shows the supported combinations and the action inputs each one needs.

## Authentication Choice

### Release Runner GitHub App

Use this unless your organization has a reason to own its own GitHub App.

Repository requirements:

- Release Runner GitHub App installed on the organization or repository
- `id-token: write` on release jobs
- branch protection or rulesets allowing the app to perform release writes

Action inputs:

```yaml
with:
  mode: release
  auth-mode: public-app
```

`auth-mode: public-app` is the default, so you can omit it.

### Private GitHub App

Use this when your organization owns the app.

```yaml
with:
  mode: release
  auth-mode: private-app
  app-id: ${{ secrets.SEMANTIC_RELEASE_APP_ID }}
  app-private-key: ${{ secrets.SEMANTIC_RELEASE_APP_PRIVATE_KEY }}
```

### Workflow Token

Use this when `GITHUB_TOKEN` is allowed to write tags, releases, release commits, and promotion PR branches.

```yaml
permissions:
  contents: write
  pull-requests: write
  packages: write

steps:
  - uses: calebsargeant/semantic-release@v1
    with:
      mode: release
      auth-mode: github-token
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Versioning Tool Choice

| Tool | Input | Config file |
|---|---|---|
| python-semantic-release | `semantic-release-python` | `pyproject.toml` |
| semantic-release for Node.js | `semantic-release-npm` | `.releaserc.json` or `package.json` |
| GitVersion | `gitversion` | `GitVersion.yml` |
| release-please | `release-please` | `release-please-config.json` |

Example:

```yaml
with:
  mode: release
  versioning-tool: semantic-release-python
```

If the config file lives below the repository root, set `working-directory`.

```yaml
with:
  mode: release
  working-directory: services/api
```

## Environment Model Choice

### Single Production Environment

Use this for libraries, CLIs, services, or images that release directly from `main`.

```yaml
with:
  mode: release
  environment: prod
  environments: '["prod"]'
  prerelease-identifiers: '{}'
```

Version example:

| Environment | Tag |
|---|---|
| `prod` | `v1.2.3` |

### TBD With Explicit Environment

Use this when one trunk branch releases to a specific environment and another workflow handles later promotion.

```yaml
with:
  mode: release
  deployment-model: tbd
  environment: dev
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
```

Version examples:

| Environment | Tag |
|---|---|
| `dev` | `v1.2.3-dev.1` |
| `staging` | `v1.2.3-rc.1` |
| `prod` | `v1.2.3` |

### TBD With Promotion PRs

Use this when one trunk branch should promote through environments by reviewed PRs.

```yaml
with:
  mode: release
  deployment-model: tbd-pr
  environment: ${{ github.event_name == 'push' && 'dev' || '' }}
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
  create-promotion-pr: 'true'
```

Release flow:

| Trigger | Environment | Tag |
|---|---|---|
| Push to `main` | `dev` | `v1.2.3-dev.1` |
| Merge `promote/staging/...` | `staging` | `v1.2.3-rc.1` |
| Merge `promote/prod/...` | `prod` | `v1.2.3` |

### BBD Branch Mapping

Use this when each environment has its own long-lived branch.

```yaml
with:
  mode: release
  deployment-model: bbd
  branch-map: '{"dev": "dev", "staging": "staging", "main": "prod"}'
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
```

Branch mapping:

| Branch | Environment | Tag |
|---|---|---|
| `dev` | `dev` | `v1.2.3-dev.1` |
| `staging` | `staging` | `v1.2.3-rc.1` |
| `main` | `prod` | `v1.2.3` |

## Docker Choice

### Version Only

Do not set `image_name`.

```yaml
with:
  mode: release
  environment: prod
  environments: '["prod"]'
  prerelease-identifiers: '{}'
```

### Single Image

Add PR CI:

```yaml
with:
  mode: ci
  image_name: my-app
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

Add release promotion:

```yaml
with:
  mode: release
  image_name: my-app
```

The Bake target should emit one image tag based on `REGISTRY`, `IMAGE_NAME`, and `VERSION`.

### Multiple Images

Set `bake_target` to a Bake group. Each target in the group must have its own tag.

```yaml
with:
  mode: ci
  image_name: my-app
  bake_target: default
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

Release Runner expands the group and builds or promotes every target.

## Complete Combination Examples

| Combination | Required inputs |
|---|---|
| Production-only, version-only | `environment`, `environments`, `prerelease-identifiers` |
| Production-only with Docker | production-only inputs plus `image_name` and PR CI |
| TBD promotion PRs, version-only | `deployment-model: tbd-pr`, environment model inputs, `create-promotion-pr` |
| TBD promotion PRs with Docker | TBD promotion PR inputs plus `image_name` and PR CI |
| BBD with Docker | `deployment-model: bbd`, `branch-map`, environment model inputs, `image_name`, BBD PR CI |
