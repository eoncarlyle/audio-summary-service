import { getS3Object, Feed } from "./audio-summary-shared.js";

export const handler = async (event: any) => {
  const slug = event.queryStringParameters?.slug;
  if (!slug) {
    return { statusCode: 400, body: "Missing slug parameter" };
  }

  const result = await getS3Object<Feed>(`${slug}.json`);

  if (!result || !result.body) {
    return { statusCode: 404, body: "Feed not found" };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.body),
  };
};
