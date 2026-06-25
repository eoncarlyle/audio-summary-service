# Notes

## Disclosures

Gemini wrote almost all of the lambdas because this is supposed to be an AWS IAM and CF training exercise

https://feed.podbean.com/thetelecomscompodcast/feed.xml

Dynamo tables for slugs and for batches in progress for google file handling=

## Lambda Scheduling (EventBridge)

- **Job Sync (`schmitt-aws-lab-audio-summary-sync`):**
  - **Goal:** Poll DynamoDB to check status of Gemini batch jobs.
  - **Frequency:** Every 5-15 minutes.
- **Feed Cleanup (`schmitt-aws-lab-audio-summary-truncate`):**
  - **Goal:** Truncate S3 JSON feeds to a maximum of 25 items.
  - **Frequency:** Once per day.

## Type Checking

Run the following command in the terminal to type-check all project files:

```bash
npx tsc --noEmit --esModuleInterop --target es2022 --moduleResolution Node16 --module Node16 --skipLibCheck *.ts
```

## Deploy

```
GEMINI_API_KEY=$SNIP node master-deploy.js
```
