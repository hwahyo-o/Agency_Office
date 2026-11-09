# Local agent runner

The runner is the long-lived, per-machine process that gives the web office access to interactive coding sessions. It will be installed on Linux/macOS and Windows WSL, following the Emma operating model.

## Required behavior

- Start or resume an interactive Codex session for each selected employee and retain its session reference across messages.
- Subscribe to or poll the platform for work using a machine-scoped credential. Store the credential locally with owner-only file permissions and make it revocable from the web app.
- Open a fresh worktree or configured project directory for each task. Do not let two employees edit the same checkout concurrently.
- Forward progress, messages, and status updates to the assigned thread. A human can continue the same session in the terminal and hand it back to the runner.
- Use explicit adapter interfaces so Claude Code, Gemini CLI, OpenCode, and other local interactive CLIs can be connected without changing the message protocol.
- Require an approval record before protected actions. The runner must reject unapproved requests to send external messages, publish, change permissions, delete unrecoverable data, or incur charges.
- Reconnect with backoff after network loss and resume queued work without duplicating a completed run.

## Codex adapter

Use the locally installed Codex CLI and its app-server protocol for persistent threads, streamed events, interruptions, and approvals. The app-server command is currently marked experimental, so keep it behind the adapter interface and pin or report its CLI version. Do not make the web control plane depend on app-server internals.

The local CLI should use the user's existing Codex sign-in. Do not require an OpenAI API key for the primary adapter.

## Trust boundary

The runner never receives the Supabase service-role key. The web API validates machine authentication and checks workspace ownership before returning work. Agent instructions and task messages are untrusted data; they cannot grant access, approve an action, or override runner policy.
