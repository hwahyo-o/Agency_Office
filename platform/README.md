# Emma-style AI team platform

This folder contains a separate Next.js implementation beside the existing local AI Office app. The current milestone imports all valid Agency Agents roles, provides Supabase authentication, creates a personal workspace and default channel, and stores task threads, messages, and selected employee runs in Supabase. The local runner claims adapter-matched work, isolates each thread in a Git worktree, renews active-run leases, and returns replies. Codex streams progress and pauses supported command/file-change requests for a person's decision.

## Architecture decisions

- **Web/control plane:** Next.js App Router, deployed to Vercel. Use Vercel Hobby for personal, non-commercial prototyping only. Upgrade to Vercel Pro before using the deployment for company work or another commercial purpose.
- **Database and identity:** Supabase Auth and Postgres. Row Level Security is enabled in the initial schema.
- **Analytics:** Firebase Analytics, initialized only in supported browsers and only when its public configuration is present.
- **Agent runtime:** Codex CLI is the default and primary session. Claude Code and Gemini CLI are optional local adapters. Persistent agent processes stay on a user's machine; Vercel functions do not host long-lived CLI sessions. The app invokes each locally installed CLI using the user's existing sign-in; it does not send a provider API key.
- **Adapter limits:** Codex uses the app-server path for progress and web approval prompts; its app-server is experimental. Claude Code and Gemini CLI run non-interactively and can resume by CLI session ID, but their permission prompts and progress are not routed through the web UI. Each CLI's installed version, account entitlements, and own permission defaults apply; no free usage is guaranteed.
- **Messaging model:** channels contain work threads; messages can call role-based employees; each run is attached to its source message and machine; supported Codex command/file-change requests wait for human approval.
- **Role library:** import all valid agent definitions in the 18 source divisions from `msitarzewski/agency-agents`. Documentation, examples, strategy playbooks, and integration guides are not treated as employee profiles. Full Markdown instructions and source metadata remain stored verbatim. MIT attribution is stored with the import.

## Import the employee library

Create a Supabase project and apply all SQL migrations in `platform/supabase/migrations` in filename order. Then run the importer from this folder with a server-side service key:

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

## Connect a local CLI runner

Apply the runner migration, add `SUPABASE_SERVICE_ROLE_KEY` only to the Next.js server environment, and deploy the web app before enrolling a machine. The key is used only by server API routes and must never be added to browser variables or runner configuration. In the app, choose **실행기 연결**, enroll a machine, and save the one-time token on the local PC. The token is stored as a SHA-256 hash in Supabase and cannot be displayed again.

The runner requires Node.js 18 or later, the selected CLI signed in on the PC, and a configured Git repository root. The runner and task must use the same adapter. Copy `platform/runner/runner.example.json` to `~/.config/agency-office/runner.json`, then set `apiUrl`, `token`, and `projectDir`; restrict the file to the account owner (for example, `chmod 600`). Run `node platform/runner/runner.mjs` from the repository. Each work thread receives a separate branch under a sibling `.agency-office-worktrees` directory; runs in one thread are serialized and reuse that worktree. Changes are not merged automatically. The Codex app-server transport remains experimental and unsupported for production workloads. The web UI supports one-time approve/decline for supported Codex command and file-change requests; unknown request types are rejected. Claude Code and Gemini CLI use their own permission defaults, which are not overridden or mediated by the web approval UI.

## Deploy

Connect this repository to Vercel and set the environment variables in `web/.env.example`. Set the project root directory to `platform/web`. The Hobby deployment is for personal, non-commercial use only. Do not use it for company work; upgrade to Pro before that use begins. Deploy after the Next.js app is available in the selected Git branch.

Firebase web configuration has been provided for project `ai-team-9c0b5`. Add its `NEXT_PUBLIC_FIREBASE_*` values in the Vercel project environment settings for the personal preview deployment; keep the values out of source control. Add `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable and never expose it to browser code or commit it.

## Next milestones

1. Add adapters for other local interactive coding CLIs.
2. Improve reconnect recovery and add an installer for Windows/macOS/Linux.
3. Verify the app-server approval and worktree flows on supported Codex versions.
4. Deploy the personal preview to Vercel Hobby after the remaining features are ready.
