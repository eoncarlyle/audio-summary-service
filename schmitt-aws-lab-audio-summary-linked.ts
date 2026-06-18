import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { GoogleGenAI, FileState } from "@google/genai";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const FEED_BUCKET = "schmitt-aws-lab-audio-summary-feed";

interface FeedItem {
  guid: string;
  title: string;
  link: string;
  summary: string;
  createdAt: string;
}

interface Feed {
  slug: string;
  items: FeedItem[];
}

interface LinkedSummaryLambdaEvent {
  feedSlug: string;
  title: string;
  downloadLink: string;
  guid: string;
}

let cachedGeminiApiKey: string | undefined;

const model = "gemini-3.1-flash-lite";

async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) {
    return cachedGeminiApiKey;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: "lambda/geminiApiKey",
      WithDecryption: true,
    }),
  );

  if (!response.Parameter?.Value) {
    throw new Error("Gemini API key not found in Parameter Store");
  }

  cachedGeminiApiKey = response.Parameter.Value;
  return cachedGeminiApiKey;
}

async function waitForFileProcessing(googleGenAI: GoogleGenAI, fileName: string): Promise<void> {
  let file = await googleGenAI.files.get({ name: fileName });

  while (file.state === FileState.PROCESSING) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await googleGenAI.files.get({ name: fileName });
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`File processing failed: ${fileName}`);
  }
}

function getEventFileName(event: LinkedSummaryLambdaEvent): string {
  return `${event.feedSlug}:${event.guid}`;
}

interface FeedWithETag {
  feed: Feed;
  etag: string | undefined;
}

async function getOrCreateFeed(slug: string): Promise<FeedWithETag> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: FEED_BUCKET,
        Key: `${slug}.json`,
      }),
    );
    const body = await response.Body?.transformToString();
    if (body) {
      return {
        feed: JSON.parse(body) as Feed,
        etag: response.ETag,
      };
    }
  } catch (err: any) {
    if (err.name !== "NoSuchKey") {
      throw err;
    }
  }

  return { feed: { slug, items: [] }, etag: undefined };
}

async function saveFeed(feed: Feed, etag: string | undefined): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: FEED_BUCKET,
      Key: `${feed.slug}.json`,
      Body: JSON.stringify(feed, null, 2),
      ContentType: "application/json",
      ...(etag && { IfMatch: etag }),
    }),
  );
}

export const handler = async (event: LinkedSummaryLambdaEvent): Promise<string | undefined> => {
  const geminiApiKey = await getGeminiApiKey();
  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await fetch(event.downloadLink);

  if (!response.ok) {
    throw new Error(`Failed to download content from ${event.downloadLink}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const contentBuffer = await response.arrayBuffer();

  const uploadedFile = await googleGenAI.files.upload({
    file: new Blob([contentBuffer], { type: contentType }),
    config: {
      displayName: getEventFileName(event),
    },
  });

  if (!uploadedFile.name) {
    throw new Error("File upload failed - no file name returned");
  }

  await waitForFileProcessing(googleGenAI, uploadedFile.name);

  const result = await googleGenAI.models.generateContent({
    model: model,
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: uploadedFile.uri!, mimeType: contentType } },
          { text: "Please provide a comprehensive summary of this content." },
        ],
      },
    ],
  });

  await googleGenAI.files.delete({ name: getEventFileName(event) });

  const summary = result.text ?? "";

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { feed, etag } = await getOrCreateFeed(event.feedSlug);

    const newItem: FeedItem = {
      guid: event.guid,
      title: event.title,
      link: event.downloadLink,
      summary,
      createdAt: new Date().toISOString(),
    };

    const existingIndex = feed.items.findIndex((item) => item.guid === event.guid);
    if (existingIndex >= 0) {
      feed.items[existingIndex] = newItem;
    } else {
      feed.items.unshift(newItem);
    }

    try {
      await saveFeed(feed, etag);
      break;
    } catch (err: any) {
      if (err.name === "PreconditionFailed" && attempt < maxRetries) {
        continue;
      }
      throw err;
    }
  }

  return summary;
};
