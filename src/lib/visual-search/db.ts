import Dexie, { type Table } from "dexie";
import type {
  MatchableProduct,
  MatchableVariant,
} from "./similarity";

export interface CachedProduct extends MatchableProduct {
  /** Concatenated variant SKUs for Fuse.js offline search */
  variant_skus?: string;
}

export interface CachedEmbedding {
  id: string;
  product_id: string;
  variant_id: string | null;
  model_name: string;
  embedding: number[];
  source_image_url: string | null;
  updated_at: string;
}

export interface SyncMetaRecord {
  key: string;
  value: string;
}

class VisualSearchDexieDB extends Dexie {
  products!: Table<CachedProduct, string>;
  variants!: Table<MatchableVariant, string>;
  embeddings!: Table<CachedEmbedding, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super("rizq_pos_visual_search");
    this.version(1).stores({
      products: "id, name, barcode, category",
      variants: "id, product_id, sku",
      embeddings: "id, product_id, variant_id, updated_at",
      syncMeta: "key",
    });
  }
}

let dbInstance: VisualSearchDexieDB | null = null;

export function getVisualSearchDB(): VisualSearchDexieDB {
  if (!dbInstance) {
    dbInstance = new VisualSearchDexieDB();
  }
  return dbInstance;
}

