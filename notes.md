# Notes

https://feed.podbean.com/thetelecomscompodcast/feed.xml


## Lambda Scheduling (EventBridge)

*   **Job Sync (`schmitt-aws-lab-audio-summary-sync`):**
    *   **Goal:** Poll DynamoDB to check status of Gemini batch jobs.
    *   **Frequency:** Every 5-15 minutes.
*   **Feed Cleanup (`schmitt-aws-lab-audio-summary-truncate`):**
    *   **Goal:** Truncate S3 JSON feeds to a maximum of 25 items.
    *   **Frequency:** Once per day.
