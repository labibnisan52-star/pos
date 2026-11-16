"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  isSkipCommand,
  parseQuickAdd,
  validateProductFields,
  type QuickAddProduct,
  type RawProductFields,
} from "@/lib/quick-add/parse";
import {
  deleteProduct,
  insertProduct,
  removeProductImage,
  updateProduct,
  uploadProductImage,
  validateImage,
} from "@/lib/quick-add/products";
import type { ChatMessage, ProductMessage } from "./types";

const CATEGORY_STORAGE_KEY = "rizq_quick_add_category";

const FORMAT_HELP =
  "Name, cost price, selling price, stock\nExample: Red Panjabi, 800, 1200, 15";

interface QueuedImage {
  id: string;
  file: File;
  previewUrl: string;
  imageUrl: string | null;
  storagePath: string | null;
  uploadError: string | null;
  uploadPromise: Promise<void>;
}

interface Job {
  product: QuickAddProduct;
  category: string;
  queued: QueuedImage;
  productId: string | null;
}

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${counter++}`;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function useQuickAdd() {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [categories, setCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(CATEGORY_STORAGE_KEY) || "";
      return saved ? [saved] : [];
    } catch {
      return [];
    }
  });
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(CATEGORY_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const queueRef = useRef<QueuedImage[]>([]);
  const batchIndexRef = useRef(0);
  const batchTotalRef = useRef(0);
  const jobs = useRef(new Map<string, Job>());
  const previews = useRef<string[]>([]);

  // Load distinct categories from products
  useEffect(() => {
    let active = true;

    supabase
      .from("products")
      .select("category")
      .not("category", "is", null)
      .then(({ data }) => {
        if (!active || !data) return;
        const distinct = Array.from(
          new Set(
            data
              .map((row) => String(row.category || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        setCategories((prev) =>
          Array.from(new Set([...distinct, ...prev])).sort((a, b) =>
            a.localeCompare(b)
          )
        );
      });

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const selectCategory = useCallback((name: string) => {
    setSelectedCategory(name);
    try {
      if (name) {
        localStorage.setItem(CATEGORY_STORAGE_KEY, name);
      } else {
        localStorage.removeItem(CATEGORY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const addCategory = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setCategories((prev) =>
      prev.includes(clean)
        ? prev
        : [...prev, clean].sort((a, b) => a.localeCompare(b))
    );
  }, []);

  const patch = useCallback((id: string, changes: Partial<ProductMessage>) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "product" && m.id === id ? { ...m, ...changes } : m
      )
    );
  }, []);

  const pushBot = useCallback((text: string, imageUrl?: string) => {
    setMessages((prev) => [
      ...prev,
      { kind: "bot", id: nextId(), text, imageUrl },
    ]);
  }, []);

  const promptNextOrFinish = useCallback(() => {
    const head = queueRef.current[0];
    if (!head) {
      batchIndexRef.current = 0;
      batchTotalRef.current = 0;
      pushBot("All done");
      return;
    }
    pushBot(
      `${batchIndexRef.current}/${batchTotalRef.current} - Name, cost price, selling price, stock`,
      head.previewUrl
    );
  }, [pushBot]);

  const startBackgroundUpload = useCallback(
    (item: QueuedImage) => {
      item.uploadPromise = uploadProductImage(supabase, item.file)
        .then((uploaded) => {
          item.imageUrl = uploaded.url;
          item.storagePath = uploaded.path;
          item.uploadError = null;
        })
        .catch((err) => {
          item.uploadError = messageOf(err);
        });
    },
    [supabase]
  );

  const enqueueImages = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const validItems: QueuedImage[] = [];

      for (const file of list) {
        const problem = validateImage(file);
        if (problem) {
          pushBot(`${file.name}: ${problem}`);
          continue;
        }
        const previewUrl = URL.createObjectURL(file);
        previews.current.push(previewUrl);

        const item: QueuedImage = {
          id: nextId(),
          file,
          previewUrl,
          imageUrl: null,
          storagePath: null,
          uploadError: null,
          uploadPromise: Promise.resolve(),
        };
        startBackgroundUpload(item);
        validItems.push(item);
      }

      if (validItems.length === 0) return;

      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.push(...validItems);

      if (wasEmpty) {
        batchIndexRef.current = 1;
        batchTotalRef.current = validItems.length;
      } else {
        batchTotalRef.current += validItems.length;
      }

      setMessages((prev) => [
        ...prev,
        {
          kind: "images",
          id: nextId(),
          urls: validItems.map((i) => i.previewUrl),
        },
      ]);

      if (wasEmpty) {
        promptNextOrFinish();
      }
    },
    [pushBot, startBackgroundUpload, promptNextOrFinish]
  );

  const runAdd = useCallback(
    async (id: string) => {
      const job = jobs.current.get(id);
      if (!job) return;
      patch(id, { status: "adding", error: undefined });
      try {
        await job.queued.uploadPromise;
        if (!job.queued.imageUrl) {
          // Retry upload if initial background upload failed
          const uploaded = await uploadProductImage(supabase, job.queued.file);
          job.queued.imageUrl = uploaded.url;
          job.queued.storagePath = uploaded.path;
          job.queued.uploadError = null;
        }
        if (!job.productId) {
          job.productId = await insertProduct(
            supabase,
            job.product,
            job.category,
            job.queued.imageUrl
          );
        }
        patch(id, { status: "added" });
      } catch (err) {
        patch(id, { status: "error", error: messageOf(err) });
      }
    },
    [supabase, patch]
  );

  const send = useCallback(
    (text: string): "ok" | "invalid" => {
      const current = queueRef.current[0];
      if (!current) {
        pushBot("Please add an image first");
        return "invalid";
      }

      if (isSkipCommand(text)) {
        const skipped = queueRef.current.shift()!;
        batchIndexRef.current += 1;

        // Clean up background upload from Storage
        void skipped.uploadPromise.then(() => {
          if (skipped.storagePath) {
            void removeProductImage(supabase, skipped.storagePath);
          }
        });

        promptNextOrFinish();
        return "ok";
      }

      if (!selectedCategory) {
        pushBot("Please select a category first");
        return "invalid";
      }

      const parsed = parseQuickAdd(text);
      if (!parsed.ok) {
        pushBot(FORMAT_HELP);
        return "invalid";
      }

      const queued = queueRef.current.shift()!;
      batchIndexRef.current += 1;

      const id = nextId();
      jobs.current.set(id, {
        product: parsed.value,
        category: selectedCategory,
        queued,
        productId: null,
      });

      setMessages((prev) => [
        ...prev,
        {
          kind: "product",
          id,
          product: parsed.value,
          category: selectedCategory,
          previewUrl: queued.previewUrl,
          status: "adding",
        },
      ]);

      void runAdd(id);
      promptNextOrFinish();
      return "ok";
    },
    [supabase, selectedCategory, pushBot, promptNextOrFinish, runAdd]
  );

  const retry = useCallback((id: string) => void runAdd(id), [runAdd]);

  const undo = useCallback(
    async (id: string) => {
      const job = jobs.current.get(id);
      if (!job?.productId) return;
      patch(id, { status: "removing", notice: undefined });
      try {
        await deleteProduct(supabase, job.productId);
      } catch (err) {
        patch(id, { status: "added", notice: messageOf(err) });
        return;
      }

      jobs.current.delete(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));

      if (job.queued.storagePath) {
        const removed = await removeProductImage(
          supabase,
          job.queued.storagePath
        );
        pushBot(
          removed
            ? `Removed "${job.product.name}".`
            : `Removed "${job.product.name}", but its image could not be deleted.`
        );
      } else {
        pushBot(`Removed "${job.product.name}".`);
      }
    },
    [supabase, patch, pushBot]
  );

  const edit = useCallback(
    async (
      id: string,
      raw: RawProductFields,
      category: string
    ): Promise<string | null> => {
      const job = jobs.current.get(id);
      if (!job?.productId) return "This product is not saved yet.";
      const next = validateProductFields(raw);
      if (!next) {
        return "Check the values: cost, selling price and stock must be numbers (stock a whole number).";
      }
      const nextCategory = category.trim() || "Uncategorized";

      patch(id, { status: "saving", notice: undefined });
      try {
        await updateProduct(supabase, job.productId, next, nextCategory);
        job.product = next;
        job.category = nextCategory;
        addCategory(nextCategory);
        patch(id, { status: "added", product: next, category: nextCategory });
        return null;
      } catch (err) {
        patch(id, { status: "added", notice: messageOf(err) });
        return messageOf(err);
      }
    },
    [supabase, patch, addCategory]
  );

  return {
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
  };
}
