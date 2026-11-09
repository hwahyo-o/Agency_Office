# Emma-style AI team platform

This folder starts a separate Next.js implementation beside the existing local AI Office app. The first milestone imports the Agency Agents role definitions into Supabase and provides an authenticated employee catalog. The local runner and threaded orchestration are the next implementation milestone.

## Architecture decisions

- **Web/control plane:** Next.js App Router, deployed to Vercel. Vercel provides first-party Next.js deployment. The free Hobby plan is for personal, non-commercial use.
- **Database and identity:** Supabase Auth and Postgres. Row Level Security is enabled in the initial schema.
- **Analytics:** Firebase Analytics, initialized only in supported browsers and only when its public configuration is present.
- **Agent runtime:** Codex CLI is the primary interactive session. Other compatible local CLIs are adapters. Persistent agent processes stay on a user's machine; Vercel functions do not host the long-lived CLI sessions.
- **Messaging model:** channels contain work threads; messages can mention role-based employees; each agent run is attached to its source message and machine; requested consequential actions wait for a human approval.
- **Role library:** import all valid agent definitions in the 18 source divisions from `msitarzewski/agency-agents`. Documentation, examples, strategy playbooks, and integration guides are not treated as employee profiles. Full Markdown instructions and source metadata remain stored verbatim. MIT attribution is stored with the import.

## Import the employee library

Create a Supabase project and apply `supabase/migrations/202611090001_initial.sql`. Then run the importer from this folder with a server-side service key:

```sh
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key> \
node scripts/import-agency-agents.mjs
```

The service key is only for this one-time import. Do not place it in the browser bundle or commit it. Import is idempotent by `source_path`.

## Run the web catalog locally

```sh
cd web
cp .env.example .env.local
# Set the Supabase URL and publishable key, plus Firebase web config.
npm install
npm run dev
```

Authentication currently uses Supabase email and password. Configure email confirmation and password recovery in Supabase before inviting other users.

## Deploy

Connect this repository to Vercel and set the environment variables in `web/.env.example`. Set the project root directory to `platform/web`. Deploy the web application only after adding the Supabase migration and importing employee definitions.

## Next milestones

1. Add a local runner that keeps each Codex CLI session alive and reconnects after network interruptions.
2. Add secure machine enrollment and an outbound task-polling protocol; never expose a Supabase service key to the runner.
3. Implement channels, task threads, mentions, handoffs, approvals, and persisted agent replies.
4. Add CLI adapters and a user-visible connection/health status.
5. Complete end-to-end verification and deploy after Supabase and Firebase projects are configured.
