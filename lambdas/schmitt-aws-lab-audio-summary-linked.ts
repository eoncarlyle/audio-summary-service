import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, recordBatchJob } from "./audio-summary-shared.js";

interface GeminiFileInfo {
  name: string;
  uri: string;
  mimeType: string;
}

interface LinkedSummaryLambdaEvent {
  feedSlug: string;
  title: string;
  downloadSource: string;
  guid: string;
  geminiFile: GeminiFileInfo;
}

const model = "gemini-3.1-flash-lite";

export const handler = async (event: LinkedSummaryLambdaEvent): Promise<string | undefined> => {
  const geminiApiKey = await getGeminiApiKey();
  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const { geminiFile } = event;

  try {
    const batchJob = await googleGenAI.batches.create({
      model: model,
      src: [
        {
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: geminiFile.uri, mimeType: geminiFile.mimeType } },
                { text: "Please provide a comprehensive summary of this content." },
              ],
            },
          ],
        },
      ],
    });

    if (batchJob.name === undefined) {
      throw new Error("Batch job creation failed - no name returned");
    }

    await recordBatchJob(event.feedSlug, event.downloadSource, batchJob.name, {
      name: geminiFile.name,
      uri: geminiFile.uri,
    } as any);

    return batchJob.name;
  } catch (error) {
    await googleGenAI.files.delete({ name: geminiFile.name });
    throw error;
  }
};
