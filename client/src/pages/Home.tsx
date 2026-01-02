import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import CategoryTile from "../components/CategoryTile";

export default function Home() {
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get("/api/categories").then((r) => setCategories(r.data.categories));
  }, []);

  function toggle(cat: string) {
    if (selected.includes(cat)) setSelected(selected.filter((s) => s !== cat));
    else if (selected.length < 5) setSelected([...selected, cat]);
  }

  async function start() {
    if (selected.length !== 5) return alert("Select exactly 5 categories");
    setLoading(true);
    try {
      const res = await axios.post("/api/game", {
        selectedCategories: selected,
        userId: "guest",
      });
      navigate(`/game/${res.data.gameId}`);
    } catch (e: any) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <section className="mb-8">
        <h2 className="text-3xl font-bold text-indigo-700 mb-2">
          Choose 5 categories
        </h2>
        <p className="text-muted">
          Pick from the tiles below — two questions will be generated per
          category.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {categories.map((cat) => (
          <CategoryTile
            key={cat}
            title={cat}
            selected={selected.includes(cat)}
            onClick={() => toggle(cat)}
          />
        ))}
      </section>

      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-600">
          Selected: <strong>{selected.length}</strong>/5
        </div>
        <button
          disabled={loading}
          onClick={start}
          className="ml-auto px-6 py-3 rounded-lg bg-indigo-600 text-white shadow hover:bg-indigo-700"
        >
          {loading ? "Generating..." : "Start Game"}
        </button>
      </div>
    </div>
  );
}
