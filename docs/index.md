# Semantic Release Consumer Guide
This site is generated with MkDocs and published via GitHub Pages so consumers can onboard quickly.

Use this guide to set up your organization and repositories for:

- semantic version automation
- GitHub release/tag creation
- optional Docker image build + promotion
- optional promotion PR flows across environments

## What this repository provides
- A single composite action: `calebsargeant/semantic-release@v1`
- Support for Trunk-Based Development (TBD) and Branch-Based Development (BBD)
- Multiple versioning engines (`semantic-release-python`, `semantic-release-npm`, `gitversion`, `release-please`)
- Optional shared token broker (`worker/`) for public GitHub App auth mode

## Onboarding flow
1. Configure organization-level prerequisites and auth strategy in [Organization setup](organization-setup.md).
2. Configure each consumer repository in [Repository setup](repository-setup.md).
3. If you host your own public GitHub App broker, deploy [Release Runner Worker](release-runner-worker.md).
4. Use the generated [Action inputs and outputs reference](reference/action-inputs-outputs.md) for the latest contract.

## Choose your deployment model
- **TBD (`deployment-model: tbd` or `tbd-pr`)**: one mainline branch with promotion through environments.
- **BBD (`deployment-model: bbd`)**: dedicated long-lived branch per environment.

If unsure, start with TBD and `environments: ["dev", "staging", "prod"]`.
