# Jarvis Web

Browser version of the Jarvis assistant. Works on phone and desktop.

## Deploy on Vercel
1. Push this folder to GitHub (or set **Root Directory** to `jarvis-web` if it lives inside a bigger repo).
2. Import the repo in Vercel. Framework preset: **Other**. No build command.
3. Add environment variables (Settings > Environment Variables), then redeploy:
   - `GEMINI_API_KEY` (from https://aistudio.google.com)
   - `ACCESS_CODE` (recommended: stops strangers using your API quota)

CLI alternative: `npx vercel` then `npx vercel --prod`.

## What changed from the desktop version
- Mic and voice: browser Speech Recognition and Speech Synthesis (Chrome, Edge, Safari; not Firefox).
- AI answers: `/api/chat` calls Gemini, so the key stays on the server.
- Settings, contacts, commands: saved in the browser (localStorage), per device.
- Face login, hotword, ADB/phone control and opening local apps are desktop-only and were removed. Calls and SMS open the phone dialer/SMS app; WhatsApp opens via wa.me.
- "System commands" now hold app links (e.g. `spotify:`) instead of file paths.
