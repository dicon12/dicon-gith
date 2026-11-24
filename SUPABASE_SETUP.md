# Free file storage with Supabase (replaces Firebase Storage / Blaze plan)

Photos and documents now go to **Supabase Storage** (free tier: 1 GB storage). Only the short link is saved in Firestore.

## 1. Create the Supabase project (use a DICON email)
1. supabase.com -> New project (free plan).
2. Storage -> **New bucket** -> name: `gith-uploads` -> leave **Public bucket OFF** (private) -> Create. This holds innovation photos and documents.
   Create a second bucket named `gith-public` with **Public bucket ON**. This holds profile photos only.
3. **Set limits on both buckets (required).** The upload function only checks the type and size the browser *says* it will send; the signed upload link it hands out does not enforce them, so the bucket must. In Storage -> the bucket -> **Edit bucket**:
   | Bucket | Restrict file upload size | Allowed MIME types |
   |---|---|---|
   | `gith-uploads` | 50 MB | `image/jpeg, image/png, image/webp, image/gif, video/mp4, video/webm, video/quicktime, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
   | `gith-public` | 5 MB | `image/jpeg, image/png, image/webp, image/gif` |
   Without these, any signed-in account can upload any file of any size (for example an HTML page into the public bucket).
4. Project Settings -> API: copy the **Project URL** and the **Secret key** (`sb_secret_...`; the older `service_role` key also works). Never put it in the code.

## 2. Add these in your host (Netlify: Site configuration -> Environment variables; Vercel: Project -> Settings -> Environment Variables)
| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL, e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the secret key `sb_secret_...` (mark as secret) |
| `SUPABASE_BUCKET` | `gith-uploads` (private bucket, optional, this is the default) |
| `SUPABASE_PUBLIC_BUCKET` | `gith-public` (public bucket for profile photos, optional, this is the default) |
| `BREVO_API_KEY` | already set for email |
| `SENDER_EMAIL` | already set for email |

Then **Deploys -> Trigger deploy -> Clear cache and deploy site**.

## 3. Deploy the new Firestore rules
Firebase console -> Firestore -> Rules -> paste `firestore.rules` -> Publish.
(Firebase CLI: `firebase deploy --only firestore:rules`.) Firebase Functions and Firebase Storage are no longer used, so the Blaze plan is not needed for them.

## Notes
- **Private files:** innovation photos and documents sit in a private bucket. The app asks the `file-url` function for a link that expires after about an hour, and only the owner and admins get one, plus evaluators and mentors for innovations an admin assigned to them (checked against Firestore rules). A saved link on its own no longer opens the file.
- Files uploaded before this change that are in `gith-uploads` keep working inside the app once the bucket is private (old profile photos in that bucket will stop showing; ask those users to re-upload, or move the files to `gith-public`).
- Limits checked by the upload function: profile photo 5 MB, innovation photo 10 MB (JPG/PNG/WebP), video 50 MB, document 15 MB (PDF/DOC/DOCX). These are a first check only; the bucket settings in step 1.3 are what actually enforce them.
- Supabase free projects pause after about 1 week with no activity. Open the project dashboard occasionally, or upgrade, if the site will be quiet.

## Role assignment (no Cloud Function)
Admin -> Evaluation Workspace -> "Give a role". Only a `super_admin` can change roles; this is enforced by `firestore.rules`. The person must sign in again after a change. Nobody can change their own role.

## Landing-page counter
"Innovations Submitted" updates whenever an admin opens the admin dashboard.
