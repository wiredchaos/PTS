# Deploy PTS to Cloudflare Pages

## 1) Prerequisites
- Cloudflare account with Pages, D1, R2, and KV enabled.
- GitHub repository connected to Cloudflare Pages.

## 2) Bindings
`wrangler.toml` is pre-configured with real production IDs. Verify these match your Cloudflare dashboard:
- `d1_databases` → binding `DB`, database `pts_tax_lab`
- `r2_buckets` → binding `DOCS`, bucket `pts-documents`
- `kv_namespaces` → binding `PTS_KV`

## 3) Provision resources
- Create D1 database and apply schema:
  - `wrangler d1 execute pts_tax_lab --file=./schema.sql`
- Create/confirm R2 bucket: `pts-documents`
- Create/confirm KV namespace bound as `PTS_KV`.

## 4) Cloudflare Pages project settings
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `.`
- Functions directory: `functions`
- Environment bindings: D1 (`DB`), R2 (`DOCS`), KV (`PTS_KV`)

## 5) Verification checklist
- `GET /api/health` returns `{ ready: true }` with all three bindings `true`.
- Required pages load without broken links.
- Upload and bulk upload store objects in R2 (`pts-documents`) and metadata in D1 (`pts_tax_lab`).
- `resolution-guide.html` does not appear in evergreen nav.
- `gamma-view.html` shows placeholder when no URL exists.

## 6) Credentialed integrations
Restricted APIs remain placeholders by design. After credential approval, implement provider adapters in Pages Functions and update docs/config flags.
