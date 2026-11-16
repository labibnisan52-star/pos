"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, SendHorizontal, X } from "lucide-react";

interface InputBarProps {
  categories: string[];
  onAddCategory: (name: string) => void;
  onSend: (text: string, file: File | null, category: string) => "ok" | "invalid";
  /** Returns an error message when the image is not acceptable. */
  onPickImage: (file: File) => string | null;
}

export default function InputBar({
  categories,
  onAddCategory,
  onSend,
  onPickImage,
}: InputBarProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Uncategorized");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (onPickImage(picked)) return;
    setFile(picked);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__new__") {
      setNewCategoryName("");
      setAddingCategory(true);
      return;
    }
    setCategory(val);
  };

  const saveNewCategory = () => {
    const clean = newCategoryName.trim();
    if (clean) {
      onAddCategory(clean);
      setCategory(clean);
    }
    setAddingCategory(false);
    setNewCategoryName("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const result = onSend(value, file, category);
    setText("");
    if (result === "ok") setFile(null);
  };

  return (
    <div className="border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-3">
        {preview && (
          <div className="relative mb-2 h-16 w-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected product"
              className="h-16 w-16 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove image"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {addingCategory && (
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveNewCategory();
                }
              }}
              placeholder="New category name"
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-full bg-gray-100 px-3.5 text-xs text-gray-900 outline-none focus:ring-1 focus:ring-[#f15a2e]"
            />
            <button
              type="button"
              onClick={saveNewCategory}
              className="h-9 rounded-full bg-[#f15a2e] px-3.5 text-xs font-medium text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingCategory(false)}
              className="h-9 rounded-full px-2.5 text-xs font-medium text-gray-500"
            >
              Cancel
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add image"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <select
            value={category}
            onChange={handleCategoryChange}
            aria-label="Select category"
            className="h-11 max-w-[110px] sm:max-w-[140px] shrink-0 rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-700 outline-none focus:ring-1 focus:ring-[#f15a2e]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__new__">+ New</option>
          </select>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name, cost, sell, stock"
            aria-label="Product details"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full bg-gray-100 px-3.5 sm:px-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1 focus:ring-[#f15a2e]"
          />

          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f15a2e] text-white disabled:opacity-40"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
