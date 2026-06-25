#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createWriteStream } = require("fs");

const BUILD_DIR = "lambdas/build";
const DIST_DIR = `${BUILD_DIR}/dist`;

async function zipDirectory(sourceDir, outPath) {
  const { ZipArchive } = await import("archiver");
  const output = createWriteStream(outPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function deployFunction(tsFile) {
  const functionName = path.basename(tsFile, ".ts");
  const zipFile = `${BUILD_DIR}/${functionName}.zip`;

  console.log(`Processing ${functionName}...`);

  // Clean up previous build
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.rmSync(zipFile, { force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Compile TypeScript to JavaScript
  console.log("  Compiling TypeScript...");
  execSync(
    [
      "npx esbuild",
      tsFile,
      "--bundle",
      "--platform=node",
      "--target=node18",
      "--external:@aws-sdk/*",
      `--outfile=${DIST_DIR}/index.js`,
    ].join(" "),
    { stdio: "inherit" },
  );

  // Create zip file
  console.log("  Creating zip file...");
  await zipDirectory(DIST_DIR, zipFile);

  // Upload to Lambda
  console.log("  Uploading to Lambda...");
  execSync(
    [
      "aws lambda update-function-code",
      `--function-name ${functionName}`,
      `--zip-file fileb://${zipFile}`,
      "--profile deploy-role",
      "| cat",
    ].join(" "),
    { stdio: "inherit" },
  );

  console.log(`  Done with ${functionName}`);
}

const LAMBDA_FILES = [
  "lambdas/schmitt-aws-lab-audio-summary-linked.ts",
  "lambdas/schmitt-aws-lab-audio-summary-s3.ts",
  "lambdas/schmitt-aws-lab-audio-summary-sync.ts",
  "lambdas/schmitt-aws-lab-audio-summary-truncate.ts",
  "lambdas/schmitt-aws-lab-audio-summary-get.ts",
];

async function deployAll() {
  for (const tsFile of LAMBDA_FILES) {
    await deployFunction(tsFile);
  }

  // Clean up
  fs.rmSync(DIST_DIR, { recursive: true, force: true });

  console.log("All functions deployed!");
}

module.exports = { deployAll };

// Run directly if called as script
if (require.main === module) {
  deployAll().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
