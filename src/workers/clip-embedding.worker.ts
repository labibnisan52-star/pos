import {
  CLIPImageProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";
import { CLIP_EMBEDDING_DIM, CLIP_MODEL_NAME } from "@/lib/visual-search/constants";
import { l2Normalize } from "@/lib/visual-search/similarity";

// Strictly self-hosted: never hit huggingface.co or jsdelivr at runtime.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.useBrowserCache = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = "/models/ort/";
}

type WorkerRequest =
  | { id: string; type: "warmup" }
  | { id: string; type: "embed"; blob: Blob };

type WorkerResponse =
  | { id: string; ok: true; type: "warmup"; device: "webgpu" | "wasm" }
  | { id: string; ok: true; type: "embed"; embedding: number[]; device: "webgpu" | "wasm" }
  | { id: string; ok: false; error: string };

let processorPromise: Promise<CLIPImageProcessor> | null = null;
let modelPromise: Promise<{
  model: CLIPVisionModelWithProjection;
  device: "webgpu" | "wasm";
}> | null = null;

async function hasWebGPU(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!nav?.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function getProcessor(): Promise<CLIPImageProcessor> {
  if (!processorPromise) {
    processorPromise = CLIPImageProcessor.from_pretrained(CLIP_MODEL_NAME);
  }
  return processorPromise;
}

async function getVisionModel(): Promise<{
  model: CLIPVisionModelWithProjection;
  device: "webgpu" | "wasm";
}> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const preferWebGPU = await hasWebGPU();
      if (preferWebGPU) {
        try {
          const model = (await CLIPVisionModelWithProjection.from_pretrained(
            CLIP_MODEL_NAME,
            { dtype: "q8", device: "webgpu" }
          )) as CLIPVisionModelWithProjection;
          return { model, device: "webgpu" as const };
        } catch {
          // Fall back cleanly to WASM if WebGPU initialization fails
        }
      }

      const model = (await CLIPVisionModelWithProjection.from_pretrained(
        CLIP_MODEL_NAME,
        { dtype: "q8", device: "wasm" }
      )) as CLIPVisionModelWithProjection;
      return { model, device: "wasm" as const };
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

function formatWorkerError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    err instanceof RangeError ||
    lower.includes("out of memory") ||
    lower.includes("oom") ||
    lower.includes("allocation")
  ) {
    return "Device ran out of memory while loading the visual search model. Close other tabs and try again.";
  }
  if (lower.includes("404") || lower.includes("failed to fetch")) {
    return "Visual search model files could not be loaded. Check your connection for first-time setup.";
  }
  return msg || "Visual search failed to process the image.";
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === "warmup") {
      const [, { device }] = await Promise.all([
        getProcessor(),
        getVisionModel(),
      ]);
      const res: WorkerResponse = {
        id: req.id,
        ok: true,
        type: "warmup",
        device,
      };
      self.postMessage(res);
      return;
    }

    if (req.type === "embed") {
      const [processor, { model, device }] = await Promise.all([
        getProcessor(),
        getVisionModel(),
      ]);

      const rawImage = await RawImage.fromBlob(req.blob);
      const inputs = await processor(rawImage);
      const output = (await model(inputs)) as {
        image_embeds?: { data: ArrayLike<number> };
      };

      const rawVec = output.image_embeds?.data;
      if (!rawVec || rawVec.length !== CLIP_EMBEDDING_DIM) {
        throw new Error(
          `Unexpected embedding dimension: ${rawVec?.length ?? 0}`
        );
      }

      const embedding = l2Normalize(rawVec);
      const res: WorkerResponse = {
        id: req.id,
        ok: true,
        type: "embed",
        embedding,
        device,
      };
      self.postMessage(res);
    }
  } catch (err) {
    const res: WorkerResponse = {
      id: req.id,
      ok: false,
      error: formatWorkerError(err),
    };
    self.postMessage(res);
  }
});

