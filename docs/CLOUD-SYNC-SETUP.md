# Glass Chess cloud sync setup

The browser integration is already implemented in `src/clerk-auth.js`. It uses Clerk for accounts and a Supabase Postgres row per Clerk user for private saves. Guests continue using local IndexedDB storage.

## Supabase project already provisioned

Project: `Glass Chess`  
Project ref: `nczvhetpezztjvcipydl`  
URL: `https://nczvhetpezztjvcipydl.supabase.co`

The `public.glass_chess_saves` table already exists with:
- `user_id text` primary key
- `payload jsonb`
- `updated_at timestamptz`

Row Level Security is enabled. The current authenticated policy only allows a row when `user_id = auth.jwt() ->> 'sub'`. A transaction-level policy smoke test confirmed that a second authenticated subject cannot read the first subject's row. The test transaction was rolled back.

## Required Clerk ↔ Supabase trust

The Supabase project must trust Clerk as a Third-Party Auth provider. Complete the supported Clerk integration (do not use the deprecated Clerk JWT-template method):

1. In Clerk Dashboard, open **Connect with Supabase** and select the Glass Chess Clerk application.
2. In Supabase Dashboard, open **Authentication → Third-Party Auth** and add Clerk using the Clerk issuer/domain shown by Clerk's integration setup.
3. Ensure Clerk session tokens contain the `role: authenticated` claim. The Supabase Clerk integration instructions should configure this as part of the setup.
4. Keep the table's RLS policy enabled. Do not disable RLS to make syncing work.

Official instructions: https://supabase.com/docs/guides/auth/third-party/clerk

## Frontend environment variables

Set these on the **Glass-Chess-PRO static site** in Render's Environment settings. They are public build-time settings, so the site must be rebuilt after changing them.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://nczvhetpezztjvcipydl.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key from Project Settings → API Keys |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key from the Glass Chess Clerk application |

Never put a Supabase secret/service-role key or a Clerk secret key in a `VITE_*` variable or browser code.

## King Pawn backend AI

King Pawn's server-side AI request uses `OPENAI_API_KEY`. This is a private secret and belongs only on the **Glass Chess backend Web Service** in Render → Environment. It must not be a `VITE_*` variable. The optional `KING_PAWN_MODEL` defaults to `gpt-6.2-sol`.

A missing key causes the backend to return HTTP 503. That is a server configuration problem, not a problem with the player's internet connection. Invalid credentials, provider rate limits, and model errors should be fixed in the backend environment/billing settings.

## End-to-end acceptance test

After the Clerk integration and Render variables are configured and deployed:

1. Open Glass Chess and create/sign in to a Clerk account.
2. Verify the account email. Cloud sync is intentionally disabled until email verification.
3. Confirm the account badge changes to **Synced to Cloud**.
4. Play a short game and wait for the cloud sync status to return to **Synced to Cloud**.
5. Open Glass Chess in a second browser/device, sign in to the same account, and confirm the saved game appears in Cloud Game Vault and can be loaded.
6. Sign into a different account and confirm the first account's save is not visible.

The database table and RLS policy are provisioned, but an authenticated browser-to-Supabase round trip has not yet been completed. Do not treat sync as live until the acceptance test above passes.
