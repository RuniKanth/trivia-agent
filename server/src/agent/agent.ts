import fetch from "node-fetch";
import { Category, StoredQuestion } from "../types";
import { fingerprintOf } from "../store/dedupStore";
import { v4 as uuidv4 } from "uuid";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = process.env.GEMINI_API_URL;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;

// NOTE: This is a *minimal* agent coordinator with a simple HTTP-based call outline.
// Replace with official SDK usage (e.g. Google Cloud client for Gemini) for production.

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_KEY || !GEMINI_URL) throw new Error("GEMINI not configured");
  // Simple PSEUDOCALL - replace with official client for production
  const res = await fetch(`${GEMINI_URL}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GEMINI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const json = await res.json();
  return json.text || json.output || "";
}

async function callGeminiWithModel(prompt: string): Promise<string> {
  if (!GEMINI_KEY || !GEMINI_URL) throw new Error("GEMINI not configured");
  // Use Google Generative AI REST API (generativelanguage.googleapis.com)
  const endpoint = `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "<no body>");
    throw new Error(`Gemini error: ${res.status} ${errBody}`);
  }
  const json = await res.json();
  // Extract text from Google's response structure
  const text =
    json.candidates?.[0]?.content?.parts?.[0]?.text || json.text || "";
  return text;
}

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY not set");
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "";
    }

    // If rate limited, retry with exponential backoff
    if (res.status === 429 && attempt < maxAttempts) {
      const delay = 500 * 2 ** (attempt - 1);
      console.warn(
        `OpenAI rate-limited, retrying in ${delay}ms (attempt ${attempt})`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const body = await res.text().catch(() => "<no body>");
    throw new Error(`OpenAI error: ${res.status} ${body}`);
  }
  throw new Error("OpenAI failed after retries");
}

// Fetch headlines to ground 'Current News and Events' questions
async function getTopHeadlines() {
  if (!NEWS_KEY) return null;
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=5&apiKey=${NEWS_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.articles || [])
      .map((a: any) => `${a.title} (${a.source?.name || "source"})`)
      .slice(0, 5);
  } catch (err) {
    return null;
  }
}

// Extract questions from malformed JSON using regex patterns
function extractQuestionsFromText(raw: string): {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
}[] {
  const questions: any[] = [];

  // Match question patterns: "question":"<text>"
  const questionRegex = /"question"\s*:\s*"([^"]+)"/g;
  // Match choices array: "choices":\s*\[<array>\]
  const choicesRegex = /"choices"\s*:\s*\[([^\]]+)\]/g;
  // Match answerIndex: "answerIndex":<number>
  const answerRegex = /"answerIndex"\s*:\s*(\d+)/g;
  // Match explanation: "explanation":"<text>"
  const explanationRegex = /"explanation"\s*:\s*"([^"]+)"/g;

  const questionMatches = [...raw.matchAll(questionRegex)];
  const choiceMatches = [...raw.matchAll(choicesRegex)];
  const answerMatches = [...raw.matchAll(answerRegex)];
  const explanationMatches = [...raw.matchAll(explanationRegex)];

  const count = Math.min(
    questionMatches.length,
    choiceMatches.length,
    answerMatches.length
  );

  for (let i = 0; i < count; i++) {
    const question = questionMatches[i]?.[1] || "";
    const choicesStr = choiceMatches[i]?.[1] || "";
    const answerIndex = parseInt(answerMatches[i]?.[1] || "0");
    const explanation = explanationMatches[i]?.[1] || "";

    // Parse choices array: remove quotes and brackets
    const choices = choicesStr
      .split(",")
      .map((c) => c.trim().replace(/^["']|["']$/g, ""))
      .filter((c) => c.length > 0);

    if (question && choices.length >= 4) {
      questions.push({
        question,
        choices: choices.slice(0, 4),
        answerIndex: Math.min(answerIndex, 3),
        explanation,
      });
    }
  }

  return questions;
}

function parseLLMOutput(raw: string): {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
}[] {
  // Expect a numbered list; attempt to robustly parse simple structured output.
  // If the LLM returns JSON, support that too.
  raw = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((q: any) => ({
        question: q.question,
        choices: q.choices,
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      }));
    }
  } catch (e) {
    // not JSON, continue
  }

  // Fallback: naive parsing by lines
  const entries: any[] = [];
  const blocks = raw.split(/\n\n+/).slice(0, 5);
  for (const b of blocks) {
    const lines = b
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 5) continue;
    const q = lines[0].replace(/^[0-9]+[.)]\s*/, "");
    const choices = lines.slice(1, 5).map((l) => l.replace(/^[A-D]\)?\s*/, ""));
    let answerIndex = 0;
    // try to find which choice line includes "Answer:" or similar
    for (const l of lines) {
      const m = l.match(/Answer[:\s]*([A-D1-4])/i);
      if (m) {
        const a = m[1];
        if (/[A-D]/i.test(a)) answerIndex = "ABCD".indexOf(a.toUpperCase());
        else answerIndex = parseInt(a, 10) - 1;
        break;
      }
    }
    entries.push({ question: q, choices, answerIndex });
  }
  return entries;
}

export async function generateQuestionsForCategory(
  category: Category,
  count = 2,
  excludedFingerprints: Set<string> = new Set()
): Promise<StoredQuestion[]> {
  const results: StoredQuestion[] = [];
  let attempts = 0;
  const headlines =
    category === "Current News and Events" ? await getTopHeadlines() : null;

  while (results.length < count && attempts < 6) {
    console.log(
      `Generating questions for ${category} (need ${
        count - results.length
      }, attempt ${attempts + 1})`
    );
    attempts++;
    const prompt =
      `Create ${
        count - results.length
      } multiple-choice questions for the category "${category}". Provide exactly 4 choices per question, mark the correct answer, and include a short explanation. Return the output as JSON array with fields: question, choices (array), answerIndex (0-3), explanation.` +
      (headlines
        ? ` Use these headlines as grounding: ${headlines.join(" | ")}`
        : "");

    let raw = "";
    try {
      // Primary: OpenAI with retries
      raw = await callOpenAI(prompt);
    } catch (oErr) {
      try {
        // Fallback: Gemini if configured
        raw = await callGemini(prompt);
      } catch (gErr) {
        throw new Error(
          `Both Gemini and OpenAI failed: ${gErr.message}; ${oErr.message}`
        );
      }
    }

    // For backwards compatibility, try to parse as JSON array of questions
    let parsed = parseLLMOutput(raw);

    for (const p of parsed) {
      if (!p || !p.question || !p.choices || p.choices.length < 4) continue;
      const fp = fingerprintOf(p.question, p.choices[p.answerIndex]);
      if (excludedFingerprints.has(fp)) continue;
      const q: StoredQuestion = {
        id: uuidv4(),
        category,
        prompt: p.question,
        choices: p.choices.slice(0, 4),
        correctIndex: p.answerIndex,
        explanation: p.explanation || "",
        fingerprint: fp,
        source: GEMINI_KEY ? "gemini" : "openai",
      };
      results.push(q);
      excludedFingerprints.add(fp);
      if (results.length >= count) break;
    }
  }

  return results;
}

// New: batched generator that requests questions for multiple categories in a single call
export async function generateQuestionsForCategories(
  categories: Category[],
  perCategory = 2,
  excludedFingerprints: Set<string> = new Set()
): Promise<StoredQuestion[]> {
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const prompt = `You are a trivia expert. Generate exactly ${perCategory} questions per category.
Categories: ${categories.join(", ")}.

For "Current News and Events": use facts from ${tenDaysAgo} to ${todayIso} only.
For others: use any verifiable facts.

Output ONLY raw JSON (no markdown, no backticks, no extra text):
[{"category":"CategoryName","questions":[{"question":"Q?","choices":["A","B","C","D"],"answerIndex":0,"explanation":"Why"}]}]`;

  console.log("Generating batched prompt for categories:", categories);

  let raw = "";
  if (GEMINI_KEY && GEMINI_URL) {
    try {
      raw = await callGeminiWithModel(prompt);
      console.log("Gemini generation succeeded");
    } catch (gErr) {
      console.warn("Gemini generation failed:", gErr.message);
      raw = await callOpenAI(prompt);
      console.log("OpenAI generation succeeded after Gemini failure");
    }
  } else {
    raw = await callOpenAI(prompt);
    console.log("OpenAI generation succeeded");
  }

  // Parse JSON strictly first (strip markdown code blocks if present)
  let cleaned = raw.trim();
  // Remove markdown code blocks (```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  // CRITICAL: Replace all literal newlines and tabs with spaces to prevent JSON parse errors
  // OpenAI sometimes outputs JSON with line breaks embedded in string values
  cleaned = cleaned.replace(/[\r\n\t]+/g, " ");

  console.log(
    "Cleaned raw response (first 200 chars):",
    cleaned.substring(0, 200)
  );

  let structured: any[] = [];

  // Try JSON parsing
  try {
    structured = JSON.parse(cleaned);
    console.log("JSON parse succeeded");
  } catch (e) {
    console.error("JSON parse error:", e.message);
    console.warn(
      "Skipping repair, falling back to regex extraction from raw output"
    );
  }

  // If JSON parsing completely failed, use regex extraction
  if (structured.length === 0) {
    console.warn("Using regex extraction to find questions in LLM output");
    const loose = extractQuestionsFromText(raw);
    const results: StoredQuestion[] = [];
    let idx = 0;
    for (const p of loose) {
      if (!p || !p.question || !p.choices || p.choices.length < 4) continue;
      const cat = categories[idx % categories.length];
      const fp = fingerprintOf(p.question, p.choices[p.answerIndex]);
      if (excludedFingerprints.has(fp)) continue;
      results.push({
        id: uuidv4(),
        category: cat,
        prompt: p.question,
        choices: p.choices.slice(0, 4),
        correctIndex: p.answerIndex,
        explanation: p.explanation || "",
        fingerprint: fp,
        source: GEMINI_KEY ? "gemini" : "openai",
      });
      excludedFingerprints.add(fp);
      idx++;
      if (results.length >= categories.length * perCategory) break;
    }
    return results;
  }

  // Process structured JSON
  const results: StoredQuestion[] = [];
  for (const section of structured) {
    const cat: Category = section.category as Category;
    const qs = section.questions || [];
    for (const p of qs.slice(0, perCategory)) {
      if (!p || !p.question || !p.choices || p.choices.length < 4) continue;
      const fp = fingerprintOf(p.question, p.choices[p.answerIndex]);
      if (excludedFingerprints.has(fp)) continue;
      results.push({
        id: uuidv4(),
        category: cat,
        prompt: p.question,
        choices: p.choices.slice(0, 4),
        correctIndex: p.answerIndex,
        explanation: p.explanation || "",
        fingerprint: fp,
        source: GEMINI_KEY ? "gemini" : "openai",
      });
      excludedFingerprints.add(fp);
      if (results.length >= categories.length * perCategory) break;
    }
    if (results.length >= categories.length * perCategory) break;
  }

  return results;
}
