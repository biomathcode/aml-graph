# Developer API

Create an API key in **Settings**. The secret is shown once and stored as a SHA-256 digest. Use `Authorization: Bearer kyc_...`. Revocation takes effect immediately. Keys have the same tenant scope as their owner; key management itself requires browser authentication.

| Method | Path | Body / purpose |
| --- | --- | --- |
| GET | `/api/v1/sessions` | List your sessions |
| POST | `/api/v1/sessions` | `{ "workflowId": "...", "email": "...", "expiresInHours": 168 }` |
| GET | `/api/v1/sessions/:id` | Session and collected document metadata |
| POST | `/api/v1/sessions/:id/review` | `{ "decision": "approved" or "rejected", "notes": "..." }` |
| GET | `/api/v1/documents?term=passport` | Search document filenames |
| POST | `/api/v1/uploads` | `{}` or `{ "sessionId": "..." }`, returns `{ "url": "/api/uploads/..." }` |
| POST | returned upload URL | Raw file bytes with Content-Type; optional URI-encoded X-File-Name |
| GET | `/api/files/:id` | Authenticated private download |
| GET | `/api/health` | PostgreSQL/Redis readiness; no cloud credential probe |

An upload ticket expires after five minutes and can be used only once. Maximum body size is 20 MB; accepted signatures are PDF, JPEG, PNG, and WebP. Session creation returns `sessionId` and `publicToken`. Share `<APP_URL>/sessions/<sessionId>?token=<publicToken>`. Never put API keys in URLs. Tokens authorize collection, not approval or access to the account's document library.

Errors use `{ "error": "message" }` and HTTP 400, 401, 403, 404, 409, 410, 413, 415, 429, or 503 as appropriate. The UI also uses named operations under `/api/rpc/:operation`, described by shared TypeScript contracts in `packages/contracts`.

## Webhooks

Events: `session.submitted`, `session.reviewed`. Example payload:

```json
{"id":"event-uuid","event":"session.reviewed","sessionId":"session-uuid","decision":"approved"}
```

Headers:

- `X-OpenKYC-Event-ID`: stable event UUID, suitable for deduplication.
- `X-OpenKYC-Timestamp`: Unix seconds for this delivery.
- `X-OpenKYC-Signature`: hex HMAC-SHA256 of `<timestamp>.<raw-request-body>` using the tenant's signing secret.

Verify the raw body, compare signatures in constant time, reject stale timestamps, and deduplicate event IDs. Return a 2xx status after accepting the event. Delivery is at least once; after a crash or timeout, duplicates are possible. Redirects are not followed. Only administrator-allowlisted HTTPS hosts resolving to public IPv4 are accepted. After five failed attempts the event is marked failed and shown in Settings. Rotate the signing secret there when needed.
