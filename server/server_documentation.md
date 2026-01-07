# Server Documentation

## Overview

The server is an Express.js backend that generates AI-powered trivia questions using LLMs (Gemini and OpenAI), stores game state in memory, and provides REST API endpoints for the client to create games, fetch questions, and submit answers.

---

## File Structure & Purpose

### 1. `server/src/index.ts` - Application Entry Point

**Purpose:** Initialize and configure the Express application, load environment variables, and start the HTTP server.

**What it does:**

- Loads environment variables from `.env` file using `dotenv`
- Validates that `GEMINI_API_KEY` and `OPENAI_API_KEY` are loaded and logs their availability
- Creates an Express app with the following middleware:
  - **CORS middleware** (`cors()`) – Allows cross-origin requests from the client
  - **Body parser** (`bodyParser.json()`) – Parses incoming JSON request bodies
  - **Custom error handler** – Catches JSON parse errors and returns a 400 status with error details
- Mounts the game routes at `/api` prefix (all routes start with `/api/...`)
- Listens on a port (default: 4000) and logs confirmation message

**Key environment variables used:**

- `GEMINI_API_KEY` – Google Generative AI API key
- `OPENAI_API_KEY` – OpenAI API key for gpt-4o-mini
- `PORT` – Server port (default: 4000)

---

### 2. `server/src/types.ts` - TypeScript Type Definitions

**Purpose:** Define all TypeScript interfaces used throughout the server for type safety.

**Types defined:**

#### `Category` (Union Type)

A literal type representing the 8 available trivia categories:

- `"Current News and Events"`
- `"History"`
- `"Geography"`
- `"Entertainment"`
- `"Sports"`
- `"Science"`
- `"Business"`
- `"Pop Culture"`

#### `Question` (Interface)

Represents a public question object (without answers).

```typescript
{
  id: string;              // UUID of the question
  category: Category;      // Which category it belongs to
  prompt: string;          // The question text
  choices: string[];       // Array of 4 answer choices
}
```

#### `StoredQuestion` (Interface)

Extends `Question` with additional server-side data.

```typescript
{
  // All fields from Question, plus:
  correctIndex: number;    // Index (0-3) of the correct answer
  explanation?: string;    // Optional explanation for the answer
  fingerprint: string;     // SHA256 hash of (question + correctAnswer) for deduplication
  source?: string;         // Which LLM generated it ("gemini" or "openai")
}
```

#### `Game` (Interface)

Represents a game session.

```typescript
{
  id: string;                    // Unique game ID (UUID)
  selectedCategories: Category[]; // Categories chosen by the player
  questions: StoredQuestion[];   // Full list of questions with answers
  usedFingerprints: string[];    // Fingerprints of questions in this game
  createdAt: string;             // ISO timestamp when the game was created
}
```

---

### 3. `server/src/agent/agent.ts` - LLM Integration & Question Generation

**Purpose:** Handle communication with LLMs (Gemini and OpenAI), construct prompts, parse responses, and generate trivia questions.

**Key Functions:**

#### `callGeminiWithModel(prompt: string): Promise<string>`

Calls the **Google Generative AI REST API** using the Gemini model.

**How it works:**

1. Constructs the API endpoint: `{GEMINI_URL}/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}`
   - Example: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=YOUR_KEY`
2. Sends a POST request with the prompt in Google's required format:
   ```json
   {
     "contents": [
       {
         "parts": [{ "text": "Your prompt here" }]
       }
     ]
   }
   ```
3. Receives a response and extracts text from the deeply nested structure:
   - `response.candidates[0].content.parts[0].text`
4. Returns the extracted text or throws an error if the response is not ok

**Error handling:**

- If the request fails, it includes the HTTP status code and response body in the error message
- Example error: `Gemini error: 403 {"error": {"message": "Your API key was reported as leaked..."}}`

---

#### `callOpenAI(prompt: string): Promise<string>`

Calls the **OpenAI API** using the gpt-4o-mini model.

**How it works:**

1. Sends a POST request to `https://api.openai.com/v1/chat/completions`
2. Request format:
   ```json
   {
     "model": "gpt-4o-mini",
     "messages": [{ "role": "user", "content": "Your prompt here" }],
     "max_tokens": 600
   }
   ```
3. Extracts the response: `response.choices[0].message.content`
4. Returns the text

**Rate-limit handling (retry logic):**

- **Up to 3 attempts** with exponential backoff
- If HTTP 429 (rate limited) is returned on attempt 1 or 2, it waits and retries:
  - Attempt 1 fails → wait 500ms, retry
  - Attempt 2 fails → wait 1000ms, retry
  - Attempt 3 fails → throw error
- If any other error occurs, it throws immediately

**Error handling:**

- Includes HTTP status code and response body in error messages
- Example error: `OpenAI error: 401 {"error": {"message": "Incorrect API key provided..."}}`

---

#### `getTopHeadlines(): Promise<string[] | null>`

Fetches recent news headlines to ground "Current News and Events" questions.

**How it works:**

1. Calls the NewsAPI endpoint: `https://newsapi.org/v2/top-headlines?language=en&pageSize=5&apiKey={NEWS_KEY}`
2. Extracts the top 5 articles and formats them as: `"Title (Source Name)"`
3. Returns the formatted headline list or null if the request fails

**Used by:** `generateQuestionsForCategories()` to provide context for recent news questions

---

#### `extractQuestionsFromText(raw: string): Question[]`

A fallback parser that extracts question data using regex patterns when JSON parsing fails.

**Regex patterns used:**

- `/"question"\s*:\s*"([^"]+)"/g` – Extracts question text
- `/"choices"\s*:\s*\[([^\]]+)\]/g` – Extracts choices array
- `/"answerIndex"\s*:\s*(\d+)/g` – Extracts correct answer index
- `/"explanation"\s*:\s*"([^"]+)"/g` – Extracts explanation

**Why this exists:**

- OpenAI sometimes returns JSON with embedded newlines and improperly escaped characters
- Rather than trying to repair broken JSON (fragile), this function extracts the data directly using regex
- Ensures we can still parse questions even if the JSON structure is malformed

**Validation:**

- Ensures each question has at least 4 valid choices before including it
- Returns an array of parsed questions

---

#### `generateQuestionsForCategories(categories: Category[], perCategory: number, excludedFingerprints: Set<string>): Promise<StoredQuestion[]>`

The **primary question generation function** that generates questions for multiple categories in a single LLM call.

**Purpose:** Batch-generate questions for efficiency (one API call instead of multiple).

**How the prompt is constructed:**

1. **Calculate date range** for "Current News and Events":

   ```typescript
   const now = new Date();
   const todayIso = now.toISOString().split("T")[0]; // e.g., "2026-01-04"
   const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
     .toISOString()
     .split("T")[0]; // e.g., "2025-12-25"
   ```

2. **Build the prompt:**

   ```
   You are a trivia expert. Generate exactly {perCategory} questions per category.
   Categories: History, Geography, Entertainment, ...

   For "Current News and Events": use facts from 2025-12-25 to 2026-01-04 only.
   For others: use any verifiable facts.

   Output ONLY raw JSON (no markdown, no backticks, no extra text):
   [{"category":"CategoryName","questions":[{"question":"Q?","choices":["A","B","C","D"],"answerIndex":0,"explanation":"Why"}]}]
   ```

3. **Send the prompt to the LLM:**
   - **Primary:** Gemini (if configured)
   - **Fallback:** OpenAI (if Gemini fails or is not configured)

**How the response is parsed:**

1. **Cleanup raw response:**

   - Remove markdown code blocks: ` ```json ... ``` `
   - Replace all literal newlines/tabs with spaces (critical for OpenAI's output)

2. **Attempt strict JSON parsing:**

   ```typescript
   const structured = JSON.parse(cleaned);
   ```

3. **If JSON parsing succeeds:**

   - Iterate through each category section in the response
   - For each question, create a `StoredQuestion` object with:
     - Unique UUID
     - Category assignment
     - Fingerprint (SHA256 of question + correct answer)
     - Deduplication check: skip if fingerprint is already in `excludedFingerprints`
   - Add fingerprint to the set to prevent duplicates

4. **If JSON parsing fails:**
   - Fall back to regex extraction using `extractQuestionsFromText()`
   - Map extracted questions to categories using round-robin assignment
   - Same deduplication logic applies

**Return value:**

- Array of `StoredQuestion` objects ready to be stored in the game

**Example response format (what the LLM should return):**

```json
[
  {
    "category": "History",
    "questions": [
      {
        "question": "In what year did the Roman Empire fall?",
        "choices": ["410 AD", "476 AD", "800 AD", "1453 AD"],
        "answerIndex": 1,
        "explanation": "The Western Roman Empire fell in 476 AD when Romulus Augustulus was deposed."
      },
      { ... }
    ]
  },
  {
    "category": "Geography",
    "questions": [ ... ]
  }
]
```

---

### 4. `server/src/routes/game.ts` - REST API Endpoints

**Purpose:** Define all HTTP endpoints that the client uses to interact with the game.

**Endpoints:**

#### 1. `GET /api/categories`

**Purpose:** Fetch all available trivia categories.

**Request:**

- No body or parameters

**Response (200 OK):**

```json
{
  "categories": [
    "Current News and Events",
    "History",
    "Geography",
    "Entertainment",
    "Sports",
    "Science",
    "Business",
    "Pop Culture"
  ]
}
```

**How it's invoked (from client):**

```typescript
const response = await axios.get("/api/categories");
const categories = response.data.categories;
```

**Usage in client:** Populates the category selection UI on the home page.

---

#### 2. `POST /api/game`

**Purpose:** Create a new game with selected categories and generate questions.

**Request body:**

```json
{
  "selectedCategories": ["History", "Geography", "Science"],
  "userId": "optional-user-id"
}
```

**Validation:**

- `selectedCategories` must be an array
- Must contain 1–5 categories
- All categories must be valid

**Response (200 OK):**

```json
{
  "gameId": "550e8400-e29b-41d4-a716-446655440000",
  "questions": [
    {
      "id": "uuid-of-question-1",
      "category": "History",
      "prompt": "In what year did the Roman Empire fall?",
      "choices": ["410 AD", "476 AD", "800 AD", "1453 AD"]
    },
    {
      "id": "uuid-of-question-2",
      "category": "Geography",
      "prompt": "Which is the longest river in Africa?",
      "choices": ["Nile", "Congo", "Zambezi", "Niger"]
    },
    ...
  ]
}
```

**Important:** The response does **NOT** include `correctIndex` or `explanation` – these are hidden from the client to prevent cheating.

**Response (400 Bad Request):**

```json
{
  "error": "selectedCategories must be an array of 1-5 categories"
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Both Gemini and OpenAI failed: ..."
}
```

**How it's invoked (from client):**

```typescript
const response = await axios.post("/api/game", {
  selectedCategories: ["History", "Geography", "Science"],
});
const { gameId, questions } = response.data;
// Navigate to /game/:gameId and display questions
```

**Server logic:**

1. Validate the request body
2. Call `generateQuestionsForCategories()` to get questions
3. Create a `Game` object and store it in memory (`games` Map)
4. Add fingerprints to the deduplication store
5. Return the gameId and public questions (without answers)

---

#### 3. `GET /api/game/:id`

**Purpose:** Retrieve a game by ID (with public questions only).

**Request:**

- URL parameter: `:id` (gameId)

**Response (200 OK):**

```json
{
  "gameId": "550e8400-e29b-41d4-a716-446655440000",
  "questions": [
    {
      "id": "uuid-of-question-1",
      "category": "History",
      "prompt": "In what year did the Roman Empire fall?",
      "choices": ["410 AD", "476 AD", "800 AD", "1453 AD"]
    },
    ...
  ]
}
```

**Response (404 Not Found):**

```json
{
  "error": "game not found"
}
```

**How it's invoked (from client):**

```typescript
const response = await axios.get(`/api/game/${gameId}`);
const { questions } = response.data;
```

**Usage in client:** Refreshing or re-fetching the game state.

---

#### 4. `POST /api/game/:id/answer`

**Purpose:** Submit an answer to a specific question and receive feedback.

**Request body:**

```json
{
  "questionId": "uuid-of-question-1",
  "choiceIndex": 1
}
```

**Response (200 OK):**

```json
{
  "correct": true,
  "explanation": "The Western Roman Empire fell in 476 AD when Romulus Augustulus was deposed."
}
```

**Response (404 Not Found):**

```json
{
  "error": "game not found"
}
```

or

```json
{
  "error": "question not found"
}
```

**How it's invoked (from client):**

```typescript
const response = await axios.post(`/api/game/${gameId}/answer`, {
  questionId: questionId,
  choiceIndex: selectedChoiceIndex, // 0, 1, 2, or 3
});

const { correct, explanation } = response.data;
// Show feedback to the user
if (correct) {
  showGreenCheckmark();
} else {
  showRedX();
  showExplanation(explanation);
}
```

**Server logic:**

1. Look up the game by gameId
2. Find the question by questionId within that game
3. Compare the submitted `choiceIndex` to the stored `correctIndex`
4. Return `correct` (boolean) and `explanation` (string)

---

### 5. `server/src/store/dedupStore.ts` - Deduplication Logic

**Purpose:** Track which questions have already been generated for a user/session to avoid asking the same question twice.

**Key Functions:**

#### `fingerprintOf(prompt: string, correctAnswer: string): string`

Generates a unique fingerprint for a question.

**How it works:**

1. Concatenates the question prompt and correct answer: `prompt + "||" + correctAnswer`
2. Hashes using SHA256 (cryptographic hash function)
3. Returns the hex-encoded hash (64 characters)

**Example:**

```typescript
const fp = fingerprintOf("In what year did the Roman Empire fall?", "476 AD");
// Returns: "a1b2c3d4e5f6..." (64-char SHA256 hash)
```

**Why fingerprints?**

- Questions can be phrased multiple ways, but if the core question and answer are the same, we want to consider them duplicates
- Hashing provides a compact, fixed-size identifier
- SHA256 is cryptographically secure (collision-resistant)

---

#### `addFingerprint(userId: string, fingerprint: string): void`

Stores a fingerprint for a user/session.

**How it works:**

1. Check if the user already has a Set in the store
2. If not, create a new Set
3. Add the fingerprint to the Set

**Implementation:**

```typescript
if (!store.has(userId)) store.set(userId, new Set());
store.get(userId)!.add(fingerprint);
```

---

#### `hasFingerprint(userId: string, fingerprint: string): boolean`

Checks if a fingerprint has already been used for a user.

**How it works:**

1. Look up the user's Set in the store
2. Return true if the fingerprint exists in the Set, false otherwise

**Usage:** In `generateQuestionsForCategories()`, we skip questions whose fingerprint is already in `excludedFingerprints`

---

#### In-memory store

```typescript
const store = new Map<string, Set<string>>();
// userId -> Set of fingerprints already used
```

**Limitation:** This is in-memory only, so it resets when the server restarts. For production, you'd want to persist this to a database.

---

## How the Complete Flow Works

### Example: Creating and Playing a Game

#### Step 1: Client Fetches Categories

```
Client: GET /api/categories
Server: Returns list of 8 categories
Client: Displays them as selectable tiles
```

#### Step 2: Player Selects Categories and Starts Game

```
Client: POST /api/game
Body: { selectedCategories: ["History", "Geography"] }

Server:
  1. Validates the categories array (must be 1-5 items)
  2. Generates a unique gameId (UUID)
  3. Calls generateQuestionsForCategories(["History", "Geography"], perCategory=2)
     a. Constructs a batched prompt:
        "You are a trivia expert. Generate exactly 2 questions per category..."
     b. Sends to Gemini API (or OpenAI if Gemini unavailable)
     c. Receives JSON response with 4 questions total
     d. Parses JSON strictly, or falls back to regex extraction
     e. Deduplicates using fingerprints
     f. Returns 4 StoredQuestion objects with answers
  4. Creates a Game object with all questions (answers included)
  5. Stores it in memory: games.set(gameId, game)
  6. Returns gameId and PUBLIC questions (no answers revealed)

Client:
  1. Stores the gameId in session/state
  2. Navigates to /game/:gameId
  3. Displays the first question with 4 choices
```

#### Step 3: Player Answers a Question

```
Client: POST /api/game/:gameId/answer
Body: { questionId: "uuid-123", choiceIndex: 1 }

Server:
  1. Looks up the game by gameId
  2. Finds the question by questionId
  3. Compares choiceIndex (1) to correctIndex (1)
  4. Returns: { correct: true, explanation: "..." }

Client:
  1. Shows a green checkmark ✔ (correct=true)
  2. Waits 3.2 seconds for user to see feedback
  3. Moves to the next question
```

#### Step 4: Game Ends

```
After the last question is answered:
Client:
  1. Receives { correct: true/false, explanation: "..." }
  2. Navigates to /results
  3. Passes along the full answer history (which questions, which choices, which were correct)

Client /results page:
  Displays:
  - Score: X / Y
  - For each question:
    - Green ✔ or Red ✕
    - The question text
    - The user's chosen answer
    - The explanation (if provided by the API)
  - "Play Again" button to return to category selection
```

---

## Error Handling & Resilience

### LLM Fallback Strategy

- **Primary:** Gemini (faster, cheaper)
- **Fallback:** OpenAI (if Gemini fails or is not configured)
- **Error message:** If both fail, the client receives a 500 error with details

### OpenAI Rate Limiting

- Automatically retries up to 3 times with exponential backoff
- Waits: 500ms, then 1s, then 2s between retries
- Helps handle burst traffic without failing

### JSON Parsing Resilience

1. **Strict JSON parsing** (handles well-formed responses)
2. **Regex extraction fallback** (handles malformed but recognizable responses)
3. **Both fail?** Error is logged and returned to client

### Deduplication

- Fingerprints prevent the same question from being asked twice in a session
- If a generated question's fingerprint matches an excluded one, it's skipped and a new one is generated
- Up to 6 attempts per category before giving up

---

## Environment Variables Required

```plaintext
GEMINI_API_KEY=your_gemini_key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=your_openai_key
NEWS_API_KEY=your_newsapi_key (optional)
PORT=4000
```

---

## Key Design Decisions

1. **Batched question generation:** One API call per game instead of multiple calls (faster, cheaper)
2. **Fingerprinting for deduplication:** Prevents asking the same question twice
3. **Regex extraction fallback:** Makes the system robust to slightly malformed LLM responses
4. **In-memory game storage:** Fast, but loses data on server restart (add persistence for production)
5. **Public vs. private questions:** Client never sees answers, preventing cheating
6. **Structured error messages:** Clear feedback when things go wrong

---

## Future Improvements

1. **Database persistence:** Store games, questions, and user history in a database
2. **User authentication:** Track users and their game history
3. **Caching:** Cache frequently asked questions to reduce LLM API calls
4. **Analytics:** Track which questions are commonly answered incorrectly
5. **Custom LLM models:** Allow swapping between different Gemini/OpenAI models
6. **Question quality scoring:** Rate questions based on player feedback and difficulty metrics
