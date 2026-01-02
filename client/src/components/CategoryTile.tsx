import React from "react";

export default function CategoryTile({
  title,
  selected,
  onClick,
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-6 rounded-xl shadow-md transition transform hover:-translate-y-1 border ${
        selected ? "bg-indigo-600 text-white border-indigo-700" : "bg-white"
      } w-full text-left`}
    >
      <div className="text-lg font-semibold">{title}</div>
    </button>
  );
}
