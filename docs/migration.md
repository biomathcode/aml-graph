# Migrating from Convex

The runtime no longer connects to Convex. Database tables and auth are created with `npm run db:migrate`. Existing production data is **not** automatically copied or deleted.

1. Back up and export the Convex deployment, including storage. Unpack it to a local directory. The importer expects `<table>/documents.jsonl` files.
2. Create destination users through the new application. Map old auth user IDs to new Better Auth IDs. Existing password hashes/auth sessions are not imported; use new accounts and password reset as appropriate.
3. Create an ownership map. Old documents/questionnaires lacked tenant ownership, so each ambiguous record needs an explicit mapping. No unowned record is assigned to an arbitrary account.

```json
{
  "users": {"old-auth-user-id":"new-better-auth-id"},
  "records": {"old-document-id":"new-better-auth-id", "old-question-id":"new-better-auth-id"},
  "files": {"old-storage-id":"storage/document.pdf"}
}
```

`files` values are paths relative to the unpacked export. Include mappings for every referenced image/PDF. Set the target database and storage environment variables first.

```sh
npx tsx scripts/import-convex.ts /path/to/export /path/to/ownership-map.json
npx tsx scripts/import-convex.ts /path/to/export /path/to/ownership-map.json --apply
```

The default is validation only. Apply preserves entity IDs, skips existing records owned by the same destination user, copies referenced files through the selected adapter, and rolls back newly copied objects on database failure. Existing rows are never overwritten. Imported sessions receive new secret public links; redistribute them through the dashboard. Review active session expiry and workflow settings after import.

Imported `siteAnalysis` records are historical analysis. Legacy individual feedback rows are preserved as `legacy_feedback`; new public forms store complete response records. Any custom Convex components outside the exported application tables need a separate migration. Verify row counts and sample private file downloads before retiring the old deployment. Keep the original export available for rollback.
