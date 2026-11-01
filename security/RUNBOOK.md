# Closing the open database and API - staged runbook

What exists now (server sign-in is ON by default; production refuses to start without APP_SESSION_SECRET, an owner login and the Supabase settings):
- Server sign-in with signed 12-hour session tokens (`server-auth.ts`), PIN checked ON THE SERVER with a lock after 5 wrong tries.
- Every /api route needs a valid token (health and the sign-in routes stay public). `API_AUTH_REQUIRED=false` exists for a developer machine only and is refused in production.
- Salesman logins follow an allow-list (bills, payments, trip returns, own records); everything else is owner-only, and reads are filtered to the salesman's own records.
- Salesman PINs are stored as scrypt hashes with a random salt per salesman; old hashes upgrade at the next sign-in. Set a PIN again for anyone who has not signed in since.
- Salesmen can never change salesmen or settings; they never receive PIN hashes; the old "send a hash" PIN route is switched off.
- The app attaches the session automatically to every /api call and signs the user out if the server ends the session.
- `lock-down-rls.sql` removes the "anyone" database policies (needs staging first).

## Step 1 - server settings (Render / your host)
```
APP_SESSION_SECRET=<32+ random characters>      # e.g. run: openssl rand -hex 32
ADMIN_PASSWORD=<a strong password only you know>  # lets you sign in as admin through the server
SUPABASE_SERVICE_ROLE_KEY=<from Supabase > Project settings > API>   # server only, never in the app
# do NOT set API_AUTH_REQUIRED yet
```
Deploy. Check `https://<your-app>/api/auth/status` shows `sessionsEnabled: true, adminLoginEnabled: true`.

## Step 2 - test sign-in with enforcement still OFF
Sign in as admin (user `admin`, your ADMIN_PASSWORD) and as a salesman. Both should work; salesmen now sign in through the server.

## Step 3 - switch enforcement on
Set `API_AUTH_REQUIRED=true` and redeploy. Check: opening `/api/bills` in a browser without signing in shows "Sign in required".
Test the whole day: billing, payments, GRN, trips, salesman phone. If anything fails, remove `API_AUTH_REQUIRED` to go back at once.

## Step 4 - the database itself (do this on a STAGING copy first)
The app still talks to the database directly from the browser with the public key (`src/lib/supabase.ts`). Step 3 does not stop that.
`security/lock-down-rls.sql` does. After it: signed-in admins (Supabase Auth) keep working; the server keeps working (service key);
a salesman's phone can no longer talk to the database directly, so every salesman screen must be checked, and anything that
fails needs to be moved behind a server route. Only run it on production when the full salesman day works on staging.
Undo: `security/undo-lock-down-rls.sql`.

## Also
- Rotate the Gemini key that was in `.env.example`, and consider rotating the Supabase keys (they were in the shared files).
- Remove `VITE_LOCAL_ADMIN_PASSWORD` from production builds once the server sign-in works (anything `VITE_` is readable inside the app).
- Salesman PINs are 4-6 digits: the server now limits guessing, but use 6 digits for new salesmen.
