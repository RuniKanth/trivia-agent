import express from "express";
import { v4 as uuidv4 } from "uuid";
import { generateQuestionsForCategories } from "../agent/agent";
import { addFingerprint } from "../store/dedupStore";
import { Category, Game, StoredQuestion } from "../types";

const router = express.Router();

const categories: Category[] = [
  "Current News and Events",
  "History",
  "Geography",
  "Entertainment",
  "Sports",
  "Science",
  "Business",
  "Pop Culture",
];

// In-memory games store
const games = new Map<string, Game>();

router.get("/categories", (req, res) => {
  res.json({ categories });
});

router.post("/game", async (req, res) => {
  try {
    const { selectedCategories, userId } = req.body;
    if (
      !selectedCategories ||
      !Array.isArray(selectedCategories) ||
      selectedCategories.length === 0 ||
      selectedCategories.length > 5
    ) {
      return res
        .status(400)
        .json({
          error: "selectedCategories must be an array of 1-5 categories",
        });
    }
    const gameId = uuidv4();
    const used = new Set<string>();
    // Exclude already used fingerprints if userId provided (optional)
    // For the MVP we don't pre-populate used from user store, but agent will receive the set

    // Generate all questions in a single batched call for speed
    const allQuestions: StoredQuestion[] = await generateQuestionsForCategories(
      selectedCategories as Category[],
      2,
      used
    );
    for (const q of allQuestions) {
      addFingerprint(userId || gameId, q.fingerprint);
    }

    const game: Game = {
      id: gameId,
      selectedCategories,
      questions: allQuestions,
      usedFingerprints: Array.from(used),
      createdAt: new Date().toISOString(),
    };
    games.set(gameId, game);

    // When returning to client, strip correctIndex and explanation to avoid revealing answers
    const publicQuestions = game.questions.map((q) => ({
      id: q.id,
      category: q.category,
      prompt: q.prompt,
      choices: q.choices,
    }));

    res.json({ gameId, questions: publicQuestions });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/game/:id", (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  const publicQuestions = game.questions.map((q) => ({
    id: q.id,
    category: q.category,
    prompt: q.prompt,
    choices: q.choices,
  }));
  res.json({ gameId: game.id, questions: publicQuestions });
});

router.post("/game/:id/answer", (req, res) => {
  const { questionId, choiceIndex } = req.body;
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  const q = game.questions.find((x) => x.id === questionId);
  if (!q) return res.status(404).json({ error: "question not found" });
  const correct = q.correctIndex === choiceIndex;
  res.json({ correct, explanation: q.explanation });
});

export default router;
