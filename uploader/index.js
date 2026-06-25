#!/usr/bin/env node
const { GoogleGenAI, FileState } = require("@google/genai");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const lambdaClient = new LambdaClient({ region: "us-east-2" });

async function waitForFileProcessing(googleGenAI, fileName) {
  let file = await googleGenAI.files.get({ name: fileName });
  while (file.state === FileState.PROCESSING) {
    console.log(`  File ${fileName} still processing...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await googleGenAI.files.get({ name: fileName });
  }
  if (file.state === FileState.FAILED) {
    throw new Error(`File processing failed: ${fileName}`);
  }
  return file;
}

async function uploadAndInvoke({ feedSlug, title, guid, downloadSource }) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });

  // Download the file
  console.log(`Downloading ${downloadSource}...`);
  const response = await fetch(downloadSource);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  const contentBuffer = await response.arrayBuffer();
  console.log(`  Downloaded ${(contentBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // Upload to Google File API
  console.log("Uploading to Google File API...");
  const geminiFile = await googleGenAI.files.upload({
    file: new Blob([contentBuffer], { type: contentType }),
    config: {
      displayName: `${feedSlug}:${guid}`,
    },
  });

  if (!geminiFile.name) {
    throw new Error("File upload failed - no file name returned");
  }
  console.log(`  Uploaded as ${geminiFile.name}`);

  // Wait for processing
  console.log("Waiting for file processing...");
  const processedFile = await waitForFileProcessing(googleGenAI, geminiFile.name);
  console.log("  File ready");

  // Invoke the lambda
  console.log("Invoking linked lambda...");
  const lambdaPayload = {
    feedSlug,
    title,
    guid,
    downloadSource,
    geminiFile: {
      name: processedFile.name,
      uri: processedFile.uri,
      mimeType: contentType,
    },
  };

  const invokeResponse = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: "schmitt-aws-lab-audio-summary-linked",
      InvocationType: "Event", // async
      Payload: JSON.stringify(lambdaPayload),
    })
  );

  console.log(`  Lambda invoked (status: ${invokeResponse.StatusCode})`);
  return lambdaPayload;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error("Usage: node index.js <feedSlug> <title> <guid> <downloadSource>");
    console.error("  or pipe JSON: echo '{...}' | node index.js");
    process.exit(1);
  }

  const [feedSlug, title, guid, downloadSource] = args;

  try {
    const result = await uploadAndInvoke({ feedSlug, title, guid, downloadSource });
    console.log("\nSuccess:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
