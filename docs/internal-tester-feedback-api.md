# Internal tester feedback API

Signed `GET` routes for staff feedback captured from demo, preview, and tester flows. Both routes require HMAC request signing with the `management:read` scope (same as other management read APIs). Legacy bearer credentials are not accepted on these routes.

## List feedback

`GET /api/internal/v1/tester-feedback`

Query parameters match the existing reviewer contract: optional `environment`, `userId`, `severity`, `since`, `until`, `cursor`, `limit` (1–100, default 50), and `format` (`json` or `csv`). CSV export behavior is unchanged.

JSON responses:

```json
{
  "entries": [
    {
      "id": "cxxxxxxxxxxxxxxxxxxxxxxxx",
      "userId": "cyyyyyyyyyyyyyyyyyyyyyyy",
      "url": "/app/classes",
      "userAgent": "Mozilla/5.0 …",
      "whatIDid": "Opened /app/classes",
      "whatHappened": "The list loaded slowly",
      "whatIWish": "[screenshot stored on feedback record]",
      "severity": "medium",
      "environment": "demo",
      "createdAt": "2026-10-12T00:00:00.000Z",
      "actions": [{ "type": "route", "path": "/app/classes" }],
      "userEmail": "reviewer@example.test",
      "userName": "Demo Reviewer",
      "hasScreenshot": true
    }
  ],
  "nextCursor": null
}
```

List rows never include screenshot bytes or base64. `hasScreenshot` is `true` when a non-empty screenshot is stored for that row.

Successful JSON list and CSV export calls append `InternalPlatformApiAudit` rows with results `list.success` and `export.success`.

## Download screenshot

`GET /api/internal/v1/tester-feedback/:id/screenshot`

- `:id` must be a stored feedback row id (cuid). Malformed ids return `400`.
- Returns `404` when the row is missing or has no decodable screenshot.
- Response body is raw image bytes. Content-Type is `image/jpeg` by default, or `image/webp` when the stored payload is WebP.
- Headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Successful reads append an audit row with result `screenshot.success:<feedbackId>`. Audit entries never include image bytes, secrets, or email addresses beyond the signed actor header.
