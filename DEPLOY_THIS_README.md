# Deploy PTS to Cloudflare Pages

## 1) Prerequisites
- Cloudflare account with Pages, D1, R2, and KV enabled.
- GitHub repository connected to Cloudflare Pages.

## 2) Bindings
Update `wrangler.toml` placeholders:
- `d1_databases.database_id`
- `r2_buckets.bucket_name` (if different)
- `kv_namespaces.id`

## 3) Provision resources
- Create D1 database and apply schema:
  - `wrangler d1 execute pts --file=./schema.sql`
- Create/confirm R2 bucket for uploads.
- Create KV namespace for config/feature flags/cache.

## 4) Cloudflare Pages project settings
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `.`
- Functions directory: `functions`
- Environment variables/bindings: configure D1 (`DB`), R2 (`UPLOADS`), KV (`CONFIG_KV`)

## 5) Verification checklist
- `GET /api/health` returns binding readiness.
- Required pages load without broken links.
- Upload and bulk upload store objects in R2 and metadata in D1.
- `resolution-guide.html` does not appear in evergreen nav.
- `gamma-view.html` shows placeholder when no URL exists.

## 6) Credentialed integrations
Restricted APIs remain placeholders by design. After credential approval, implement provider adapters in Pages Functions and update docs/config flags.
