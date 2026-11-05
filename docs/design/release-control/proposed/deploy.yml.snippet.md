# Proposed deploy.yml integration (NOT APPLIED)

Insert **after** checkout, **before** AWS credentials, on `deploy-web-app-production` only when `PROMOTION_ENFORCEMENT_ENABLED=true` (default unset/false).

```yaml
      - name: 🔒 Promotion grant (prod_deploy) — proposed
        if: ${{ vars.PROMOTION_ENFORCEMENT_ENABLED == 'true' }}
        env:
          PROMOTION_BROKER_URL: ${{ vars.PROMOTION_BROKER_URL }}
          PROMOTION_GRANT_ID: ${{ github.event.inputs.promotion_grant_id || '' }}
        run: |
          # Fail closed if broker unreachable. Consume binds github.sha + image digest after build.
          # See docs/design/release-control/ARCHITECTURE.md — digest binding happens post-build in full design.
          bun run scripts/release-control/cli/consume-grant.ts \
            --scope prod_deploy \
            --commit "${GITHUB_SHA}" \
            --idempotency-key "${GITHUB_RUN_ID}/${GITHUB_RUN_ATTEMPT}"
```

**Note:** Digest binding requires a second consume or a two-phase grant after `docker push`; keep build ordering explicit in the final design review.
