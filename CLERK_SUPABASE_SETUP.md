# Glass Chess: Clerk + Supabase setup

Firebase is no longer used for Glass Chess sign-in or cloud saves.

- **Clerk** handles accounts, email/password sign-in, password reset, and email verification.
- **Supabase** stores each player's private saved profile, games, and King Pawn chat archive.
- **IndexedDB** continues to save guest games locally when a player is not signed in or cloud services are not configured.

## 1. Configure Clerk

1. Open the Glass Chess application in the Clerk Dashboard.
2. Under **User & authentication**, enable email sign-up and sign-in, require an email address, and enable password sign-up.
3. Keep email verification enabled. Clerk's sign-in component handles the verification flow.
4. Disable Google/social sign-in and passkeys if you do not want those methods shown.
5. Add `glass-chess-pro.onrender.com` as the production application domain in Clerk's domain/instance settings.
6. Open **API keys** and copy the **Publishable key**. It begins with `pk_`.

Do not copy a Clerk secret key into the website.

## 2. Create the Supabase database

1. Create a Supabase project.
2. In the Clerk Dashboard, open the **Supabase integration** and activate it for the Glass Chess Clerk instance. Copy the Clerk domain shown in that setup.
3. In Supabase, open **Authentication → Sign In / Providers → Third-party Auth**, add **Clerk**, and paste the Clerk domain.
4. In Supabase **SQL Editor**, run the SQL below. It creates one JSONB save row per Clerk user and uses row-level security so a user can access only the row whose ID matches their authenticated Clerk user ID.

```sql
-- Glass Chess private cloud save table.
-- Run this in Supabase Dashboard > SQL Editor after adding Clerk as a third-party auth provider.

create table if not exists public.glass_chess_saves (
  user_id text primary key not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.glass_chess_saves enable row level security;

drop policy if exists "Players manage only their own Glass Chess saves" on public.glass_chess_saves;

create policy "Players manage only their own Glass Chess saves"
on public.glass_chess_saves
for all
to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

grant select, insert, update, delete on public.glass_chess_saves to authenticated;
```

5. In Supabase **Project Settings → Data API**, copy the project URL.
6. In Supabase **Project Settings → API Keys**, copy the **Publishable key** (formerly called the anon/public key).

Never put a Supabase `service_role` key in Glass Chess or in any `VITE_*` variable.

## 3. Add the production environment values

In Render, open **Glass-Chess-PRO → Environment** and add these three values:

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

Save the changes and trigger a new deploy. For local development, put the same values in an uncommitted `.env.local` file at the project root.

## 4. Test the account and save flow

1. Open the deployed Glass Chess website and create an account with email and password.
2. Complete the email verification step handled by Clerk.
3. Play a game, then open the account menu and choose **Force Sync Now**.
4. Open **Cloud Game Vault** and confirm the saved game appears.
5. Sign in on another browser/device using the same account and confirm the save is available there.

The first successful cloud sign-in merges the current device's local saves with the cloud copy. Local guest saves stay available if Clerk or Supabase is temporarily unavailable.

## Notes

- Existing Firebase users or Firestore data are not automatically migrated. This new flow does not call Firebase.
- Cloud syncing stays unavailable until both Clerk and Supabase are configured. Guest play and local saves continue to work.
- The website uses only Clerk's publishable key and Supabase's publishable key. Database access is restricted by the SQL row-level security policy.
- Clerk's built-in email password reset is available. A separate Glass Chess recovery-code feature is not implemented by this integration.
