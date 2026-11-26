# Firebase setup retired

Glass Chess no longer uses Firebase for sign-in or cloud saves.

Use the current **[Clerk + Supabase setup guide](CLERK_SUPABASE_SETUP.md)** instead. The website keeps guest games locally through IndexedDB while account sign-in and private cross-device saves are configured.

The old `firestore.rules`, `storage.rules`, and Firebase project are not required by the current account code.
