import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

type AnswerRecord = {
  questionId: string;
  category: string;
  prompt: string;
  choices: string[];
  selectedIndex: number;
  correct: boolean;
  explanation?: string;
};

export default function Results() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { answers?: AnswerRecord[]; total?: number };

  const answers = state?.answers || [];
  const total = state?.total || answers.length;

  if (!answers.length) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold">Results</h2>
        <p className="mt-4">No results to show. Start a new game.</p>
        <button
          className="mt-6 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => navigate("/")}
        >
          Home
        </button>
      </div>
    );
  }

  const score = answers.filter((a) => a.correct).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Results</h2>
          <p className="text-gray-600">
            Score: <strong>{score}</strong> / {total}
          </p>
        </div>
        <button
          className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => navigate("/")}
        >
          Play Again
        </button>
      </div>

      <div className="space-y-4">
        {answers.map((a, idx) => {
          const choiceText = a.choices[a.selectedIndex];
          return (
            <div key={a.questionId} className="p-4 rounded-lg bg-white shadow">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 text-lg font-bold ${
                    a.correct ? "text-green-700" : "text-red-700"
                  }`}
                  aria-label={a.correct ? "Correct" : "Incorrect"}
                >
                  {a.correct ? "✔" : "✕"}
                </div>
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {a.category}
                  </div>
                  <div className="font-semibold text-gray-900">{a.prompt}</div>
                  <div className="mt-2 text-sm text-gray-700">
                    Your answer: <strong>{choiceText ?? "(missing)"}</strong>
                  </div>
                  {a.explanation && (
                    <div className="mt-1 text-sm text-gray-600">{a.explanation}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
