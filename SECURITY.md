# Security checklist (DICON GITH)

## Done in code
- There are no built-in admin or demo accounts. Admins are created in Firebase. Browser-only (local) mode exists for localhost and tests only (`LOCAL_MODE_ENABLED`); on a real domain, sign-in, registration, password reset and saves fail with a clear message if Firebase cannot be reached.
- Admin screen verifies the role from Firestore (`authService.verifyRole()`), not from localStorage.
- `auditLogs`: clients can no longer forge entries; only admins (as themselves) or Cloud Functions write.
- Firebase Web SDK is now loaded on the auth, dashboard and admin pages (previously never loaded, so the app ran in browser-only mode).
- Security headers set in `vercel.json` and `server.js`.

## You must do (cannot be done from code)
1. **Restrict the Firebase Web API key** — Google Cloud Console → APIs & Services → Credentials →
   the browser key → *Application restrictions: Websites* → add your production domain(s) and
   `localhost`; *API restrictions*: Identity Toolkit, Firebase Installations, Cloud Firestore, Cloud Storage.
2. **Create the first admin**: register normally, then in Firestore set `users/{uid}.role = "super_admin"`
   (console), or run `setUserRole` from a trusted script. Later roles go through the `setUserRole` function.
3. **Authentication → Settings → Authorized domains**: add your production domain.
4. **Deploy the Firestore rules** (Firebase Storage and Cloud Functions are no longer used): `firebase deploy --only firestore:rules`.
5. **Enable App Check** (reCAPTCHA v3) for Firestore/Storage/Auth to block scripted abuse.
6. **Emails**: set `BREVO_API_KEY` and `SENDER_EMAIL` in the host (Netlify or Vercel) (see BACKUP_AND_ALERTS.md).
7. **Rotate** any Firebase service-account keys if they were ever committed.

## Roles and uploads (update)
- `users.role` can be changed only by a `super_admin` (never on your own account); enforced in `firestore.rules`.
- Uploads go through the `upload-url` function (`api/_lib/upload-url.js`, run by Netlify or Vercel), which verifies the Firebase sign-in, checks type and size, and issues a one-time Supabase upload link. The Supabase service key lives only in the host's environment variables.
