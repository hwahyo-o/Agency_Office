# Local agent runner

The runner is a Node.js process on Linux/macOS or Windows WSL that polls the web queue and starts a local interactive Codex CLI app-server session. `runner.mjs` is a minimal first adapter; it currently sends the final answer to the thread and saves the Codex thread reference for follow-up work.

## Required behavior

- Start or resume an interactive Codex session for each selected employee and retain its session reference across messages.
- Subscribe to or poll the platform for work using a machine-scoped credential. Store the credential locally with owner-only file permissions and make it revocable from the web app.
- Open a fresh worktree or configured project directory for each task. Do not let two employees edit the same checkout concurrently.
- Forward progress, messages, and status updates to the assigned thread. A human can continue the same session in the terminal and hand it back to the runner.
- Use explicit adapter interfaces so Claude Code, Gemini CLI, OpenCode, and other local interactive CLIs can be connected without changing the message protocol.
- Require an approval record before protected actions. The runner must reject unapproved requests to send external messages, publish, change permissions, delete unrecoverable data, or incur charges.
- Reconnect with backoff after network loss and resume queued work without duplicating a completed run.

## Codex adapter

Use the locally installed Codex CLI and its app-server protocol for persistent threads, streamed events, interruptions, and approvals. The app-server command is currently marked experimental and is not supported for production workloads. Keep it behind the adapter interface and pin or report its CLI version. Do not make the web control plane depend on app-server internals. This MVP rejects app-server approval requests because the web approval flow is not implemented yet.

The local CLI should use the user's existing Codex sign-in. Do not require an OpenAI API key for the primary adapter.

## Run it locally

1. Install Node.js 18+ and the Codex CLI, then sign in to Codex on that PC.
2. Apply the Supabase migrations in filename order and configure `SUPABASE_SERVICE_ROLE_KEY` in the Next.js server environment only.
3. Deploy the web control plane, sign in, open **실행기 연결**, register the PC, and copy the one-time token.
4. Copy `runner.example.json` to `~/.config/agency-office/runner.json`. Set the deployed `apiUrl`, one-time `token`, and absolute `projectDir`.
5. Restrict the config file to your account (for example, `chmod 600 ~/.config/agency-office/runner.json`) and run `node platform/runner/runner.mjs`.

The runner sends only task text, role instructions, status, and final response through the authenticated API. It does not receive a Supabase service key. Select a project directory whose contents you are comfortable allowing Codex to work with.

## Trust boundary

The runner never receives the Supabase service-role key. The web API validates machine authentication and checks workspace ownership before returning work. Agent instructions and task messages are untrusted data; they cannot grant access, approve an action, or override runner policy.
