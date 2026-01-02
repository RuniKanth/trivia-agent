import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Game from "./pages/Game";
import Results from "./pages/Results";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="py-6 shadow-sm bg-white/60 backdrop-blur">
        <div className="container flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-700">Trivia Agents</h1>
          <nav>
            <Link to="/" className="text-indigo-600 hover:underline">
              Home
            </Link>
          </nav>
        </div>
      </header>
      <main className="container py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </main>
    </div>
  );
}
