# AI Team Office (open-source local app)

This adds a local AI team workspace to the existing ChatGPT plan connection checker without replacing that checker.

## Run

1. Download or clone this repository.
2. The launcher uses an existing Node.js 22+ runtime or downloads the official portable Node.js 22 ZIP into your user app-data folder, then checks its SHA-256 checksum. It does not install Node.js system-wide or require administrator permission.
3. On Windows, run `START-OFFICE.cmd`. On macOS/Linux, run `node office/server.mjs` from the repository folder.
4. Open `http://127.0.0.1:1455/`, choose **Continue with ChatGPT**, then review and approve the requested ChatGPT plan usage.
5. Pick a model available to the connected account and submit a task to the orchestrator.

The app stores its refreshable OAuth profile under the current OS user's application-data directory, outside this repository. On POSIX systems it requests owner-only directory and file permissions. Disconnecting removes the saved profile. No OpenAI API key is requested and there is no API-key or paid-API fallback. Requests consume eligible ChatGPT plan usage and may be subject to account limits. This app does not read ChatGPT conversation history.

The roster is loaded from the public `msitarzewski/agency-agents` GitHub repository. The orchestrator selects up to three agents, fetches their Markdown instructions, runs their assigned subtasks, then synthesizes the results. Every model call uses the user's selected model, `store:false`, and streaming Responses API. Keep this app running locally; a static GitHub Pages page by itself cannot handle the loopback OAuth callback or safely store the user's tokens.

This is an early implementation. Review the permissions screen and source before authorizing it. Disconnect the app in ChatGPT settings to revoke access.
