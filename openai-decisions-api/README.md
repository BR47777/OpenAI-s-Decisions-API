# Decision Desk

A full-stack demo of typed decisions for support routing, predicates, and ordered rubrics.

## Run

```bash
cd openai-decisions-api
npm start
```

Open http://localhost:3000.

By default, the app uses a local demonstration evaluator. It does not send data to OpenAI.

## Live Decisions API

Enter an OpenAI API key in the "OpenAI credential" field in the app. The key is
kept only in the current browser tab's session storage and is sent only to the
local application server, which forwards live requests to the configured endpoint.
Use "Clear key" to remove it.

For server-side configuration, you can still set these optional environment variables:

- `DECISIONS_API_URL` (default: `https://api.openai.com/v1/decisions`)
- `DECISIONS_MODEL` (default: `gpt-6-luna`)
- `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` for environment-only use

Start the app:

```bash
npm start
```

The UI reports "Live API" while a key is active. For environment-only live mode,
set `DECISIONS_LIVE=1` and `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` before starting.

No dependency installation is required. The app uses Node.js built-in modules.

## Python model router

The `python/` directory contains the separate cost-aware Responses API example.
It estimates prompt tokens for model selection, chooses the lowest-priced model
allowed for the task, then reports cost from actual API token usage.

```bash
cd python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python run_router.py --task summary \
  "Summarize: Python is widely used in AI and automation."
python run_router.py --task reasoning \
  "Explain how to debug a deadlock in a multithreaded Python application."
```

The sample policy permits Luna and Terra for summaries and extraction, and only
Terra for reasoning and coding. These are configurable example prices and task
rules, not claims about universal model capability. Verify current model
availability and pricing before using the estimates in production.

Run the router tests without making API calls:

```bash
cd python
python -m unittest
```
