#!/bin/bash
set -e

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY environment variable is not set"
  exit 1
fi

aws ssm put-parameter \
  --name "/lambda/geminiApiKey" \
  --value "$GEMINI_API_KEY" \
  --type SecureString \
  --overwrite

echo "Successfully updated /lambda/geminiApiKey"
