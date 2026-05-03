# Release Runner

Release Runner is the GitHub Marketplace Action published as `calebsargeant/semantic-release@v1`.

Use it when a repository needs semantic versioning, GitHub Releases, optional Docker image promotion, and optional promotion PRs between environments. This site covers setup and operations around the action. The README stays focused on the Marketplace listing.

## What The Action Owns

| Area | Supported by the action |
|---|---|
| Release mode | Calculate a version, create tags/releases, normalize outputs |
| CI mode | Build Docker Bake targets and push `pr-<number>` tags |
| Docker promotion | Retag an existing source image when possible, build as fallback |
| Environment model | `tbd`, `tbd-pr`, and `bbd` |
| Authentication | hosted public app broker, private GitHub App, or workflow token |
| Release tools | `semantic-release-python`, `semantic-release-npm`, `gitversion`, `release-please` |

The action does not own deployment to your runtime platform. Use the outputs and published image tags in your deployment workflows.

## Pick A Path

| Goal | Start here |
|---|---|
| Prepare org-level app/ruleset settings | [Organization setup](organization-setup.md) |
| Add the action to a repository | [Repository setup](repository-setup.md) |
| Host your own public app token broker | [Release Runner Worker](release-runner-worker.md) |
| Check every input and output | [Action inputs and outputs](reference/action-inputs-outputs.md) |

## Deployment Models

### `tbd`

Use one trunk branch. The workflow passes the target `environment` explicitly.

```yaml
with:
  mode: release
  deployment-model: tbd
  environment: prod
  environments: '["prod"]'
  prerelease-identifiers: '{}'
```

### `tbd-pr`

Use one trunk branch and promote prereleases by reviewed PRs. The first release passes `environment`; later promotion releases are detected from branches such as `promote/staging/1.2.3-dev.1`.

```yaml
with:
  mode: release
  deployment-model: tbd-pr
  environment: ${{ github.event_name == 'push' && 'dev' || '' }}
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
  create-promotion-pr: 'true'
```

### `bbd`

Use one long-lived branch per environment. The action maps `github.ref_name` to an environment with `branch-map`.

```yaml
with:
  mode: release
  deployment-model: bbd
  branch-map: '{"dev": "dev", "staging": "staging", "main": "prod"}'
  environments: '["dev", "staging", "prod"]'
  prerelease-identifiers: '{"dev": "dev", "staging": "rc"}'
```

## Version Tags

The last entry in `environments` is stable. Every earlier environment is a prerelease.

| Environments | Identifiers | Tags |
|---|---|---|
| `["prod"]` | `{}` | `v1.2.3` |
| `["dev", "prod"]` | `{"dev": "dev"}` | `v1.2.3-dev.1`, then `v1.2.3` |
| `["dev", "staging", "prod"]` | `{"dev": "dev", "staging": "rc"}` | `v1.2.3-dev.1`, then `v1.2.3-rc.1`, then `v1.2.3` |

## Docker Promotion

Set `image_name` to enable Docker behavior. Leave it empty for version-only releases.

In CI mode, Release Runner builds the configured Bake target or group and pushes `pr-<number>`.

In release mode, Release Runner promotes images only when a release was created. It tries to retag the source image with `docker buildx imagetools create`; if the source tag is unavailable, it runs a fresh `docker buildx bake --push` for the target.

## Auth Modes

| Mode | Use when |
|---|---|
| `public-app` | You use the hosted Release Runner app and broker. This is the default for release jobs. |
| `private-app` | Your organization owns the GitHub App and stores the private key in secrets. |
| `github-token` | Branch protection allows the workflow token to create tags/releases/PRs. |
| `auto` | You want private app auth when secrets are present and workflow token otherwise. |
