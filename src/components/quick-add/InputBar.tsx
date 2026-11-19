"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, SendHorizontal } from "lucide-react";

const CAMERA_MAX_DIM = 640;
const CAMERA_JPEG_QUALITY = 0.45;

async function compressCameraImage(file: File): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(
          1,
          CAMERA_MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
        );
        const w = Math.max(1, Math.round((img.naturalWidth || CAMERA_MAX_DIM) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || CAMERA_MAX_DIM) * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "camera";
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          CAMERA_JPEG_QUALITY
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

interface InputBarProps {
  onPickImages: (files: FileList | File[]) => void;
  onSend: (text: string) => "ok" | "invalid";
}

export default function InputBar({ onPickImages, onSend }: InputBarProps) {
  const [text, setText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onPickImages(files);
    }
    e.target.value = "";
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      e.target.value = "";
      return;
    }
    const captured = Array.from(files);
    e.target.value = "";

    setIsCapturing(true);
    try {
      const compressed = await Promise.all(captured.map(compressCameraImage));
      onPickImages(compressed);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePick}
            className="hidden"
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={isCapturing}
            aria-label="Take low quality photo"
            title="Camera (Low Quality)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          >
            <Camera className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add images"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name, cost price, selling price, stock"
            aria-label="Product details"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1 focus:ring-[#f15a2e]"
          />

          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f15a2e] text-white disabled:opacity-40"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
