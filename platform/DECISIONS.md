# Platform decisions

## Deployment target

Use **Vercel** for the Next.js app. Its deployment path is first-party and does not require adapting the Next.js runtime. Cloudflare remains a viable alternative, but its current Next.js path uses a compatibility layer (vinext) or adapter. The agent runtime does not belong in either web hosting provider because it must keep local interactive CLI sessions alive.

The free Vercel Hobby tier is limited to personal, non-commercial use. This initial deployment therefore targets personal use. A commercial rollout requires selecting an eligible hosting plan before publication.

## Agent execution and handoff

Each configured employee is a Codex custom agent profile derived from the source Markdown. A runner on a user's machine translates the selected employee profile into a local Codex CLI session. A shared task thread carries the task, handoffs, and replies. The runner reports events to the web control plane; it does not expose a shell or Supabase service credential to browser clients.

## Source ingestion

The source repository currently has many Markdown files beyond agent role definitions. The importer uses the official `divisions.json` list and includes only files with valid role frontmatter (`name` and `description`). This captures nested profiles and skips contribution guides, examples, and playbooks. Each record stores the complete source Markdown, source path, repository URL, and source revision. The MIT license text is retained in Supabase for attribution.
