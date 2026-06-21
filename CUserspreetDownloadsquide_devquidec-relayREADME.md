# Quidec FCM Relay Server

Minimal notification relay. Zero storage, pure passthrough.

## API

### GET /
Health check. Used by cron job to keep Render warm.

### POST /notify
Body: { to: "recipientUid", fromName: "Preet", type: "text" | "image" | "video" | "audio" }
Response: { sent: true } or { sent: false, reason: "no_fcm_token" }

## Deploy to Render
1. Push to GitHub
2. Create Web Service, connect repo
3. Runtime: Node, Build: npm install, Start: node server.js, Plan: Free
4. Add secret file: serviceAccountKey.json (from Firebase Console > Service Accounts)
5. Deploy

## Keep Warm
Render free tier spins down after 15 min. Set up cron job (cron-job.org) to ping GET / every 10 min.

## Memory
Self-monitors RSS. Exits at 300 MB, Render auto-restarts.
