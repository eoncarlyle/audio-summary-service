#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ROLE_ARN = "arn:aws:iam::331867785991:role/DeployRole";
const SESSION_NAME = "deploy-session-0";
const SOURCE_PROFILE = "deploy-user";
const TARGET_PROFILE = "deploy-role";
const CREDENTIALS_PATH = join(homedir(), ".aws", "credentials");

const result = execSync(
  `aws sts assume-role --role-arn ${ROLE_ARN} --role-session-name ${SESSION_NAME} --profile ${SOURCE_PROFILE}`,
  { encoding: "utf-8" }
);

const { Credentials: { AccessKeyId, SecretAccessKey, SessionToken } } = JSON.parse(result);

const raw = readFileSync(CREDENTIALS_PATH, "utf-8");

const profileHeader = `[${TARGET_PROFILE}]`;
const replacement = [
  profileHeader,
  `aws_access_key_id=${AccessKeyId}`,
  `aws_secret_access_key=${SecretAccessKey}`,
  `aws_session_token=${SessionToken}`,
].join("\n");

let updated;
const profileRegex = new RegExp(
  `\\[${TARGET_PROFILE}\\][^\\[]*`,
  "s"
);

if (profileRegex.test(raw)) {
  updated = raw.replace(profileRegex, replacement + "\n\n");
} else {
  updated = raw.trimEnd() + "\n\n" + replacement + "\n";
}

writeFileSync(CREDENTIALS_PATH, updated);
console.log(`Updated [${TARGET_PROFILE}] in ${CREDENTIALS_PATH}`);
