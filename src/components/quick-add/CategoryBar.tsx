"use client";

import { useState } from "react";

interface CategoryBarProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onAddCategory: (category: string) => void;
}

export default function CategoryBar({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
}: CategoryBarProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__new__") {
      setDraft("");
      setAdding(true);
      return;
    }
    onSelectCategory(val);
  };

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (clean) {
      onAddCategory(clean);
      onSelectCategory(clean);
    }
    setAdding(false);
    setDraft("");
  };

  return (
    <div className="shrink-0 border-b border-gray-100 bg-white">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
        {adding ? (
          <form onSubmit={handleSaveNew} className="flex w-full items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="New category name"
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-[#f15a2e]"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="h-10 rounded-full bg-[#f15a2e] px-4 text-xs font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-10 rounded-full px-3 text-xs font-medium text-gray-500"
            >
              Cancel
            </button>
          </form>
        ) : (
          <select
            value={selectedCategory}
            onChange={handleChange}
            aria-label="Category"
            className="h-10 w-full rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-900 outline-none focus:ring-1 focus:ring-[#f15a2e]"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__new__">+ New category</option>
          </select>
        )}
      </div>
    </div>
  );
}

