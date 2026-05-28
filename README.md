<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/147cec1e-e1fb-4778-afef-90cedf6b345d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the provider key in [.env.local](.env.local), or configure it in the app settings.
   - Gemini: `GEMINI_API_KEY`
   - Volcengine Ark: `VOLCENGINE_API_KEY`, `VOLCENGINE_MODEL_NAME`, and optionally `VOLCENGINE_API_BASE`
3. Run the app:
   `npm run dev`

## Vercel environment variables

For Volcengine Ark / Doubao on Vercel, add these Project Environment Variables and redeploy:

- `VOLCENGINE_API_KEY`
- `VOLCENGINE_MODEL_NAME` (Model ID or endpoint ID, for example `ep-...`)
- `VOLCENGINE_API_BASE` (optional, defaults to `https://ark.cn-beijing.volces.com/api/v3`)
