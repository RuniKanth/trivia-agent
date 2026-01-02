# Trivia Agent Project - Setup & Status

**Last Updated:** January 2, 2026

## Quick Start

### 1. Install Dependencies
```powershell
npm install
npm --prefix client install
npm --prefix server install
```

### 2. Configure Environment
Create `server/.env`:
```
GEMINI_API_KEY=your_gemini_key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=your_openai_key
NEWS_API_KEY=your_news_api_key
PORT=4000
```

### 3. Run Development Servers
```powershell
# Terminal 1 - Server
npm --prefix server run dev

# Terminal 2 - Client  
npm --prefix client run dev
```

Server runs on `http://localhost:4000`
Client runs on `http://localhost:5173`

---

## Current Implementation Status

### ✅ Completed Features

1. **Dependency Management**
   - Root, client, and server packages installed
   - Fixed version mismatches (tailwindcss@^3.4.0, node-fetch@^3.3.2)
   - CommonJS module configuration for server

2. **Environment Configuration**
   - dotenv loading with explicit path in `server/src/index.ts`
   - Validates GEMINI and OPENAI keys at startup
   - Logs: "ENV keys loaded: { GEMINI: true, OPENAI: true }"

3. **LLM Integration**
   - **Gemini 3 Flash Preview** (Primary)
     - Google Generative AI REST API endpoint
     - `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
     - Response parsing: `candidates[0].content.parts[0].text`
   
   - **OpenAI gpt-4o-mini** (Fallback)
     - 3 retry attempts with exponential backoff (500ms, 1s, 2s)
     - Handles 429 rate-limit responses automatically

4. **Question Generation (Batched)**
   - Single LLM call generates questions for ALL categories at once
   - Supports 2 questions per category (configurable via `perCategory` parameter)
   - 10-day recency constraint for "Current News and Events" category
   - Deduplication via fingerprinting (question + answer hash)

5. **API Endpoints**
   - `GET /api/categories` - Returns available trivia categories
   - `POST /api/game` - Accepts `{ selectedCategories: string[] }`, returns `{ gameId, questions[] }`
   - `GET /api/game/:id` - Retrieves game with public fields
   - `POST /api/game/:id/answer` - Checks answer, returns `{ correct, explanation }`

6. **JSON Parsing & Error Handling**
   - Strips markdown code blocks (`\`\`\`json ... \`\`\``)
   - Converts literal newlines/tabs to spaces
   - **Regex extraction fallback**: When JSON fails, extracts questions using regex patterns:
     - `/"question"\s*:\s*"([^"]+)"/g`
     - `/"choices"\s*:\s*\[([^\]]+)\]/g`
     - `/"answerIndex"\s*:\s*(\d+)/g`
   - Maps extracted questions to selected categories round-robin style

### 🔄 Recent Changes

**Most Recent Fix:** Regex extraction fallback for malformed JSON
- Function: `extractQuestionsFromText(raw: string)` in `server/src/agent/agent.ts`
- Approach: Instead of trying to repair broken JSON, extract question data using regex patterns
- Benefit: Handles OpenAI's embedded newlines and stray characters without complex parsing

### 📋 Key Files

**Server Architecture:**
- `server/src/index.ts` - Express setup, dotenv loading, middleware
- `server/src/agent/agent.ts` - LLM calls, question generation, JSON parsing
- `server/src/routes/game.ts` - API endpoints
- `server/src/types.ts` - TypeScript interfaces (Category, StoredQuestion, etc.)
- `server/src/store/dedupStore.ts` - Deduplication via fingerprinting

**Client Architecture:**
- `client/src/App.tsx` - Main app component
- `client/src/pages/Home.tsx` - Category selection
- `client/src/pages/Game.tsx` - Question display and answering
- `client/src/pages/Results.tsx` - Score and review
- `client/src/utils/api.ts` - API client with axios

**Configuration:**
- `server/package.json` - Server dependencies (express, cors, dotenv, ts-node-dev, typescript)
- `client/package.json` - Client dependencies (react, vite, tailwindcss)
- `.env.example` - Environment variable template
- `vite.config.ts` - Vite config with `/api` proxy to `localhost:4000`

### 🧪 Testing the API

```powershell
# Test categories endpoint
curl http://127.0.0.1:4000/api/categories

# Test game creation with selected categories
$body = '{"selectedCategories":["History","Geography","Entertainment","Sports","Science"]}'
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/game -Method POST -ContentType "application/json" -Body $body

# Expected response:
# {
#   "gameId": "<uuid>",
#   "questions": [
#     {
#       "id": "<uuid>",
#       "category": "History",
#       "prompt": "What year did...",
#       "choices": ["...", "...", "...", "..."]
#     },
#     ...
#   ]
# }
```

---

## Known Issues & Workarounds

### JSON Parsing Challenges
- **Issue**: OpenAI sometimes returns JSON with embedded newlines in string values
- **Cause**: Model outputs multi-line strings without escaping newlines
- **Solution**: 
  1. Replace all literal `\n`, `\r`, `\t` with spaces
  2. Fall back to regex extraction if strict JSON parsing fails
  3. Do NOT attempt complex regex repairs (too fragile)

### LLM Response Quality
- Ensure prompt explicitly states: "Output ONLY raw JSON (no markdown, no backticks, no extra text)"
- Current prompt format in `generateQuestionsForCategories()`:
  ```
  You are a trivia expert. Generate exactly {perCategory} questions per category.
  Categories: {categories}.
  
  For "Current News and Events": use facts from {tenDaysAgo} to {todayIso} only.
  For others: use any verifiable facts.
  
  Output ONLY raw JSON (no markdown, no backticks, no extra text):
  [{...}]
  ```

---

## Debugging Commands

```powershell
# Watch server logs in real-time
npm --prefix server run dev

# Test API with detailed output
$response = Invoke-RestMethod -Uri http://127.0.0.1:4000/api/game `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"selectedCategories":["History"]}'
$response | ConvertTo-Json -Depth 10

# Check environment variables
$env:GEMINI_API_KEY  # Should be set
$env:OPENAI_API_KEY  # Should be set

# Kill process on port 4000
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Next Steps

1. **Test end-to-end workflow:**
   - Start server and client
   - Select categories on home page
   - Verify questions load and display correctly
   - Submit answers and check scoring

2. **Optimize LLM prompts:**
   - Test Gemini vs OpenAI response quality
   - Adjust prompt to reduce parsing errors

3. **Enhance UI/UX:**
   - Style category selection
   - Improve question card layout
   - Add loading states

4. **Deploy:**
   - Build client: `npm --prefix client run build`
   - Deploy to hosting platform (Vercel, Netlify, etc.)
   - Set environment variables on host

---

## Project Structure
```
trivia-agent/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/         # Home, Game, Results
│   │   ├── components/    # CategoryTile, QuestionCard
│   │   └── utils/         # api.ts (axios client)
│   ├── vite.config.ts     # Vite + proxy to :4000
│   └── package.json
├── server/                # Express.js backend
│   ├── src/
│   │   ├── index.ts       # Express setup
│   │   ├── agent.ts       # LLM calls & question generation
│   │   ├── routes/        # API endpoints
│   │   ├── store/         # Deduplication logic
│   │   └── types.ts       # TypeScript interfaces
│   ├── .env               # Environment variables (not in git)
│   └── package.json
├── .env.example           # Template for .env
├── package.json           # Root scripts
└── README.md
```

---

## Version Info

- **Node.js**: v22.20.0
- **npm**: v10.9.3
- **TypeScript**: 5.5.0 (server), 5.9.3 (transpile-only)
- **React**: 18.3.1
- **Vite**: 5.4.21
- **Express**: 4.18.2
- **Tailwind CSS**: 3.4.0

---

## Support & Resources

- [Google Generative AI REST API](https://ai.google.dev/tutorials/rest_quickstart)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Express.js Guide](https://expressjs.com/)
- [Vite Documentation](https://vitejs.dev/)
