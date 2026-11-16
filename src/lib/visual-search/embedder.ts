"use client";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let workerInstance: Worker | null = null;
let reqCounter = 0;
const pending = new Map<string, PendingRequest>();

function getWorker(): Worker {
  if (typeof window === "undefined") {
    throw new Error("Visual search can only run in the browser.");
  }
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("../../workers/clip-embedding.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerInstance.addEventListener("message", (event) => {
      const data = event.data as
        | { id: string; ok: true; type: "warmup"; device: "webgpu" | "wasm" }
        | {
            id: string;
            ok: true;
            type: "embed";
            embedding: number[];
            device: "webgpu" | "wasm";
          }
        | { id: string; ok: false; error: string };

      const entry = pending.get(data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(data.id);

      if (data.ok) {
        entry.resolve(data);
      } else {
        entry.reject(new Error(data.error));
      }
    });

    workerInstance.addEventListener("error", (event) => {
      const err = new Error(
        event.message || "Visual search worker crashed unexpectedly."
      );
      for (const [id, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(err);
        pending.delete(id);
      }
      workerInstance?.terminate();
      workerInstance = null;
    });
  }
  return workerInstance;
}

function sendToWorker<T>(
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<T> {
  const worker = getWorker();
  const id = `vs_${Date.now()}_${reqCounter++}`;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Visual search timed out. Please try again."));
    }, timeoutMs);

    pending.set(id, {
      resolve: (v) => resolve(v as T),
      reject,
      timer,
    });

    worker.postMessage({ id, ...payload });
  });
}

/** Lazy-loads the CLIP vision model in the Web Worker (safe to call repeatedly). */
export async function warmupVisualModel(): Promise<"webgpu" | "wasm"> {
  const res = await sendToWorker<{ device: "webgpu" | "wasm" }>(
    { type: "warmup" },
    90_000
  );
  return res.device;
}

/** Computes a 512-dim L2-normalized CLIP vision embedding from a 224x224 Blob. */
export async function computeImageEmbedding(
  blob: Blob
): Promise<{ embedding: number[]; device: "webgpu" | "wasm" }> {
  const res = await sendToWorker<{
    embedding: number[];
    device: "webgpu" | "wasm";
  }>({ type: "embed", blob }, 90_000);
  return { embedding: res.embedding, device: res.device };
}

export function terminateVisualEmbedder(): void {
  for (const [id, entry] of pending.entries()) {
    clearTimeout(entry.timer);
    entry.reject(new Error("Visual search was cancelled."));
    pending.delete(id);
  }
  workerInstance?.terminate();
  workerInstance = null;
}

