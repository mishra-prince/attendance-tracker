# Supabase database and Render API

24 October 2026. Main app version 1.3.1.

## What is configured

Supabase project `attendance-tracker` (`osdousdloxpcxdpszqtc`, Mumbai) is the existing database, not an empty project. Its existing 9 accounts, 78 attendance rows and 21 class sessions were retained during the additive update. All application columns and enums were compared with a clean database built from the repository migrations. Existing deferrable foreign keys were retained.

The previously manually installed Bluetooth/biometric schema lacked `RefreshSession`; it was repaired using `server/deploy/supabase-refresh-session-repair.sql`. The normal RFID migration was applied and verified. The two missing Prisma history entries were reconciled only after the schema comparison; the source and checksums are in `supabase-baseline-verified.sql`. **These repair files are a record for this project, not a generic fresh-database install script. Do not rerun the initial migration or demo seed on this database.**

All 31 app/history tables now have RLS enabled and grants to `anon`, `authenticated` and `PUBLIC` revoked. No browser policies were added because Threshold uses its own User/JWT/Prisma server. The PostgreSQL table-owner connection remains usable. Supabase's advisor reports informational “RLS enabled, no policy” notices, which are intentional for this server-only access model. Do not connect the APK directly to the Supabase Data API or put database/service-role credentials in it. [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Create the API on the free Render plan

The repository's `render.yaml` defines **one free Node web service**, using the existing Supabase database. It does not create a Render database. No paid resource is requested. Free services sleep after 15 idle minutes and can take about one minute to wake. This can exceed the reader's delivery window; wake `/ready` before the class and check it responds. This free setup is a prototype, not an always-available production attendance service. [Render free-plan limits](https://render.com/docs/free).

1. Sign into Render. Create a Blueprint from `https://github.com/mishra-prince/attendance-tracker`, branch `master`, using `render.yaml`. If using a public repository URL avoids an unnecessary GitHub authorization grant, use it.
2. Confirm service `threshold-api`, **Free**, Node, Singapore, root `server`. Build: `npm ci --include=dev && npx prisma generate && npm run build`. Start: `npx prisma migrate deploy && npm start`. Health check: `/ready`.
3. Enter `DATABASE_URL` privately in Render. In Supabase's **Connect** dialog, choose **Session pooler**, PostgreSQL/Prisma, port **5432**, schema `public`. Use the supplied host/username and your database password, URL-encoded. Append `sslmode=require&sslaccept=strict&connection_limit=3&pool_timeout=15` to its query parameters. Keep the complete connection string out of chat, GitHub, screenshots and the app. [Supabase Prisma connection guide](https://supabase.com/docs/guides/database/prisma).
4. The Blueprint generates four distinct secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `BLE_BEACON_SECRET`, `RFID_CARD_HASH_SECRET`. Save them privately. Keep the card hash secret stable across redeploys or card registration cannot be matched. Keep existing JWT/BLE secrets if migrating a previously running server and continuity is required; a new JWT secret requires signing in again.
5. Keep `NODE_ENV=production`, `ATTENDANCE_TIMEZONE=Asia/Kolkata`, `TRUST_PROXY_HOPS=1`, `ALLOW_DEMO_SEED=false`. APK origins are already listed. Add exact web origins only if serving a browser frontend.
6. Deploy. `/ready` must return `{"success":true,"data":{"status":"ready"}}`; unlike `/health`, this checks the RFID database table is reachable. Existing institution login and reader provisioning must also be tested. No deployment success is assumed from source publication alone.
7. The owner chose the assigned HTTPS API origin **https://threshold-api-j5wk.onrender.com** directly. Threshold 1.3.1 and the RFID provisioning tool use it, so no custom DNS is required. The older 1.3.0 APK still targets the unresolved custom domain. Do not substitute the Supabase project URL for the Express API. For reproducible APK builds, copy client/.env.production.example to client/.env.production before android:sync.

Automatic deployments are off in this Blueprint so unreviewed pushes do not immediately change the running attendance API. Trigger a deploy after reviewing/tested updates. Never run `prisma migrate reset`, `db push --force-reset` or the seed script against this database.

## Private connection formatter on the prepared Mac

If formatting DATABASE_URL is difficult, serve `server/deploy/connection-helper.html` locally from the repository:

```sh
python3 -m http.server 8769 --bind 127.0.0.1 --directory server/deploy
```

Open `http://127.0.0.1:8769/connection-helper.html` on that same Mac. Enter the existing Supabase database password and click **Copy complete database connection**. Paste over the entire DATABASE_URL value in Render's Environment editor, then choose Save, rebuild, and deploy. The helper encodes special characters, uses the verified session-pooler host/username, blocks network requests via CSP and does not save the password. Close it when done. It is a formatter, not a database-password reset tool. Never paste only the username or an `DATABASE_URL=` assignment into the Render value field.

## New/fresh installations

Use `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, four distinct secrets from `server/.env.example`, and the usual private first-admin provisioning process. Do not copy this project's schema-history repair SQL or demo accounts into a different database. Use institution-issued credentials; no universal APK ID/password is provided.

After each future Supabase schema change, apply `server/deploy/supabase-hardening.sql` for listed app tables and inspect grants/RLS/advisors. New tables must receive the same explicit server-only review. If introducing direct Supabase Auth/Data API access later, design role- and ownership-based policies first; the app's JWT is not a Supabase Auth token.

## Verified live deployment

The free service `threshold-api` (`srv-dbdrqrrncjis73d9n3pg`) successfully deployed commit `e9108c9` on 24 October 2026 at 01:45:51 IST. Render connected through the IPv4 Session pooler and confirmed all three Prisma migrations were applied, with none pending. The server started on Render's assigned port.

External HTTPS checks passed: `/ready` returned HTTP 200 with `status: ready`; unauthenticated reader-management and device-tap requests returned HTTP 401; a nonexistent account login returned HTTP 401 rather than a database error. The APK origin `https://localhost` received the expected credential-enabled CORS preflight response. These checks did not create accounts or attendance. Actual institution login and physical reader/phone tests remain pending.

For future connection failures: Prisma P1001 with the direct IPv6 host requires the IPv4 Session-pooler host `aws-0-ap-south-1.pooler.supabase.com`, port 5432, username `postgres.osdousdloxpcxdpszqtc`. P1012 about the protocol means Render needs the complete `postgresql://...` connection string, not only the username or a `DATABASE_URL=` assignment. The local formatter above handles this without posting passwords in chat or GitHub.
