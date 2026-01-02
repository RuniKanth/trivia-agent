# Trivia Agent

A full-stack TypeScript trivia game that generates multiple-choice questions on the fly using Gemini (primary) and OpenAI (fallback). The user is presented with 8 category tiles, selects 5, and receives 10 questions (2 per chosen category).

## Features

- React + Vite frontend with Tailwind CSS
- Node + Express backend (TypeScript)
- Agent coordinator uses Gemini (primary) and OpenAI (fallback)
- In-memory dedup store to avoid repeating questions per user/session (MVP)
- `.env.example` for API keys

## Quick start

1. Copy `.env.example` to `.env` and add your `GEMINI_API_KEY` and `OPENAI_API_KEY` and optional `NEWS_API_KEY`.

2. At repo root:

```bash
# Install for root control scripts (optional), or install inside client/server separately
cd client && npm install
cd ../server && npm install

# Run frontend
cd client && npm run dev

# Run backend
cd server && npm run dev
```

## Notes

- The `server/src/agent` module contains the code that calls the LLMs; integrate the official SDKs or update fetch wrappers for your provider.
- For production-grade persistence of used questions you should add Redis/Postgres instead of the in-memory store.

---

If you'd like, I can now implement the agent logic, backend routes, and polished UI components (category tiles, selection, quiz flow, results).
