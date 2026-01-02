import React from "react";

export default function QuestionCard({
  q,
  onAnswer,
}: {
  q: { id: string; prompt: string; choices: string[] };
  onAnswer: (i: number) => void;
}) {
  return (
    <div className="p-6 bg-white rounded-xl shadow">
      <h3 className="text-lg font-semibold">{q.prompt}</h3>
      <div className="mt-4 grid gap-3">
        {q.choices.map((c, ci) => (
          <button
            key={ci}
            onClick={() => onAnswer(ci)}
            className="text-left p-3 bg-indigo-50 rounded hover:bg-indigo-100"
          >
            {String.fromCharCode(65 + ci)}. {c}
          </button>
        ))}
      </div>
    </div>
  );
}
