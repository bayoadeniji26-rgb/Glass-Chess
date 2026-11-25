# Firebase setup for Glass Chess

Google sign-in is optional. Guests can continue playing without an account; local IndexedDB saving and JSON export/import remain available without Firebase.

## 1. Create and configure a Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Add a **Web app** and copy its Firebase web configuration.
3. Under **Authentication → Sign-in method**, enable **Google**.
4. Under **Authentication → Settings → Authorized domains**, add the exact production hostname:
   `glass-chess-pro.onrender.com`
   Also add `localhost` for local Vite testing. Add any custom domain you use.
5. Create a **Cloud Firestore** database.
6. Create a **Cloud Storage** bucket and enable it for the project.

## 2. Configure the Vite environment

Copy `.env.example` to `.env.local` for local development and fill in the values from Firebase Console → Project settings → Your apps → Web app.

For Render, open the **Glass-Chess-PRO** Static Site → Environment and add these build-time variables (the Firebase values must come from your own Firebase project):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_APP_ID`

The `authDomain` value must be the Firebase-provided auth domain shown in your Web app config (usually `YOUR-PROJECT-ID.firebaseapp.com`). **Do not put `glass-chess-pro.onrender.com` in the `authDomain` field.** The Render hostname is added separately to Firebase Authentication's Authorized domains.

Redeploy after saving the variables. Vite embeds `VITE_*` values into browser code, so use only Firebase's normal web-app config here. **Never put a Firebase Admin SDK private key, service-account JSON, or other server secret in these variables.**

## 3. Deploy the security rules

In Firebase Console → Firestore Database → Rules, publish the contents of `firestore.rules`.

In Firebase Console → Storage → Rules, publish the contents of `storage.rules`.

These rules restrict each user's profile, saved games, and uploaded images to that authenticated user. The `global_matches` mirror is also owner-readable only; it is a mirror collection, not a public game feed.

For command-line deployment from the repository root:

```bash
npm install --global firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

Choose the same Firebase project used for the web configuration when `firebase use --add` prompts you. You can also paste the two rule files into the Firebase Console instead.

## 4. Verify sign-in and cloud sync

1. Open the production site and click **Sign in with Google** in the top-left.
2. Complete Google consent. The profile pill should show **Syncing...** followed by **Synced to Cloud**.
3. Play a move, change a setting, upload an avatar/background, or chat with King Pawn.
4. Sign into the same Google account on another browser/device. The profile, saved games, pictures, theme settings, and saved King Pawn chat should restore from Firestore/Storage.
5. Use the profile menu → **Force Sync Now** to request an immediate sync, or **Cloud Game Vault** to load an archived PGN into Analysis Studio.

If sign-in succeeds but sync fails, inspect the browser console and check that the Firestore and Storage rules above were published and that the Firebase project has billing/Storage access configured as required by your project.

## 5. Donation messages by email + Cash App

The Donate button opens an in-app form. A visitor can add their name, reply email, suggested amount, and message. **Sending the message does not charge them**; they use the separate Cash App link to make a voluntary payment to `$RaphaelAboy`.

To email submitted messages to your inbox:

1. Create an account at [EmailJS](https://www.emailjs.com/) and connect an email service (for example, your own Gmail account).
2. Create an EmailJS email template. Set the template's **To Email** field directly to the inbox where you want to receive donation notes. Do not make this a user-editable field.
3. Put these variables in the template body: `{{from_name}}`, `{{reply_to}}`, `{{donation_amount}}`, `{{message}}`, `{{cashapp_tag}}`, `{{submitted_at}}`, and `{{source_url}}`.
4. In EmailJS Account, copy your **Public Key**. From Email Services, copy the **Service ID**. From Email Templates, copy the **Template ID**.
5. Add these build-time variables in Render → Glass-Chess-PRO → Environment:
   - `VITE_EMAILJS_SERVICE_ID`
   - `VITE_EMAILJS_TEMPLATE_ID`
   - `VITE_EMAILJS_PUBLIC_KEY`
6. In EmailJS security settings, restrict allowed origins to your live Glass Chess domain (and localhost only when testing). Redeploy the Render Static Site.

The browser sends the message to EmailJS's documented `/api/v1.0/email/send` endpoint using the public key. Keep your EmailJS private key and any SMTP password out of Vite variables and out of GitHub. See the [EmailJS send API](https://www.emailjs.com/docs/rest-api/send/) and [SDK send reference](https://www.emailjs.com/docs/sdk/send/).

The app can display the donation form before EmailJS is configured, but it cannot deliver messages to your inbox until these three values are added and the template's recipient is set.
