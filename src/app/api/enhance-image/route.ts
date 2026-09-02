import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.NANO_BANANA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    // Call the Nano Banana AI endpoint securely from the backend
    const response = await fetch("https://api.nanobanana.ai/v1/enhance", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData // forwarding the form data directly to the AI
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Nano Banana API Error:", errorText);
      // For this test, if the Nano Banana endpoint is fictional or down, we throw an error.
      return NextResponse.json({ error: "Nano Banana API failed to enhance image." }, { status: response.status });
    }

    // Nano Banana returns the enhanced, professional image as a binary blob
    const enhancedBlob = await response.blob();
    
    // Return it straight to the frontend
    return new NextResponse(enhancedBlob, {
      status: 200,
      headers: {
        "Content-Type": enhancedBlob.type || "image/png"
      }
    });

  } catch (error: any) {
    console.error("Backend Enhancement Error:", error);
    return NextResponse.json({ error: "Internal Server Error during AI enhancement" }, { status: 500 });
  }
}
