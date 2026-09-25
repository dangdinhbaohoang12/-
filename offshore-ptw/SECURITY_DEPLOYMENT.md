# PTW security boundary deployment

The browser is no longer a trusted authorization or credential boundary.

## Database

Apply `supabase/migrations/001_ptw_security.sql`, `002_ptw_auth_lockout.sql`, `003_ptw_permit_number_revision_unique.sql`, and `004_ptw_user_transaction.sql` in that order against the production PostgreSQL database before deploying the API or new frontend. If an older version of 002 was already applied, reapply the current 002 before deploying the API so `ptw_reserve_auth_attempt` is available.

The migrations create server-owned tables for users, permits, notifications and append-only audit records. Client roles do not receive table grants; the API uses the Supabase service-role key.

## Server environment

Configure the variables from .env.example in the Vercel/server environment. Never prefix secrets with VITE_, never commit real values, and never expose the service-role key, session secret or audit secret to the browser.

The bootstrap OIM is created only when the database has no users. Its PIN comes from BOOTSTRAP_OIM_PIN, is hashed with server-side scrypt, and is never returned to the frontend. Change that PIN on first login.

## Runtime model

The browser keeps only transient UI/session state. The authenticated session is an HttpOnly signed cookie. Every permit mutation (CREATE_DRAFT, UPDATE_DRAFT, TRANSITION, ADD_GAS_TEST, ACK_SIMOPS, REQUEST_REVISION) reloads the authoritative user and permit from PostgreSQL, checks server-side RBAC/ownership and re-verifies the caller's PIN, applies the existing workflow engines, and writes permit + audit + notifications transactionally via the permit transaction RPC. REFRESH_EXPIRIES is the only mutation that skips a PIN check, since it is a system job with no user-supplied RBAC/PIN context. Account and notification mutations use their own dedicated RPC/queries, not the permit transaction RPC.

Login failures are counted server-side. Five consecutive failures lock the account for 15 minutes. Disabling an account or changing its PIN increments session_version and invalidates existing sessions.

The frontend RBAC/validation code remains intentionally present as defense-in-depth and UX gating, but it is not the final authorization boundary.

## Local development

`npm run dev` only starts the Vite dev server for the frontend; it never invokes `api/ptw.ts` (Vite serves the TypeScript module as source, it does not run it as a request handler). To exercise login/hydration locally you need the API handler running as an actual serverless function:

- Install the Vercel CLI (`npm i -g vercel`) and run `vercel dev` from `offshore-ptw` in a separate terminal. This serves `api/ptw.ts` (default `http://localhost:3000`) with the same request/response shape Vercel uses in production.
- `npm run dev`'s Vite server proxies `/api/*` to that function host (`http://localhost:3000` by default; override with `PTW_API_PROXY_TARGET` if `vercel dev` runs on a different port).
- Populate the server environment variables from `.env.example` (via `vercel env pull` or a local `.env`) before starting `vercel dev`, otherwise the handler fails closed on missing/placeholder secrets.

If you only need to iterate on the API handler itself, `vercel dev` alone (without the Vite proxy) is sufficient.

## Migrating existing data

This rollout starts from an **empty** authoritative database (migrations 001 through 004 create schema and functions but import no rows). Existing users, permits, and notifications previously persisted in the browser (localStorage/IndexedDB, depending on the prior implementation) are **not** automatically migrated. Export and import them before end users depend on continuity of accounts, PINs, open permits, or unread alerts.

Before switching production traffic to this frontend/backend:

1. **Export** existing browser-persisted users, permits, and notifications to JSON from the old client, for every platform/session that has live data. Keep notification IDs, recipient and permit IDs, timestamps, and read/unread state.
2. **Transform**: for users, PINs must be re-hashed server-side (`hashPinServer`, scrypt) since old client-side PIN storage/hashing is not compatible with `ptw_users.pin_hash`'s format – this typically means resetting every migrated user's PIN and forcing `must_change_pin = true`, unless the export can be authenticated against the old hash and re-hashed with the new PIN at export time. For permits, map each exported permit's shape onto the `Permit` type (see `src/types/domain.ts`) and insert as `ptw_permits.data` with a fresh `version`. For each notification, map the `AppNotification` fields (same file) into `ptw_notifications`: `id`, `recipient_user_id`, `permit_id`, `permit_number`, `event`, `message`, `severity`, `created_at`, `read_at`, and the complete notification as `data`. Preserve `readAt` in both `read_at` and `data` for read alerts; keep `read_at` null and omit `readAt` from `data` for unread alerts. Resolve any changed user/permit IDs in both the columns and `data`, and reconcile missing references before import because both IDs have foreign keys.
3. **Import**: write users first, permits second, then notifications into `ptw_users`, `ptw_permits`, and `ptw_notifications` (e.g. via a one-off script using the service-role key). Complete this before the bootstrap-OIM path in `api/ptw.ts` (`ensureBootstrapUser`) ever runs — that path only fires when `ptw_users` is empty, so importing first avoids creating an unwanted bootstrap account.
4. **Validate**: compare exported and imported counts and IDs for users, permits, and notifications; check permit numbers and unread counts per recipient. Perform at least one authenticated login per migrated platform and confirm its notifications, including unread alerts, appear in the new client before removing read access to the old browser-persisted store. The API returns the newest 300 notifications per user; if a user has unread alerts outside that window, increase the API retrieval limit before cutover and repeat validation.

**Until this export/import/validation step has been completed and verified, do not deploy this frontend to production for any platform that has existing browser-persisted users, permits, or notifications.** Deploying against an empty database in that situation hides those users' accounts, permit history, and unread alerts from the new client (the old data still exists in their browser, but the new authoritative backend has no record of it and a fresh bootstrap OIM will be created instead).

New deployments with no prior browser-persisted data (fresh installs) do not need this step and can proceed directly to the deployment checklist below.

## Deployment

From offshore-ptw:

- npm ci
- npm run typecheck
- npm run typecheck:api
- npm test
- npm run build

Vercel should use offshore-ptw as the project root so api/ptw.ts and the Vite build are deployed together.
