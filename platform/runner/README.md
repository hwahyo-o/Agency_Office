# Local agent runner

The runner is a Node.js process on Linux/macOS or Windows WSL that polls the web queue and starts a local CLI session. Codex is the default adapter and uses its app-server session. Claude Code and Gemini CLI are optional adapters that use their own non-interactive commands and resume by CLI session ID. Each adapter returns final replies; only Codex currently streams progress and routes supported approval requests to the web UI.

## Required behavior

- Start or resume the selected CLI session for each employee and retain its session reference across messages. Register a runner with the same adapter selected for the task.
- Subscribe to or poll the platform for work using a machine-scoped credential. Store the credential locally with owner-only file permissions and make it revocable from the web app.
- Create one isolated Git worktree and branch per conversation thread. Serialize employee runs within that thread so they share changes without editing the same checkout concurrently.
- Forward progress, messages, and status updates to the assigned thread. A human can inspect the retained worktree branch; changes are not merged automatically.
- Use explicit adapters: Codex is primary; Claude Code and Gemini CLI are supported optional adapters. OpenCode is not enabled yet.
- For Codex, require the web approval record for supported command and file-change approval requests; reject unknown approval request types. Claude Code and Gemini CLI use their own permission configuration, which this platform does not mediate.
- Reconnect with backoff after network loss and resume queued work without duplicating a completed run.

## Codex adapter

Use the locally installed Codex CLI and its app-server protocol for persistent threads, streamed events, interruptions, and approvals. The app-server command is currently marked experimental and is not supported for production workloads. Keep it behind the adapter interface and pin or report its CLI version. Do not make the web control plane depend on app-server internals. The web UI supports one-time approve/decline for command and file-change requests. Unknown approval request types are rejected. The app-server remains experimental and is not supported for production workloads.

The local CLI should use the user's existing Codex sign-in. Do not require an OpenAI API key for the primary adapter.

## Run it locally

1. Install Node.js 18+ and the Codex CLI, then sign in to Codex on that PC.
2. Apply the Supabase migrations in filename order and configure `SUPABASE_SERVICE_ROLE_KEY` in the Next.js server environment only.
3. Deploy the web control plane, sign in, open **실행기 연결**, choose the adapter for this runner, register the PC, and copy the one-time token.
4. Copy `runner.example.json` to `~/.config/agency-office/runner.json`. Set the deployed `apiUrl`, one-time `token`, and absolute `projectDir` to the Git repository root.
5. Restrict the config file to your account (for example, `chmod 600 ~/.config/agency-office/runner.json`) and run `node platform/runner/runner.mjs`.

The runner sends task text, role instructions, progress, approval metadata when supported by the adapter, and final responses through the authenticated API. It does not receive a Supabase service key. Each thread gets a branch in a sibling `.agency-office-worktrees/<thread-id>` folder. Review the branch before merging it into your main checkout.

## Trust boundary

The runner never receives the Supabase service-role key. The web API validates machine authentication and checks workspace ownership before returning work. Agent instructions and task messages are untrusted data; they cannot grant access, approve an action, or override runner policy.
