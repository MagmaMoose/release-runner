# TBD Cloud Run Deploy

A GitHub Marketplace action for **Trunk-Based Development (TBD)** release pipelines that deploy container images from GHCR to Google Cloud Run.

## The problem this solves

Google Cloud Run (fully managed) cannot pull directly from private GHCR repositories — it only has native authentication to Google Artifact Registry. This action solves that gap transparently:

1. Pulls your versioned image from GHCR using `GITHUB_TOKEN`
2. Mirrors it to Google Artifact Registry using `docker buildx imagetools create` (cross-registry retag — no layers downloaded twice)
3. Runs `gcloud run deploy` from GAR

GHCR stays the **canonical registry** for your TBD pipeline. GAR is only the last-mile delivery mechanism for Cloud Run.

## Quick start

```yaml
- uses: calebsargeant/tbd-release@v1
  with:
    ghcr-token:     ${{ secrets.GITHUB_TOKEN }}
    gcp-credentials: ${{ secrets.GCP_SA_KEY }}
    ghcr-image:     ghcr.io/my-org/my-app:v1.2.3
    service:        my-app-api
    project-id:     my-gcp-project
    gar-image:      africa-south1-docker.pkg.dev/my-gcp-project/my-repo/api
```

## Full example — TBD deploy workflow

```yaml
name: Deploy

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # GitHub Environment gate — requires reviewer approval
    permissions:
      contents: read
      id-token: write
      packages: read
    steps:
      - uses: calebsargeant/tbd-release@v1
        with:
          # Auth
          ghcr-token:      ${{ secrets.GITHUB_TOKEN }}
          gcp-credentials: ${{ secrets.GCP_SA_KEY_PROD }}

          # Image — the versioned tag from your CI pipeline (e.g. pr-42 promoted to v1.2.3)
          ghcr-image:  ghcr.io/my-org/my-app:${{ github.event.release.tag_name }}

          # Cloud Run
          service:     my-app-api
          project-id:  my-gcp-project
          region:      africa-south1
          gar-image:   africa-south1-docker.pkg.dev/my-gcp-project/my-repo/api

          # Runtime sizing
          port:          '8000'
          cpu:           '2'
          memory:        '2Gi'
          min-instances: '1'
          max-instances: '10'
          concurrency:   '100'
          timeout:       '300'

          # Identity and config
          allow-unauthenticated: 'true'
          service-account: my-app@my-gcp-project.iam.gserviceaccount.com
          env-vars:        'ENVIRONMENT=prod,PORT=8000,LOG_LEVEL=info'
          gcloud-secrets:  'DATABASE_URL=database-url:latest,SECRET_KEY=secret-key:latest'
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `ghcr-token` | ✅ | — | GitHub token with `read:packages`. Use `secrets.GITHUB_TOKEN`. |
| `gcp-credentials` | ✅ | — | GCP service account credentials JSON. See [IAM requirements](#iam-requirements). |
| `ghcr-image` | ✅ | — | Full GHCR image reference with tag. e.g. `ghcr.io/org/my-app:v1.2.3` |
| `service` | ✅ | — | Cloud Run service name |
| `project-id` | ✅ | — | GCP project ID |
| `gar-image` | ✅ | — | GAR image path **without** tag. e.g. `africa-south1-docker.pkg.dev/my-project/my-repo/api` |
| `region` | | `africa-south1` | GCP region |
| `port` | | `8080` | Container port |
| `cpu` | | `1` | CPU allocation. e.g. `1`, `2`, `4000m` |
| `memory` | | `512Mi` | Memory allocation. e.g. `512Mi`, `1Gi`, `2Gi` |
| `min-instances` | | `0` | Minimum instances. `0` = scale to zero. |
| `max-instances` | | `10` | Maximum instances |
| `concurrency` | | `80` | Max concurrent requests per instance |
| `timeout` | | `300` | Request timeout in seconds |
| `allow-unauthenticated` | | `true` | Allow public (unauthenticated) requests |
| `service-account` | | `''` | Service account email for the Cloud Run service identity |
| `env-vars` | | `''` | Environment variables as `KEY=VALUE,KEY2=VALUE2` |
| `gcloud-secrets` | | `''` | Secret Manager bindings as `KEY=SECRET_NAME:VERSION` |

## Outputs

| Output | Description |
|---|---|
| `url` | The URL of the deployed Cloud Run service |
| `gar-image-with-tag` | The full GAR image reference that was deployed |

## IAM requirements

The service account referenced by `gcp-credentials` needs these roles on the GCP project:

| Role | Why |
|---|---|
| `roles/run.admin` | Create and update Cloud Run services |
| `roles/artifactregistry.writer` | Push the mirrored image to GAR |
| `roles/iam.serviceAccountUser` | Act as the Cloud Run service's runtime service account |

```bash
gcloud projects add-iam-policy-binding MY_PROJECT \
  --member="serviceAccount:github-deploy@MY_PROJECT.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding MY_PROJECT \
  --member="serviceAccount:github-deploy@MY_PROJECT.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding MY_PROJECT \
  --member="serviceAccount:github-deploy@MY_PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## Prerequisites

**1. GAR repository must exist**

```bash
gcloud artifacts repositories create my-repo \
  --repository-format=docker \
  --location=africa-south1 \
  --project=my-gcp-project
```

**2. GHCR packages visibility**

This action pulls using `GITHUB_TOKEN`. If your GHCR packages are private, the token must have `read:packages` scope — the default `GITHUB_TOKEN` in a workflow job already has this for packages in the same org/user. No extra configuration needed.

**3. GitHub Environment (recommended)**

Create a `production` environment with required reviewers in your repo's **Settings → Environments**. Add `environment: production` to the calling job to enforce the approval gate.

## Where this fits in the TBD pipeline

```
PR opened
  └─► CI builds image → ghcr.io/org/my-app:pr-42

PR merged to main
  └─► semantic-release → GitHub Release v1.2.3

Release published
  └─► Retag pr-42 → v1.2.3 in GHCR
  └─► calebsargeant/tbd-release@v1  ← this action
        ├─ mirror v1.2.3 GHCR → GAR
        └─ gcloud run deploy from GAR
```

The full TBD pipeline (CI build, semantic versioning, image promotion, multi-environment deployment) is available as reusable workflows in this repository:
- `.github/workflows/tbd-ci.yaml` — PR image build with TBD branch name enforcement
- `.github/workflows/tbd-release.yaml` — semantic-release wrapper
- `.github/workflows/tbd-deploy-cloud-run.yaml` — orchestrates promotion + this action

## License

MIT — see [LICENSE](LICENSE).
