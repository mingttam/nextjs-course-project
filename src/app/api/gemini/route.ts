import { geminiApi } from "./../../../services/quiz/geminiApi";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CHARS_PER_TOKEN = 4; // Gemini averages ~4 chars per token
const MAX_TOKEN_LIMIT = 1000000; // 1 million token limit for Gemini 2.0 Flash

// Estimate tokens from text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const promptTemplate = (inputs: string = "") => {
  return `
        You are an expert educational content creator who generates high-quality multiple-choice questions (MCQs) from provided text.
        Return ONLY a valid raw JSON, without triple backticks, without language tags, without extra text.
        
        Generate a number of MCQs based on the content size:
        - At least 5 questions minimum
        - Up to 6 questions maximum
        - Adjust the number based on content length (more content = more questions)
        - If the provided documents don't contain enough information to create good questions, use your knowledge to supplement with relevant information

        Return the questions in the following JSON format (no additional text, no explanation outside JSON):

        {
          "questions": [
            {
              "id": "",
              "questionText": "What is the primary purpose of the useEffect hook in React?",
              "options": {
                "A": "To create state variables in functional components",
                "B": "To perform side effects in functional components",
                "C": "To define component props",
                "D": "To optimize component rendering performance"
              },
              "correctAnswer": "B",
              "explanation": "The useEffect hook in React is designed to handle side effects in functional components, such as data fetching, subscriptions, or DOM manipulation.",
            }
          ]
        }

        Rules:
        - "id" must be unique.
        - "questionText" must be clear, concise, and between 10 and 1000 characters.
        - "options" must provide 4 choices with only one correct answer.
        - All incorrect options (distractors) must be plausible and related to the content.
        - "correctAnswer" must match exactly one of the option keys ("A", "B", "C", "D").
        - "explanation" should explain why the correct answer is right and be under 500 characters.
        - When information in the documents is insufficient, use your knowledge to supplement with relevant information.
        - Do NOT include any commentary, explanations, or markdown formatting outside the JSON.
        - No trailing commas in JSON.
        - Ensure the JSON is syntactically valid.
        
        Question Generation Guidelines:
        - Create questions that test different cognitive levels (knowledge recall, comprehension, application, analysis).
        - Distribute questions evenly across all important concepts and documents in the content.
        - Include a mix of difficulty levels (approximately 20% easy, 60% medium, 20% hard).
        - For each topic, progress from basic to more complex concepts.
        - Ensure distractors (wrong answers) are plausible and educational - they should represent common misconceptions.
        - Avoid overly tricky, ambiguous, or opinion-based questions.
        - Focus on key learning objectives and important concepts rather than trivial details.
        - Make questions standalone - they should be answerable without referring to other questions.
        
        Context:
        ${inputs}
      `;
};

export async function POST(req: Request) {
  try {
    // 1. Authentication & Authorization
    // const { userId } = auth();
    // if (!userId) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    // 2. Rate Limiting
    // const identifier = req.ip ?? '127.0.0.1';
    // const { success } = await rateLimiter.limit(identifier);
    // if (!success) {
    //   return new NextResponse('Too Many Requests', { status: 429 });
    // }

    const { texts } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid texts array" },
        { status: 400 }
      );
    }

    if (
      !texts.every((text) => typeof text === "string" && text.trim().length > 0)
    ) {
      return NextResponse.json(
        { error: "All texts must be non-empty strings" },
        { status: 400 }
      );
    }

    // Calculate estimated tokens for all documents
    const combinedLength = texts.reduce(
      (total, text) => total + text.length,
      0
    );
    const estimatedInputTokens = estimateTokens(combinedLength);

    // Add token for document separators
    const separatorTokens =
      estimateTokens("\n\n--- NEW DOCUMENT ---\n\n") * (texts.length - 1);

    // Estimate tokens for prompt template
    const promptTokens = estimateTokens(promptTemplate());

    // Calculate total tokens including input content, separators, and prompt
    const totalEstimatedTokens =
      estimatedInputTokens + separatorTokens + promptTokens;

    // Check if the total request would exceed token limits
    if (totalEstimatedTokens > MAX_TOKEN_LIMIT) {
      const exceedBy = (
        ((totalEstimatedTokens - MAX_TOKEN_LIMIT) / MAX_TOKEN_LIMIT) *
        100
      ).toFixed(1);
      return NextResponse.json(
        {
          error: `Request exceeds the usage limit by approximately ${exceedBy}%. Please reduce the size or number of documents.`,
        },
        { status: 400 }
      );
    }

    // Combine all texts with clear separation between documents
    const documentSeparator = "\n\n--- NEW DOCUMENT ---\n\n";
    const combinedText = texts.join(documentSeparator);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key is missing" },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let output = "";

    try {
      const result = await model.generateContent(promptTemplate(combinedText));
      output = result.response.text().trim();
    } catch (err: any) {
      console.error("Gemini generateContent error:", err);

      // QUOTA HẾT
      if (err.status === 429) {
        return NextResponse.json(
          { error: "Gemini quota exceeded (free tier hết)" },
          { status: 429 }
        );
      }

      // MODEL SAI / KHÔNG HỖ TRỢ
      if (err.status === 404) {
        return NextResponse.json(
          {
            error:
              "Gemini model không tồn tại hoặc không hỗ trợ generateContent",
          },
          { status: 400 }
        );
      }

      // LỖI KHÁC
      return NextResponse.json({ error: "Gemini API failed" }, { status: 500 });
    }

    // Remove any triple backticks or language tags if present
    output = output.replace(/```(?:json)?/g, "").trim();

    try {
      const parsed = JSON.parse(output);
      // const validation = quizGenerationResponseSchema.safeParse(parsed);
      // if (!validation.success) {
      //   // Handle invalid JSON structure, maybe retry or return error
      // }
      return NextResponse.json({ mcqs: parsed.questions || [] });
    } catch (err) {
      console.error("Failed to parse Gemini output:", err, output);
      return NextResponse.json(
        { error: "Invalid JSON from Gemini" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
