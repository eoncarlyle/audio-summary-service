import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenAI, FileState } from "@google/genai";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamodbClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const FEED_BUCKET = "schmitt-aws-lab-audio-summary-feed";

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  createdAt: string;
}

export interface Feed {
  slug: string;
  items: FeedItem[];
}

export interface FeedWithETag<T> {
  feed: T;
  etag: string | undefined;
}

let cachedGeminiApiKey: string | undefined;

export async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;
  const response = await ssmClient.send(
    new GetParameterCommand({ Name: "lambda/geminiApiKey", WithDecryption: true })
  );
  if (!response.Parameter?.Value) throw new Error("Gemini API key not found");
  cachedGeminiApiKey = response.Parameter.Value;
  return cachedGeminiApiKey;
}

//todo: check that state is appropriate 
export async function waitForFileProcessing(googleGenAI: GoogleGenAI, fileName: string): Promise<void> {
  let file = await googleGenAI.files.get({ name: fileName });
  while (file.state === FileState.PROCESSING) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await googleGenAI.files.get({ name: fileName });
  }
  if (file.state === FileState.FAILED) throw new Error(`File processing failed: ${fileName}`);
}

export async function recordBatchJob(
  slug: string,
  resourceLink: string,
  batchJobName: string,
  fileName: string
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: process.env.BATCHES_TABLE_NAME,
      Item: {
        slug,
        resourceLink,
        geminiBatchName: batchJobName,
        geminiFileName: fileName,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

export async function getOrCreateS3Object<T>(slug: string, defaultValue: T): Promise<FeedWithETag<T>> {
  try {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: FEED_BUCKET, Key: `${slug}.json` }));
    const body = await response.Body?.transformToString();
    return { feed: body ? JSON.parse(body) as T : defaultValue, etag: response.ETag };
  } catch (err: any) {
    if (err.name !== "NoSuchKey") throw err;
    return { feed: defaultValue, etag: undefined };
  }
}

export async function saveFeed(feed: Feed, etag: string | undefined): Promise<void> {
  await s3Client.send(new PutObjectCommand({
    Bucket: FEED_BUCKET,
    Key: `${feed.slug}.json`,
    Body: JSON.stringify(feed, null, 2),
    ContentType: "application/json",
    ...(etag && { IfMatch: etag }),
  }));
}
