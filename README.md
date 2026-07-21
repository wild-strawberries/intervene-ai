# InterveneAI diagnosis backend

This service keeps the OpenAI API key on the server and exposes a small `/api/diagnose` endpoint to the Chrome extension. It does not write request bodies or diagnoses to disk.

## Run locally

1. Use Node.js 18 or later.
2. Export `OPENAI_API_KEY` in your shell (use `.env.example` as a reference for the other variables).
3. Run `npm start` from this folder.
4. Set the extension's Smart analysis server to `http://localhost:8787`.

## Production requirements

Deploy this service behind HTTPS, set `ALLOWED_EXTENSION_ORIGIN` to your published Chrome extension origin, and use a server-side secret manager for `OPENAI_API_KEY`. The included in-memory client rate limit is deliberately minimal; add real user authentication and durable, distributed rate limiting before making the endpoint publicly available. Do not treat a Chrome extension ID or a client-generated identifier as authentication.
