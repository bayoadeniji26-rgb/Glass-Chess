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

For Render, open the **Glass-Chess-PRO** Static Site → Environment and add these build-time variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_APP_ID`

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

## 5. Cash App donations

The Donate action opens `https://cash.app/$RaphaelAboy` in a new tab. Donations are voluntary; the site does not collect payment-card or bank information.
