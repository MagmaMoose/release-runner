# Release Runner

Release Runner is the GitHub Marketplace Action published as `calebsargeant/semantic-release@v1`.

Use this site to choose and configure the release setup your repository needs. It covers the public action behavior: app installation, workflow permissions, versioning tools, deployment models, and optional Docker image promotion.

Internal service hosting details are intentionally out of scope for these pages.

## Start Here

| Question | Page |
|---|---|
| What must be configured once for my org? | [Organization setup](organization-setup.md) |
| Which action inputs match my release flow? | [Choose your setup](choose-your-setup.md) |
| What files and workflows does a repo need? | [Repository setup](repository-setup.md) |
| What are all supported inputs and outputs? | [Action inputs and outputs](reference/action-inputs-outputs.md) |

## What The Action Does

| Area | Supported behavior |
|---|---|
| Release mode | Run the selected versioning tool, create tags/releases, and expose normalized outputs |
| CI mode | Build Docker Bake targets and push `pr-<number>` tags |
| Docker promotion | Promote an existing image tag when possible, with build fallback |
| Environment model | Support single-environment, TBD promotion, and BBD branch mapping |
| Authentication | Use the Release Runner GitHub App, your own GitHub App, or `GITHUB_TOKEN` |

Release Runner does not deploy your application to Cloud Run, Kubernetes, ECS, VMs, or any other runtime. Use the action outputs and image tags in deployment workflows that you own.

## Setup Shape

Every repository chooses one option from each row.

| Choice | Options |
|---|---|
| Authentication | Release Runner GitHub App, private GitHub App, or workflow token |
| Versioning tool | `semantic-release-python`, `semantic-release-npm`, `gitversion`, or `release-please` |
| Environment model | single production, `tbd`, `tbd-pr`, or `bbd` |
| Docker | disabled, single-image Bake target, or multi-image Bake group |
| Promotion | no promotion PRs, automatic `tbd-pr` promotion PRs, or branch-based BBD promotion |

## Common Paths

| If you want | Use |
|---|---|
| A simple production release from `main` | Single production environment with `environment: prod` |
| Dev, staging, and prod from one trunk branch | `deployment-model: tbd-pr` and `create-promotion-pr: 'true'` |
| Long-lived environment branches | `deployment-model: bbd` and `branch-map` |
| Version-only releases | Omit `image_name` |
| Container release tags | Add PR CI with `mode: ci`, then set `image_name` in release mode |

The rest of this site walks through those combinations in detail.
