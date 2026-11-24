# DICON GITH Cost Note

What costs money and what does not

Provider plans and limits change. The figures below are the usual free-plan limits; check each provider's pricing page before launch and again every few months.

## Free to start (with limits)

| Service | Used for | Free plan | What can make it cost |
|---|---|---|---|
| Netlify | Hosts the website and the small server functions | Free plan, with monthly usage limits | Heavy traffic or many function calls beyond the free usage; extra team members |
| Supabase | Stores uploaded photos and documents | About 1 GB of file storage on the free plan | More than the free storage or transfer. Free projects pause after about a week with no activity, so open the dashboard now and then |
| Brevo | Sends status and announcement emails | Free plan with a daily email limit (about 300 a day) | Sending more than the daily limit, or removing the Brevo footer |
| Firebase (Spark plan) | Sign-in, the database (Firestore), App Check | Free, with daily read/write limits | Going over daily limits; phone-number sign-in sends SMS and may cost |
| Firebase App Check | Blocks scripted abuse of the Firebase project | Free | Nothing at normal volumes (the reCAPTCHA v3 key is free) |
| Google sign-in | "Continue with Google" button | Free | Nothing |

## Costs money

| Item | Why | Roughly |
|---|---|---|
| Custom domain (for example dicon-gith.ng) | The Netlify address ends in netlify.app. A proper domain is bought yearly from a registrar. | Yearly fee set by the registrar. A .gov.ng address is arranged through the government registrar, not bought online. |
| Firebase Blaze plan | Needed for Firestore scheduled backups. You pay only for what you use, and a budget alert can be set. | Pay as you go. Small for a site this size, but set a budget alert. |
| Official sender email domain | Emails look more trusted when they come from DICON's own domain (needs the domain above). | Included with the domain or a mailbox plan |

## Backups

Point-in-time recovery and scheduled backups of the database need the **Blaze** plan. Without Blaze, use the CSV exports in Evaluation Workspace, Results & shortlist (ranking and all applications). Uploaded files in Supabase can be backed up from the Supabase dashboard.

## Before launch

- Create the free accounts using DICON's own email addresses, not personal ones.
- Set a budget alert in Google Cloud once Blaze is on.
- Register the domain under DICON so it renews even if staff change, and review usage on each service monthly.
