"use client";

import { useEffect, useRef } from "react";
import type { RawProductFields } from "@/lib/quick-add/parse";
import ProductCard from "./ProductCard";
import type { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  categories: string[];
  onRetry: (id: string) => void;
  onUndo: (id: string) => void;
  onEdit: (
    id: string,
    raw: RawProductFields,
    category: string
  ) => Promise<string | null>;
}

export default function MessageList({
  messages,
  categories,
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
        {messages.map((m) => {
          if (m.kind === "bot") {
            return (
              <div key={m.id} className="flex justify-start quick-add-in">
                <div className="max-w-[85%] rounded-2xl bg-gray-100 p-3 text-sm text-gray-900">
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt=""
                      className="mb-2 h-28 w-28 rounded-xl object-cover"
                    />
                  )}
                  <p className="whitespace-pre-line">{m.text}</p>
                </div>
              </div>
            );
          }

          if (m.kind === "images") {
            return (
              <div key={m.id} className="flex justify-end quick-add-in">
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 rounded-2xl bg-gray-100 p-2">
                  {m.urls.map((url, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${m.id}-${idx}`}
                      src={url}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                  ))}
                </div>
              </div>
            );
          }

          return (
            <ProductCard
              key={m.id}
              message={m}
              categories={categories}
              onRetry={onRetry}
              onUndo={onUndo}
              onEdit={onEdit}
            />
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
