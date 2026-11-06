# AI Team Office (open-source local app)

This adds a local AI team workspace to the existing ChatGPT plan connection checker without replacing that checker.

## Windows app download

1. Download the latest **AI-Team-Office-Windows-x64.zip** from [GitHub Releases](https://github.com/hwahyo-o/Agency_Office/releases/latest).
2. Extract the entire ZIP to a folder (for example, Downloads\AI Team Office).
3. Double-click **AI Team Office.exe**. It starts the local service and opens the workspace in your browser. Use the taskbar notification-area icon to reopen the workspace or quit the app.

The ZIP bundles the official Node.js 22.21.1 runtime and a self-contained Windows launcher. Node.js does not need to be installed separately, and the app does not download or install runtimes on first launch. Keep the extracted `runtime` and `office` folders beside the EXE. The app needs internet access when connecting the ChatGPT account, listing models, and loading the public agent instructions.

For source developers, `START-OFFICE.cmd` remains available and can use an existing Node.js installation or download a verified portable runtime. On macOS/Linux, run `node office/server.mjs` from the repository folder.

The app stores its refreshable OAuth profile under the current OS user's application-data directory, outside this repository. On POSIX systems it requests owner-only directory and file permissions. Disconnecting removes the saved profile. No OpenAI API key is requested and there is no API-key or paid-API fallback. Requests consume eligible ChatGPT plan usage and may be subject to account limits. This app does not read ChatGPT conversation history.

The roster is loaded from the public `msitarzewski/agency-agents` GitHub repository. The orchestrator selects up to three agents, fetches their Markdown instructions, runs their assigned subtasks, then synthesizes the results. Every model call uses the user's selected model, `store:false`, and streaming Responses API. Keep this app running locally; a static GitHub Pages page by itself cannot handle the loopback OAuth callback or safely store the user's tokens.

This is an early implementation. Review the permissions screen and source before authorizing it. Disconnect the app in ChatGPT settings to revoke access.
