# Emma-style AI team platform

This folder contains a separate Next.js implementation beside the existing local AI Office app. The current milestone imports all valid Agency Agents roles, provides Supabase authentication, creates a personal workspace and default channel, and stores task threads, messages, and selected employee runs in Supabase. The app currently queues runs; the local Codex runner and streamed employee replies are still in progress.

## Architecture decisions

- **Web/control plane:** Next.js App Router, deployed to Vercel. Use Vercel Hobby for personal, non-commercial prototyping only. Upgrade to Vercel Pro before using the deployment for company work or another commercial purpose.
- **Database and identity:** Supabase Auth and Postgres. Row Level Security is enabled in the initial schema.
- **Analytics:** Firebase Analytics, initialized only in supported browsers and only when its public configuration is present.
- **Agent runtime:** Codex CLI is the primary interactive session. Other compatible local CLIs are adapters. Persistent agent processes stay on a user's machine; Vercel functions do not host the long-lived CLI sessions.
- **Messaging model:** channels contain work threads; messages can call role-based employees; each run is attached to its source message and machine; requested consequential actions wait for human approval.
- **Role library:** import all valid agent definitions in the 18 source divisions from `msitarzewski/agency-agents`. Documentation, examples, strategy playbooks, and integration guides are not treated as employee profiles. Full Markdown instructions and source metadata remain stored verbatim. MIT attribution is stored with the import.

## Import the employee library

Create a Supabase project and apply `supabase/migrations/202611090001_initial.sql`. Then run the importer from this folder with a server-side service key:

```sh
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key> \
node scripts/import-agency-agents.mjs
```

The service key is only for this one-time import. Do not place it in the browser bundle or commit it. Import is idempotent by `source_path`.

## Run the web app locally

```sh
cd web
cp .env.example .env.local
# Set the Supabase URL and publishable key, plus Firebase web config.
npm install
npm run dev
```

Authentication currently uses Supabase email and password. Configure email confirmation and password recovery in Supabase before inviting other users.

## Deploy

Connect this repository to Vercel and set the environment variables in `web/.env.example`. Set the project root directory to `platform/web`. The Hobby deployment is for personal, non-commercial use only. Do not use it for company work; upgrade to Pro before that use begins. Deploy after the Next.js app is available in the selected Git branch.

Firebase web configuration has been provided for project `ai-team-9c0b5`. Add its `NEXT_PUBLIC_FIREBASE_*` values in the Vercel project environment settings for the personal preview deployment; keep the values out of source control.

## Next milestones

1. Implement the local Codex app-server adapter, session persistence, and reconnect behavior.
2. Add secure machine enrollment and an outbound work-claim protocol; never expose a Supabase service key to the runner.
3. Stream Codex events and employee replies into the corresponding work thread.
4. Add other CLI adapters and approval controls.
5. Complete end-to-end verification, then deploy the personal preview to Vercel Hobby.
