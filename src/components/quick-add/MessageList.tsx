"use client";

import { useEffect, useRef } from "react";
import type { RawProductFields } from "@/lib/quick-add/parse";
import ProductCard from "./ProductCard";
import type { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  onRetry: (id: string) => void;
  onUndo: (id: string) => void;
  onEdit: (id: string, raw: RawProductFields) => Promise<string | null>;
}

export default function MessageList({
  messages,
  onRetry,
  onUndo,
  onEdit,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4">
        {messages.map((m) =>
          m.kind === "bot" ? (
            <div key={m.id} className="flex justify-start quick-add-in">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900">
                {m.text}
              </p>
            </div>
          ) : (
            <ProductCard
              key={m.id}
              message={m}
              onRetry={onRetry}
              onUndo={onUndo}
              onEdit={onEdit}
            />
          )
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

