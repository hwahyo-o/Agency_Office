# Local agent runner

The runner is the long-lived, per-machine process that gives the web office access to interactive coding sessions. It will be installed on Linux/macOS and Windows WSL, following the Emma operating model.

## Required behavior

- Start an interactive Codex CLI session per configured employee identity and retain its session reference across messages.
- Subscribe to or poll the platform for work using a machine-scoped credential. The credential is stored locally with owner-only file permissions and can be revoked from the web app.
- Open a fresh worktree or configured project directory for each task. Do not let two employees edit the same checkout concurrently.
- Forward messages and status updates to the assigned thread. A human can continue the same session in the terminal and hand it back to the runner.
- Use explicit adapter interfaces so Claude Code, Gemini CLI, OpenCode, and other local interactive CLIs can be connected without changing the message protocol.
- Require an approval record before protected actions. The runner must reject unapproved requests to send external messages, publish, change permissions, delete unrecoverable data, or incur charges.
- Reconnect with backoff after network loss and resume queued work without duplicating a completed run.

## Trust boundary

The runner never receives the Supabase service-role key. The web API validates machine authentication and checks workspace ownership before returning work. Agent instructions are untrusted task content; they cannot grant access, approve an action, or override runner policy.
