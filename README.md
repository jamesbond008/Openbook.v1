<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/14eb184d-8683-44d8-975e-580f02826297

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the following values in `.env.local`:
   - `GEMINI_API_KEY`
   - `BOOKMIND_STORAGE_MODE` (`ima` / `local` / `notion`)
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `IMA_OPENAPI_CLIENTID`
   - `IMA_OPENAPI_APIKEY`
   - `IMA_KNOWLEDGE_BASE_ID`
   - `IMA_KNOWLEDGE_BASE_NAME`
3. Run the full app with Notion sync:
   `npm run dev:full`

If you only need the frontend, you can still run:
`npm run dev`
