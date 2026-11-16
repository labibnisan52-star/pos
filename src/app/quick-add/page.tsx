"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useQuickAdd } from "@/components/quick-add/useQuickAdd";
import MessageList from "@/components/quick-add/MessageList";
import InputBar from "@/components/quick-add/InputBar";

export default function QuickAddPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const {
    messages,
    categories,
    addCategory,
    send,
    rejectImage,
    retry,
    undo,
    edit,
  } = useQuickAdd();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) return <div className="h-dvh bg-white" />;

  return (
    <main className="flex h-dvh flex-col bg-white">
      <MessageList
        messages={messages}
        onRetry={retry}
        onUndo={undo}
        onEdit={edit}
      />
      <InputBar
        categories={categories}
        onAddCategory={addCategory}
        onSend={send}
        onPickImage={rejectImage}
      />
    </main>
  );
}
