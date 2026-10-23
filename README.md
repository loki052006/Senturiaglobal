# Senturiaglobal

Node.js + Express, SQLite, Google Sign-In (verified on the server).

## Google Sign-In setup
1. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
2. Configure the OAuth consent screen and add your account as a test user if the app is still in testing.
3. Add `http://localhost:3000` under Authorized JavaScript origins (and your real HTTPS domain after deployment). No redirect URI is needed.
4. Put the client ID in `.env` as `GOOGLE_CLIENT_ID=...`.

Without a valid client ID, the rest of the site remains usable and the sign-in dialog explains how to configure Google. The server will not accept sign-in without a valid client ID.

## Run
```
npm install
copy .env.example .env   # Windows PowerShell; use cp .env.example .env on macOS/Linux
npm start
```
Set `SESSION_SECRET` to a long random value in `.env` before running, and set `GOOGLE_CLIENT_ID` if Google Sign-In is needed. Use Node.js 20 LTS (20.18+); newer Node versions may require Visual Studio C++ build tools for `better-sqlite3`.
Open http://localhost:3000. Users and intake requests are stored in `senturia.db`.
For production: serve over HTTPS with NODE_ENV=production.

## Deploy to Render
Connect the project repository to Render and use the included `render.yaml` blueprint. Set `GOOGLE_CLIENT_ID` in the Render environment, then add the deployed HTTPS URL to the OAuth client's Authorized JavaScript origins. Render's free web service has an ephemeral filesystem: SQLite requests can be lost on restart or redeploy. Use a paid persistent disk or a managed database before relying on production submissions.
