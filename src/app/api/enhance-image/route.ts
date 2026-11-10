import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Check for Nano Banana API Key in environment or request header
    const apiKey =
      process.env.NANO_BANANA_API_KEY ||
      process.env.NANOBANANA_API_KEY ||
      req.headers.get("x-nanobanana-key") ||
      "";

    // 1. Try Nano Banana AI API if API key is provided
    if (apiKey) {
      try {
        const arrayBuffer = await image.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = image.type || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        // NanoBananaAPI endpoint for image editing and background isolation
        const endpoints = [
          "https://api.nanobananaapi.ai/api/v1/nanobanana/generate",
          "https://api.nanobananaapi.ai/api/v1/nanobanana/edit",
          "https://api.nanobanana.ai/v1/enhance",
        ];

        let successBlob: Blob | null = null;
        let successType = "image/jpeg";

        for (const endpoint of endpoints) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const isJsonEndpoint = endpoint.includes("nanobananaapi.ai");
            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                ...(isJsonEndpoint
                  ? { "Content-Type": "application/json" }
                  : {}),
              },
              body: isJsonEndpoint
                ? JSON.stringify({
                    prompt:
                      "Professional footwear e-commerce studio photograph of the shoe, clean pure white background, studio lightbox lighting, sharp product details, 4k",
                    image: dataUrl,
                    type: "edit",
                    resolution: "2K",
                  })
                : formData,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                const json = await response.json();
                const remoteUrl =
                  json?.data?.image_url ||
                  json?.image_url ||
                  (Array.isArray(json?.data) ? json.data[0]?.url : null) ||
                  json?.url;

                if (remoteUrl) {
                  const fetchImg = await fetch(remoteUrl);
                  if (fetchImg.ok) {
                    successBlob = await fetchImg.blob();
                    successType = successBlob.type || "image/jpeg";
                    break;
                  }
                }
              } else {
                successBlob = await response.blob();
                successType = successBlob.type || "image/jpeg";
                break;
              }
            }
          } catch (fetchErr) {
            console.warn(`Failed endpoint ${endpoint}:`, fetchErr);
          }
        }

        if (successBlob) {
          return new NextResponse(successBlob, {
            status: 200,
            headers: {
              "Content-Type": successType,
              "X-Enhanced-By": "nano-banana-api",
            },
          });
        }
      } catch (nanoBananaError) {
        console.warn("Nano Banana API processing failed:", nanoBananaError);
      }
    }

    // 2. Fallback signal: allows the frontend to apply high-fidelity client background removal & studio lighting
    return NextResponse.json({
      fallbackToClient: true,
      message:
        apiKey
          ? "Nano Banana cloud was unreachable; falling back to local studio AI engine."
          : "Nano Banana API key not set; using local studio AI engine.",
    });
  } catch (error: any) {
    console.error("Backend Enhancement Error:", error);
    return NextResponse.json(
      {
        fallbackToClient: true,
        error: error.message || "Internal server error during AI enhancement",
      },
      { status: 200 }
    );
  }
}
