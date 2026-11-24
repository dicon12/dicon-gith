# Backups and email alerts (do these in the Google/Firebase consoles)

## Backups (Firestore + Storage)
1. Firebase console -> Firestore -> Disaster recovery: turn on **Point-in-time recovery** (restore to any minute in the last 7 days).
2. Same page -> **Scheduled backups**: add a **daily** schedule, keep for 14 days (and a weekly one, keep 8 weeks).
3. Storage: Google Cloud console -> Cloud Storage -> your bucket -> Protection -> enable **Soft delete** / Object versioning.
4. Test a restore once into a new database before relying on it.
5. Admin -> Evaluation Workspace -> Results has CSV exports for a simple offline copy of applications and rankings.

## Email alerts (Brevo + Netlify Function)
Status-change and announcement emails are sent by `netlify/functions/send-email.js` through Brevo (free tier).
1. Create a free account at brevo.com and verify a sender email (Senders, Domains & Dedicated IPs -> Senders).
2. Brevo -> SMTP & API -> API keys -> create a key.
3. Netlify -> Site configuration -> Environment variables: add `BREVO_API_KEY` and `SENDER_EMAIL` (the verified sender). Optional: `SENDER_NAME`.
4. Redeploy the site. Until the variables exist the function answers "Email is not configured" and nothing is sent.
Firebase Cloud Functions are no longer needed for email.
