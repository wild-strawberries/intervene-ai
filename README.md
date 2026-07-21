# InterveneAI

A minimal Manifest V3 Chrome extension that records domain-only tab activity during a session, reports the most frequent switches between ChatGPT and external websites, and classifies the active supported tab into a semantic label.

## Built with Codex and ChatGPT

InterveneAI was designed and implemented with Codex, which accelerated the extension architecture, Manifest V3 service worker, privacy-aware browser instrumentation, recommendation logic, and UI iteration. ChatGPT is both the workflow context the extension observes and the AI layer used by Smart analysis: it interprets a compact, user-initiated session summary to identify likely bottlenecks and recommend automation tools.

The project uses the OpenAI Responses API with structured outputs for Smart analysis. The extension keeps tab data local by default and only sends the minimized analysis payload after the user explicitly selects **Run Smart analysis**.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `chrome-extension` folder.
4. Open the extension popup, start recording, switch between ChatGPT and other sites, then stop recording to see the top three results.

The semantic analyzer uses only DOM structure and the current site's route to identify a label such as `GitHub pull request` or `Google document`. It sends only that label to the service worker, which keeps it in memory and never writes it to storage. URLs, page titles, page text, markup, analytics, and network requests are never stored or sent.

## Smart analysis

The workflow is intentionally two-stage: **Start session** / **Stop & recommend** produces local tab-switch recommendations. **Smart analysis** is enabled only after the session ends. Each tester enters their own OpenAI Platform API key, which stays only in `chrome.storage.session` and clears when Chrome closes. The request uses `store: false`, which avoids Responses application-state storage. OpenAI notes that its default abuse-monitoring logs can retain API content for up to 30 days; use an organization with approved data controls if that is incompatible with your privacy requirements.

During that user-initiated request, the extension sends at most five domains, contexts, and transitions and, only if the active tab is ChatGPT, up to 450 characters from the two latest user turns plus conversation counts. That excerpt is not written to extension storage and is discarded after the response. Smart analysis uses minimal reasoning with a 600-token response budget; if the model cannot produce a result, the extension returns a local low-confidence workflow diagnosis instead. Recommendations are ranked locally from the packaged `combined_tools_output.csv` catalog, and the report is not persisted.

For a deadline demo, distribute the extension as an unpacked build and have each tester provide their own key. Do not embed or share an API key in the extension.
