# Spec to preview workflow

This is the low-friction path for product work that starts in `yawp-pm` and needs a clickable Yawp preview.

## Repo split

- `yawp-pm` is the source of truth for product intent: use cases, decisions, UX notes, content specs, open questions, and acceptance criteria.
- `yawp-2.0` is the source of truth for runnable work: prototypes, implementation branches, PR previews, tests, and deployable code.

Do not expect a preview from `yawp-pm`. A preview is created only from a `yawp-2.0` PR.

## Kevin's path

1. Draft or update the product spec in `yawp-pm`.
2. When the work needs to be seen, create a `yawp-2.0` branch from current `main`.
3. Build the smallest runnable prototype that answers the product question.
4. Open a draft PR against `main`.
5. Wait for the sticky **PR preview (App Runner)** comment on the PR.
6. Share that preview URL with Brian/Bryant for review.

If the preview goes stale or disappears, comment this on the PR:

```text
/preview
```

That redeploys the App Runner preview from the PR's current branch and updates the sticky preview comment.

## Bryant/operator path

The preview workflow also has a manual GitHub Actions button:

1. Open GitHub Actions in `The-Connell-School/yawp-2.0`.
2. Choose **PR preview (App Runner)**.
3. Click **Run workflow**.
4. Enter the PR number.
5. Choose `deploy` to rebuild the preview or `destroy` to tear it down.

The manual deploy path is useful when someone asks for a refresh and you do not want to add an empty commit to their branch.

## Product Lab path

For a PM-owned Product Lab initiative, use the same manual workflow but also
enter the initiative's `lab.environment_slug` from the `yawp-pm` manifest in
the optional Product Lab slug field.

That creates a stable lab environment keyed by initiative instead of by PR:

- App Runner environment: `lab-<initiative-slug>`
- Postgres schema: `lab_<initiative_slug>`
- Terraform state: `yawp/product-lab/<initiative-slug>/terraform.tfstate`
- ECR image tag: `lab-<initiative-slug>`

This lets Kevin keep one durable preview for an initiative across PR refreshes
while normal PR previews continue to use `pr-<number>`.

## Constraints

- The PR branch must live in `The-Connell-School/yawp-2.0`, not a fork. Preview deploys use repository secrets.
- The PR must not contain `[skip preview]` in the title, body, or branch name.
- Product Lab slugs must be kebab-case and should match the initiative manifest.
- Closing a PR destroys its preview infrastructure.
- Commenting `/preview destroy` on a PR also destroys that PR's preview infrastructure. Use that only when the preview is no longer needed.

## Recovery checklist

If Kevin says a preview is gone:

1. Confirm the PR is in `yawp-2.0`, not `yawp-pm`.
2. Confirm the PR is open.
3. Confirm the branch is same-repo.
4. Comment `/preview` on the PR, or run the manual workflow with action `deploy`.
5. Check the latest **PR preview (App Runner)** workflow run if the sticky comment does not update.
