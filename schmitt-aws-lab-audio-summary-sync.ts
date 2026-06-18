import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, getOrCreateS3Object, saveFeed, Feed } from "./audio-summary-shared.js";
import { DynamoDBClient, ScanCommand, DeleteCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamodbClient);

export const handler = async () => {
  const geminiApiKey = await getGeminiApiKey();
  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const { Items } = await docClient.send(new ScanCommand({ TableName: process.env.BATCHES_TABLE_NAME }));

  if (!Items) return;

  for (const item of Items) {
    const slug = item.slug.S!;
    const resourceLink = item.resourceLink.S!;
    const geminiBatchName = item.geminiBatchName.S!;
    const geminiFileName = item.geminiFileName.S!;

    const batchJob = await googleGenAI.batches.get({ name: geminiBatchName });

    if (String(batchJob.state) === "COMPLETED") {
      const result = await (googleGenAI.batches as any).getResults({ name: geminiBatchName });
      const summaryText = result.results[0].text;

      const { feed, etag } = await getOrCreateS3Object<Feed>(slug, { slug, items: [] });
      feed.items.unshift({
        guid: geminiBatchName,
        title: "Summary",
        link: resourceLink,
        description: summaryText,
        createdAt: new Date().toISOString(),
      });
      await saveFeed(feed, etag);

      await googleGenAI.files.delete({ name: geminiFileName });
      await docClient.send(new DeleteCommand({ 
        TableName: process.env.BATCHES_TABLE_NAME, 
        Key: { slug: {S: slug}, resourceLink: {S: resourceLink} } 
      }));
      
    } else if (String(batchJob.state) === "FAILED" || String(batchJob.state) === "CANCELLED") {
      console.error(`Batch ${geminiBatchName} for ${slug} ${resourceLink} failed with state: ${batchJob.state}`);
    } else {
      console.log(`Batch ${geminiBatchName} is still ${batchJob.state}`);
    }
  }
};
