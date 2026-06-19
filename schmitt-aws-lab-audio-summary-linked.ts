import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, waitForFileProcessing, recordBatchJob } from "./audio-summary-shared.js";

interface LinkedSummaryLambdaEvent {
  feedSlug: string;
  title: string;
  downloadSource: string;
  guid: string;
}

const model = "gemini-3.1-flash-lite";

function getEventFileName(event: LinkedSummaryLambdaEvent): string {
  return `${event.feedSlug}:${event.guid}`;
}

export const handler = async (event: LinkedSummaryLambdaEvent): Promise<string | undefined> => {
  const geminiApiKey = await getGeminiApiKey();
  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await fetch(event.downloadSource);

  if (!response.ok) {
    throw new Error(`Failed to download content from ${event.downloadSource}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const contentBuffer = await response.arrayBuffer();

  const geminiFile = await googleGenAI.files.upload({
    file: new Blob([contentBuffer], { type: contentType }),
    config: {
      displayName: getEventFileName(event),
    },
  });

  if (!geminiFile.name) {
    throw new Error("File upload failed - no file name returned");
  }
  try {
    await waitForFileProcessing(googleGenAI, geminiFile.name);

    const batchJob = await googleGenAI.batches.create({
      model: model,
      src: [
        {
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: geminiFile.uri!, mimeType: contentType } },
                { text: "Please provide a comprehensive summary of this content." },
              ],
            },
          ],
        },
      ],
    });

    if (batchJob.name === undefined) {
      throw Error();
    }

    await recordBatchJob(event.feedSlug, event.downloadSource, batchJob.name, geminiFile);

    return batchJob.name;
  } catch (error) {
    await googleGenAI.files.delete({ name: geminiFile.name });
    throw error;
  }
};
