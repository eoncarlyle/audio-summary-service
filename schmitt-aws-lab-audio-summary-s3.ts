import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, waitForFileProcessing, recordBatchJob } from "./audio-summary-shared.js";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const model = "gemini-3.1-flash-lite";

// Review comment: change to S3 event
export const handler = async (event: any): Promise<string | undefined> => {
  const record = event.Records[0];
  const bucket = record.s3.bucket.name;
  const key = record.s3.object.key;

  const [slug, fileName] = key.split("/");
  const downloadSource = `s3://${bucket}/${key}`;

  const geminiApiKey = await getGeminiApiKey();
  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const contentArray = await response.Body?.transformToByteArray();
  const contentType = response.ContentType || "application/octet-stream";

  if (!contentArray) throw new Error("Failed to get file content");

  const uploadedFile = await googleGenAI.files.upload({
    file: new Blob([Buffer.from(contentArray)], { type: contentType }),
    config: {
      displayName: `${slug}:${fileName}`,
    },
  });

  if (!uploadedFile.name) throw new Error("File upload failed");
  await waitForFileProcessing(googleGenAI, uploadedFile.name);

  const batchJob = await googleGenAI.batches.create({
    model: model,
    src: [
      {
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: uploadedFile.uri!, mimeType: contentType } },
              { text: "Please provide a comprehensive summary of this content." },
            ],
          },
        ],
      },
    ],
  });

  if (!batchJob.name) throw new Error("Batch creation failed");

  await recordBatchJob(slug, downloadSource, batchJob.name, uploadedFile);

  return batchJob.name;
};
