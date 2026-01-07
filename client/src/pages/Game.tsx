import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";

type PublicQuestion = {
  id: string;
  category: string;
  prompt: string;
  choices: string[];
};

type AnswerRecord = {
  questionId: string;
  category: string;
  prompt: string;
  choices: string[];
  selectedIndex: number;
  correct: boolean;
  explanation?: string;
};

export default function Game() {
  const { id } = useParams();
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; correct: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`/api/game/${id}`).then((r) => {
      setQuestions(r.data.questions);
      setLoading(false);
    });
  }, [id]);

  async function answer(choiceIndex: number) {
    const q = questions[index];
    try {
      const res = await axios.post(`/api/game/${id}/answer`, {
        questionId: q.id,
        choiceIndex,
      });
      const newAnswer: AnswerRecord = {
        questionId: q.id,
        category: q.category,
        prompt: q.prompt,
        choices: q.choices,
        selectedIndex: choiceIndex,
        correct: res.data.correct,
        explanation: res.data.explanation,
      };

      const updatedAnswers = [...answers, newAnswer];
      setAnswers(updatedAnswers);

      setFeedback({
        message: res.data.correct
          ? "Correct!"
          : `Incorrect. ${res.data.explanation || ""}`,
        correct: res.data.correct,
      });

      setTimeout(() => {
        setFeedback(null);
        if (index + 1 < questions.length) {
          setIndex(index + 1);
        } else {
          // Navigate to results with full answer context
          navigate("/results", {
            state: {
              answers: updatedAnswers,
              total: questions.length,
            },
          });
        }
      }, 3200);
    } catch (e: any) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  if (loading) return <div>Loading questions...</div>;
  if (!questions.length) return <div>No questions found</div>;

  if (index >= questions.length) {
    const score = answers.filter((a) => a.correct).length;
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold">Finished!</h2>
        <p className="mt-4">
          Score: <strong>{score}</strong> / {questions.length}
        </p>
        <div className="mt-6 flex gap-4 justify-center">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded bg-gray-200"
          >
            Home
          </button>
        </div>
      </div>
    );
  }

  const q = questions[index];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="p-6 bg-white rounded-xl shadow">
        <div className="text-sm text-gray-500">{q.category}</div>
        <h3 className="text-xl font-semibold mt-2">{q.prompt}</h3>

        <div className="mt-4 grid gap-3">
          {q.choices.map((c, ci) => (
            <button
              key={ci}
              onClick={() => answer(ci)}
              className="text-left p-3 bg-indigo-50 rounded hover:bg-indigo-100"
            >
              {String.fromCharCode(65 + ci)}. {c}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            className={`mt-4 text-sm font-semibold flex items-start gap-2 ${
              feedback.correct ? "text-green-700" : "text-red-700"
            }`}
          >
            <span aria-hidden>{feedback.correct ? "✔" : "✕"}</span>
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500">
          Question {index + 1} / {questions.length}
        </div>
      </div>
    </div>
  );
}
