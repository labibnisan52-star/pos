"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
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

const DEFAULT_CATEGORIES = [
  "Uncategorized",
  "Apparel",
  "Home Goods",
  "Electronics",
  "Personal Care",
  "Stationery",
  "Footwear",
  "Accessories",
];

const FORMAT_HELP =
  "That doesn't look right. Please type:\nName, cost price, selling price, stock\n\nExample: Red Panjabi, 800, 1200, 15";

/** Data needed to (re)try a save; kept out of render state. */
interface Job {
  product: QuickAddProduct;
  category: string;
  file: File | null;
  imageUrl: string | null;
  storagePath: string | null;
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
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const jobs = useRef(new Map<string, Job>());
  const previews = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("products")
      .select("category")
      .not("category", "is", null)
      .then(({ data }) => {
        if (!active || !data) return;
        const fromDb = data
          .map((row) => String(row.category || "").trim())
          .filter(Boolean);
        if (fromDb.length > 0) {
          setCategories((prev) => Array.from(new Set([...prev, ...fromDb])));
        }
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addCategory = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setCategories((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
  }, []);

  const patch = useCallback((id: string, changes: Partial<ProductMessage>) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "product" && m.id === id ? { ...m, ...changes } : m
      )
    );
  }, []);

  const pushBot = useCallback((text: string) => {
    setMessages((prev) => [...prev, { kind: "bot", id: nextId(), text }]);
  }, []);

  const runAdd = useCallback(
    async (id: string) => {
      const job = jobs.current.get(id);
      if (!job) return;
      patch(id, { status: "adding", error: undefined });
      try {
        if (job.file && !job.imageUrl) {
          const uploaded = await uploadProductImage(supabase, job.file);
          job.imageUrl = uploaded.url;
          job.storagePath = uploaded.path;
        }
        if (!job.productId) {
          job.productId = await insertProduct(
            supabase,
            job.product,
            job.category,
            job.imageUrl
          );
        }
        patch(id, { status: "added" });
      } catch (err) {
        patch(id, { status: "error", error: messageOf(err) });
      }
    },
    [supabase, patch]
  );

  /** Returns "ok" when a card was queued, "invalid" when the text failed to parse. */
  const send = useCallback(
    (text: string, file: File | null, category: string): "ok" | "invalid" => {
      const parsed = parseQuickAdd(text);
      if (!parsed.ok) {
        pushBot(FORMAT_HELP);
        return "invalid";
      }

      const id = nextId();
      const chosenCategory = category.trim() || "Uncategorized";
      let previewUrl: string | null = null;
      if (file) {
        previewUrl = URL.createObjectURL(file);
        previews.current.push(previewUrl);
      }

      jobs.current.set(id, {
        product: parsed.value,
        category: chosenCategory,
        file,
        imageUrl: null,
        storagePath: null,
        productId: null,
      });
      setMessages((prev) => [
        ...prev,
        {
          kind: "product",
          id,
          product: parsed.value,
          category: chosenCategory,
          previewUrl,
          status: "adding",
        },
      ]);
      void runAdd(id);
      return "ok";
    },
    [pushBot, runAdd]
  );

  const rejectImage = useCallback(
    (file: File): string | null => {
      const problem = validateImage(file);
      if (problem) pushBot(problem);
      return problem;
    },
    [pushBot]
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

      if (job.storagePath) {
        const removed = await removeProductImage(supabase, job.storagePath);
        pushBot(
          removed
            ? `Removed "${job.product.name}".`
            : `Removed "${job.product.name}", but its image could not be deleted. A storage delete policy is probably missing.`
        );
      } else {
        pushBot(`Removed "${job.product.name}".`);
      }
    },
    [supabase, patch, pushBot]
  );

  /** Returns an error message, or null on success. */
  const edit = useCallback(
    async (id: string, raw: RawProductFields): Promise<string | null> => {
      const job = jobs.current.get(id);
      if (!job?.productId) return "This product is not saved yet.";
      const next = validateProductFields(raw);
      if (!next) {
        return "Check the values: cost, selling price and stock must be numbers (stock a whole number).";
      }

      patch(id, { status: "saving", notice: undefined });
      try {
        await updateProduct(supabase, job.productId, next);
        job.product = next;
        patch(id, { status: "added", product: next });
        return null;
      } catch (err) {
        patch(id, { status: "added", notice: messageOf(err) });
        return messageOf(err);
      }
    },
    [supabase, patch]
  );

  return {
    messages,
    categories,
    addCategory,
    send,
    rejectImage,
    retry,
    undo,
    edit,
  };
}
