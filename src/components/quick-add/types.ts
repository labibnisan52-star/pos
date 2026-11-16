import type { QuickAddProduct } from "@/lib/quick-add/parse";

export type CardStatus =
  | "adding"
  | "added"
  | "error"
  | "saving"
  | "removing"
  | "removed";

export interface BotMessage {
  kind: "bot";
  id: string;
  text: string;
}

export interface ProductMessage {
  kind: "product";
  id: string;
  product: QuickAddProduct;
  category: string;
  previewUrl: string | null;
  status: CardStatus;
  /** Shown with Retry when status is "error". */
  error?: string;
  /** Non-blocking problem (e.g. an edit or undo that failed). */
  notice?: string;
}

export type ChatMessage = BotMessage | ProductMessage;
