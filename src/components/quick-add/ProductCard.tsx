"use client";

import { useState } from "react";
import type { RawProductFields } from "@/lib/quick-add/parse";
import type { ProductMessage } from "./types";

interface ProductCardProps {
  message: ProductMessage;
  onRetry: (id: string) => void;
  onUndo: (id: string) => void;
  onEdit: (id: string, raw: RawProductFields) => Promise<string | null>;
}

const formatNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const inputClass =
  "w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-[#f15a2e]";

export default function ProductCard({
  message,
  onRetry,
  onUndo,
  onEdit,
}: ProductCardProps) {
  const { product, status } = message;
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<RawProductFields>({
    name: "",
    cost: "",
    sell: "",
    stock: "",
  });
  const [formError, setFormError] = useState("");

  const busy = status === "adding" || status === "removing" || status === "saving";

  const startEdit = () => {
    setFields({
      name: product.name,
      cost: String(product.cost),
      sell: String(product.sell),
      stock: String(product.stock),
    });
    setFormError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = await onEdit(message.id, fields);
    if (error) setFormError(error);
    else setEditing(false);
  };

  const statusLabel =
    status === "adding"
      ? "Adding..."
      : status === "saving"
        ? "Saving..."
        : status === "removing"
          ? "Removing..."
          : status === "added"
            ? "Added"
            : "";

  return (
    <div className="flex justify-end quick-add-in">
      <div
        className={`w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-3 ${
          busy ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            {message.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {product.name}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Cost {formatNumber(product.cost)} · Sell{" "}
              {formatNumber(product.sell)} · Stock {product.stock}
            </p>
            {statusLabel && (
              <p
                className={`mt-1 text-xs font-medium ${
                  status === "added" ? "text-[#f15a2e]" : "text-gray-400"
                }`}
              >
                {statusLabel}
              </p>
            )}
          </div>
        </div>

        {status === "error" && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-600">
              {message.error || "Could not add this product."}
            </p>
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="shrink-0 rounded-full bg-[#f15a2e] px-3 py-1.5 text-xs font-medium text-white"
            >
              Retry
            </button>
          </div>
        )}

        {message.notice && (
          <p className="mt-2 text-xs text-red-600">{message.notice}</p>
        )}

        {editing && (
          <form onSubmit={save} className="mt-3 grid grid-cols-3 gap-2">
            <label className="col-span-3 text-xs text-gray-500">
              Name
              <input
                className={`${inputClass} mt-1`}
                value={fields.name}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
              />
            </label>
            <label className="text-xs text-gray-500">
              Cost
              <input
                className={`${inputClass} mt-1`}
                inputMode="decimal"
                value={fields.cost}
                onChange={(e) => setFields({ ...fields, cost: e.target.value })}
              />
            </label>
            <label className="text-xs text-gray-500">
              Sell
              <input
                className={`${inputClass} mt-1`}
                inputMode="decimal"
                value={fields.sell}
                onChange={(e) => setFields({ ...fields, sell: e.target.value })}
              />
            </label>
            <label className="text-xs text-gray-500">
              Stock
              <input
                className={`${inputClass} mt-1`}
                inputMode="numeric"
                value={fields.stock}
                onChange={(e) =>
                  setFields({ ...fields, stock: e.target.value })
                }
              />
            </label>
            {formError && (
              <p className="col-span-3 text-xs text-red-600">{formError}</p>
            )}
            <div className="col-span-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-[#f15a2e] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {(status === "added" || status === "saving" || status === "removing") &&
          !editing && (
            <div className="mt-3 flex justify-end gap-4 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={startEdit}
                disabled={busy}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onUndo(message.id)}
                disabled={busy}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
              >
                Undo
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

