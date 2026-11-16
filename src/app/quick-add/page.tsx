"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useQuickAdd } from "@/components/quick-add/useQuickAdd";
import CategoryBar from "@/components/quick-add/CategoryBar";
import MessageList from "@/components/quick-add/MessageList";
import InputBar from "@/components/quick-add/InputBar";

export default function QuickAddPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const {
    messages,
    categories,
    selectedCategory,
    selectCategory,
    addCategory,
    enqueueImages,
    send,
    retry,
    undo,
    edit,
  } = useQuickAdd();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) return <div className="flex-1 bg-white" />;

  return (
    <main className="flex flex-1 min-h-0 flex-col bg-white">
      <CategoryBar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={selectCategory}
        onAddCategory={addCategory}
      />
      <MessageList
        messages={messages}
        categories={categories}
        onRetry={retry}
        onUndo={undo}
        onEdit={edit}
      />
      <InputBar onPickImages={enqueueImages} onSend={send} />
    </main>
  );
}
