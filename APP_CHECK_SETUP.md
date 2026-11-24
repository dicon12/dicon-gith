# App Check (free) - blocks scripted abuse of the Firebase project

The code is already in place. It switches on when you paste a site key.

1. Google reCAPTCHA admin (google.com/recaptcha/admin) -> create a **reCAPTCHA v3** key for your Netlify domain (add the custom domain later).
2. Firebase console -> **App Check** -> your web app -> choose **reCAPTCHA v3** -> paste the **secret key**.
3. Open `js/firebase-config.js` and paste the **site key** into `APP_CHECK_SITE_KEY`. Redeploy.
4. Use the site for a day. In App Check, look at the request numbers for Firestore and Authentication. When almost all requests are marked verified, click **Enforce** for each service.

Leave `APP_CHECK_SITE_KEY` empty to keep App Check off. Do not enforce before step 4, or real users can be locked out.
