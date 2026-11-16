import { CLIP_IMAGE_SIZE } from "./constants";

/**
 * Draws any image source onto a 224x224 canvas (center-cropped square) and
 * returns a compressed JPEG Blob ready for CLIP embedding.
 */
async function bitmapTo224Jpeg(bitmap: ImageBitmap): Promise<Blob> {
  const size = CLIP_IMAGE_SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.max(0, Math.floor((bitmap.width - side) / 2));
  const sy = Math.max(0, Math.floor((bitmap.height - side) / 2));

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not initialize OffscreenCanvas 2D context.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize canvas 2D context.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to compress image to 224x224 JPEG."));
      },
      "image/jpeg",
      0.85
    );
  });
}

/** Resize and compress a local File or Blob to 224x224 JPEG. */
export async function prepareFileForEmbedding(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await bitmapTo224Jpeg(bitmap);
  } finally {
    bitmap.close();
  }
}

/**
 * Captures the current video frame from a live <video> element and resizes
 * it to 224x224 JPEG without sending anything over the network.
 */
export async function captureVideoFrameForEmbedding(
  video: HTMLVideoElement
): Promise<{ fullPreviewUrl: string; embeddingBlob: Blob }> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error("Camera feed is not ready yet.");
  }

  // Full-resolution preview snapshot for the Results screen thumbnail
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = vw;
  previewCanvas.height = vh;
  const pCtx = previewCanvas.getContext("2d");
  if (!pCtx) throw new Error("Could not capture camera frame.");
  pCtx.drawImage(video, 0, 0, vw, vh);
  const fullPreviewUrl = previewCanvas.toDataURL("image/jpeg", 0.85);

  const bitmap = await createImageBitmap(previewCanvas);
  try {
    const embeddingBlob = await bitmapTo224Jpeg(bitmap);
    return { fullPreviewUrl, embeddingBlob };
  } finally {
    bitmap.close();
  }
}

/**
 * Fetches a remote product image via fetch -> blob -> createImageBitmap to
 * avoid canvas CORS tainting, then resizes/compresses to 224x224 JPEG.
 */
export async function fetchRemoteImageForEmbedding(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) {
    throw new Error(`Failed to fetch product image (${res.status}).`);
  }
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return await bitmapTo224Jpeg(bitmap);
  } finally {
    bitmap.close();
  }
}

