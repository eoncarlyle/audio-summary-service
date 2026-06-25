#!/usr/bin/env node
const { execSync } = require("child_process");

function run(command, description) {
  console.log(`\n=== ${description} ===\n`);
  execSync(command, { stdio: "inherit" });
}

async function main() {
  // 1. Update IAM roles
  run(
    "aws cloudformation deploy --template-file cloudformation/role-policy-template.yaml --stack-name role-policy-template --capabilities CAPABILITY_NAMED_IAM",
    "Deploying IAM roles"
  );

  // 2. Set Gemini API key
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }
  run(
    `aws ssm put-parameter --name "/lambda/geminiApiKey" --value "${geminiApiKey}" --type SecureString --overwrite --no-cli-pager`,
    "Setting Gemini API key"
  );

  // 3. Deploy CloudFormation stack
  run(
    "aws cloudformation deploy --template-file cloudformation/summary-service-template.yaml --stack-name summary-service --capabilities CAPABILITY_NAMED_IAM --profile deploy-role",
    "Deploying service stack"
  );

  // 4. Package and deploy lambdas
  console.log("\n=== Packaging and deploying lambdas ===\n");
  const { deployAll } = require("./package-lambdas.js");
  await deployAll();

  console.log("\n=== All deployments complete ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
