import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured. Please add GEMINI_API_KEY to your .env.local file." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    // Clean up base64 string if it has a data URL prefix
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Analyze this product image and provide the following details in a perfectly valid JSON object.
Use EXACTLY these keys (lowercase):
{
  "name": "A short, descriptive product name",
  "category": "One of these: Home Goods, Electronics, Personal Care, Apparel, Stationery. Pick the best fit or suggest a new short one if none fit.",
  "brand": "The brand name if visible, otherwise an empty string",
  "description": "A 1-2 sentence description of the product"
}`;

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    console.log("Raw Gemini Response:", text);
    
    let parsedData;
    try {
      parsedData = JSON.parse(text);
      console.log("Parsed Data:", parsedData);
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", text);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error("Error analyzing image:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze image" },
      { status: 500 }
    );
  }
}
