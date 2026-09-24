# PTW security boundary deployment

The browser is no longer a trusted authorization or credential boundary.

## Database

Run the Supabase migration in supabase/migrations/001_ptw_security.sql against the production PostgreSQL database before deploying the new frontend.

The migration creates server-owned tables for users, permits, notifications and append-only audit records. Client roles do not receive table grants; the API uses the Supabase service-role key.

## Server environment

Configure the variables from .env.example in the Vercel/server environment. Never prefix secrets with VITE_, never commit real values, and never expose the service-role key, session secret or audit secret to the browser.

The bootstrap OIM is created only when the database has no users. Its PIN comes from BOOTSTRAP_OIM_PIN, is hashed with server-side scrypt, and is never returned to the frontend. Change that PIN on first login.

## Runtime model

The browser keeps only transient UI/session state. The authenticated session is an HttpOnly signed cookie. Every business mutation reloads the authoritative user and permit from PostgreSQL, checks server-side RBAC and PIN, applies the existing workflow engines, and writes permit + audit + notifications transactionally.

Login failures are counted server-side. Five consecutive failures lock the account for 15 minutes. Disabling an account or changing its PIN increments session_version and invalidates existing sessions.

The frontend RBAC/validation code remains intentionally present as defense-in-depth and UX gating, but it is not the final authorization boundary.

## Deployment

From offshore-ptw:

- npm ci
- npm run typecheck
- npm run typecheck:api
- npm test
- npm run build

Vercel should use offshore-ptw as the project root so api/ptw.ts and the Vite build are deployed together.