"use client";

import { useRef, useState } from "react";
import { ImagePlus, SendHorizontal } from "lucide-react";

interface InputBarProps {
  onPickImages: (files: FileList) => void;
  onSend: (text: string) => "ok" | "invalid";
}

export default function InputBar({ onPickImages, onSend }: InputBarProps) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onPickImages(files);
    }
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add images"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name, cost price, selling price, stock"
            aria-label="Product details"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1 focus:ring-[#f15a2e]"
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
