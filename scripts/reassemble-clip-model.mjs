import fs from "node:fs";
import path from "node:path";

const onnxDir = path.join(
  process.cwd(),
  "public",
  "models",
  "Xenova",
  "clip-vit-base-patch32",
  "onnx"
);
const targetFile = path.join(onnxDir, "vision_model_quantized.onnx");
const MODEL_URL =
  "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx";
const MIN_EXPECTED_BYTES = 80 * 1024 * 1024;

async function main() {
  if (fs.existsSync(targetFile)) {
    const size = fs.statSync(targetFile).size;
    if (size >= MIN_EXPECTED_BYTES) {
      console.log(`CLIP ONNX model already present (${size} bytes).`);
      return;
    }
  }

  fs.mkdirSync(onnxDir, { recursive: true });
  console.log(`Downloading self-hosted CLIP ONNX model for build from ${MODEL_URL}...`);
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download CLIP ONNX model: HTTP ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length < MIN_EXPECTED_BYTES) {
    throw new Error(`Downloaded model looks incomplete (${buf.length} bytes).`);
  }
  fs.writeFileSync(targetFile, buf);
  console.log(`Saved ${targetFile} (${buf.length} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
