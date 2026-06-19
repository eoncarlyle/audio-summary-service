import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getOrCreateS3Object, saveFeed, Feed, FEED_BUCKET } from "./audio-summary-shared.js";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async () => {
  const listResponse = await s3Client.send(new ListObjectsV2Command({ Bucket: FEED_BUCKET }));
  if (!listResponse.Contents) return;

  for (const object of listResponse.Contents) {
    if (!object.Key?.endsWith(".json")) continue;

    const slug = object.Key.replace(".json", "");
    const { body: feed, etag } = await getOrCreateS3Object<Feed>(slug, { slug, items: [] });

    if (feed.items.length > 25) {
      feed.items = feed.items.slice(0, 25);
      await saveFeed(feed, etag);
      console.log(`Truncated ${slug} to 25 items.`);
    }
  }
};
