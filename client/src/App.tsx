import React, { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Game from "./pages/Game";
import Results from "./pages/Results";

export default function App() {
  const [isVisible, setIsVisible] = useState(false);

  React.useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap');
        
        .header-text-container {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          gap: 0;
          width: auto;
          margin-left: 1rem;
        }

        .text-line {
          font-family: 'Dancing Script', cursive;
          font-size: 1.25rem;
          font-weight: 700;
          color: #9333ea;
          text-align: center;
          overflow: hidden;
          white-space: nowrap;
          display: inline-block;
        }

        .text-line.animate {
          animation: cursiveWrite 3.5s ease-out forwards;
        }

        @keyframes cursiveWrite {
          0% {
            opacity: 0;
            clip-path: inset(0 100% 0 0);
          }
          5% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0% 0 0);
          }
        }
      `}</style>
      <header className="py-2 shadow-sm bg-white/60 backdrop-blur">
        <div className="container flex flex-col items-center">
          <div className="flex flex-row items-center justify-center w-full">
            <div className="flex justify-center">
              <Link to="/" className="flex justify-center">
                <img
                  src="/QuizMe_LOGO.png"
                  alt="QuizMe Logo"
                  className="w-24 sm:w-32 md:w-40 h-auto"
                />
              </Link>
            </div>
            <div className="header-text-container">
              <div className={`text-line ${isVisible ? "animate" : ""}`}>Trivia that tickles!</div>
            </div>
            <nav className="ml-8">
              <Link to="/" className="text-indigo-600 hover:underline text-sm sm:text-base whitespace-nowrap">
                Home
              </Link>
            </nav>
          </div>
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
