import { getOrCreateS3Object, Feed } from "./audio-summary-shared.js";

export const handler = async (event: any) => {
  const slug = event.queryStringParameters?.slug;
  if (!slug) {
    return { statusCode: 400, body: "Missing slug parameter" };
  }

  const { feed, etag } = await getOrCreateS3Object<Feed>(slug, { slug, items: [] });
  
  if (!etag) { // etag is undefined if file didn't exist
    return { statusCode: 404, body: "Feed not found" };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feed),
  };
};
