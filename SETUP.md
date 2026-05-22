# SMS Reminders — Setup Guide (Windows 11)

**Stack:** Supabase (Postgres + Edge Functions + pg_cron) · SMS Provider (ClickSend or Twilio) · Whisper/OpenAI (voice-to-text) · Node.js (local tooling) · Docker · GitHub Actions

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  LOCAL DEV (your Windows 11 machine)                        │
│                                                             │
│  VS Code                                                    │
│  Node.js scripts (seed, test)                               │
│  supabase CLI → Docker → local Postgres + Edge runtime      │
└──────────────────┬──────────────────────────────────────────┘
                   │  git push
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  GITHUB                                                     │
│                                                             │
│  develop  →  staging  →  main                               │
│                 │              │                            │
│           CI (lint,       CI + deploy                       │
│            typecheck)     to Supabase                       │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE CLOUD (no Vercel needed)                          │
│                                                             │
│  Postgres ──► pg_cron (every minute)                        │
│                   │                                         │
│                   ▼                                         │
│  Edge Function: send-reminders                              │
│      │  queries pending reminders                           │
│      │  calls SMS provider (ClickSend or Twilio)            │
│      │  marks reminder sent/failed                          │
│      └─► delivery_log                                       │
│                                                             │
│  Edge Function: create-reminder                             │
│      │  accepts JSON  →  inserts reminder                   │
│      └─► (optional) audio → Whisper → transcribe → insert  │
│                                                             │
│  Edge Function: transcribe                                  │
│      └─► audio file → OpenAI Whisper → text                 │
│                                                             │
│  Storage bucket: voice-uploads                              │
└─────────────────────────────────────────────────────────────┘
```

### Data flow: voice reminder

```text
User records audio
      │
      ▼
POST /functions/v1/create-reminder  (multipart, includes audio file)
      │
      ├─► Supabase Storage (saves original audio)
      │
      ├─► OpenAI Whisper API (transcribes speech → text)
      │
      └─► reminders table  { phone, message, send_at, status: 'pending' }
                                          │
                              pg_cron fires every minute
                                          │
                              send-reminders Edge Function
                                          │
                              SMS Provider REST API → SMS delivered
                              (ClickSend or Twilio)
```

### Branch strategy

| Branch    | Purpose             | CI/CD action                              |
| --------- | ------------------- | ----------------------------------------- |
| `develop` | Day-to-day work     | Lint + typecheck on every push            |
| `staging` | Pre-release testing | Lint + typecheck + migrate + deploy funcs |
| `main`    | Production          | Same as staging, against prod project     |

### Branch Protection Rules

After pushing branches, go to repo → Settings → Branches

#### For branch `staging`

1. Click "Add rule" → Pattern: staging
2. ✅ Require a pull request before merging (1 approval if that makes sense with the number of people on the team = 1)
3. ✅ Dismiss stale pull request approvals
4. ✅ Require status checks to pass
5. ✅ Require branches to be up to date
6. ✅ Enforce all the above for administrators

#### For branch `main`

1. Click "Add rule" → Pattern: main
2. ✅ Require a pull request before merging (2 approvals)
3. ✅ Require status checks to pass
4. ✅ Require branches to be up to date
5. ✅ Enforce all the above for administrators

---

## Step 1 — Install tools

Open **PowerShell as Administrator** (search → right-click → Run as Administrator).

### Allow scripts (one-time)

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Install core tools via winget

```powershell
# Git
winget install --id Git.Git --source winget --accept-package-agreements

# Node.js 20 LTS
winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements

# Deno (Supabase Edge Functions run on Deno)
winget install --id DenoLand.Deno --source winget --accept-package-agreements

# Docker Desktop (for local Supabase)
winget install --id Docker.DockerDesktop --source winget --accept-package-agreements

# PowerShell 7 (modern — better than the built-in 5.x)
winget install --id Microsoft.PowerShell --source winget --accept-package-agreements
```

Close and reopen PowerShell 7 so PATH updates take effect.

### Install Supabase CLI via Scoop

```powershell
# Install Scoop package manager
irm get.scoop.sh | iex

# Add Supabase bucket and install
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Verify

```powershell
git --version        # git version 2.x.x
node -v              # v20.x.x
deno --version       # deno 1.x.x
docker --version     # Docker version 27.x.x
supabase --version   # 2.x.x
```

Start **Docker Desktop** from the Start menu and wait until it shows "Engine running" before proceeding.

---

## Step 2 — Clone / initialise the project

```powershell
# Create your project folder
New-Item -ItemType Directory -Path "C:\Users\Peter\coderepo" -Force
Set-Location "C:\Users\Peter\coderepo"

# If you're starting fresh (no existing repo):
New-Item -ItemType Directory -Path "sms-reminders"
Set-Location "sms-reminders"

# Copy all files from:
#   C:\Users\Peter\Documents\Claude\Projects\SMS Reminders\
# into this folder, then:

npm install       # install local Node tooling

git init
git add .
git commit -m "feat: initial project setup"
```

Open in VS Code:

```powershell
code .
```

---

## Step 3 — Create Supabase projects

You need two Supabase projects (staging + production). Free tier is fine for both.

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Create **sms-reminders-staging** — region: Sydney (`ap-southeast-2`)
3. Create **sms-reminders-production** — same region

For each project, go to **Project Settings → API** and save:

- **Project URL** — e.g. `https://abcdef.supabase.co`
- **anon key**
- **service_role key** ← keep secret, never expose publicly

Go to **Project Settings → General** and save:

- **Project Ref** — short alphanumeric string, e.g. `abcdefghijklmnop`

Get a personal access token for CI/CD:
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**

---

## Step 4 — Configure environment variables

### Local development

```powershell
# From your project folder:
Copy-Item .env.example .env.local
```

Start local Supabase:

```powershell
supabase start
```

You'll see output like:

```env
API URL: http://127.0.0.1:54321
DB URL:  postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio:  http://127.0.0.1:54323
anon key:          eyJ...
service_role key:  eyJ...
```

Copy these into `.env.local`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key from above>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from above>
```

Also fill in your ClickSend and OpenAI keys (see §6 and §7 for where to get them):

```env
CLICKSEND_USERNAME=your-username
CLICKSEND_API_KEY=your-api-key
CLICKSEND_FROM=Reminders
OPENAI_API_KEY=sk-...
```

> `.env.local` is in `.gitignore` — it will never be committed to git.

### The automated route (alternative)

Instead of the manual steps above, just run:

```powershell
.\scripts\Setup-Local.ps1
```

This script installs missing tools, starts Supabase, applies migrations, auto-writes the Supabase keys into `.env.local`, and seeds sample data. You still need to add ClickSend and OpenAI keys manually.

---

## Step 5 — Apply database migrations

```powershell
# Reset local DB, apply all migrations, run seed data:
supabase db reset
```

Then set the Postgres runtime settings that pg_cron needs to call your Edge Function. Connect to your local DB:

```powershell
supabase db connect
```

In the `psql` prompt:

```sql
ALTER DATABASE postgres SET app.supabase_url  = 'http://127.0.0.1:54321';
ALTER DATABASE postgres SET app.service_role_key = '<your local service_role key>';
\q
```

For production/staging, run the same `ALTER DATABASE` commands after deploying (or add them to the migration file — see the comment at the bottom of `001_initial_schema.sql`).

---

## Step 6 — Set up SMS Provider (ClickSend or Twilio)

Choose **one** provider: ClickSend or Twilio. The system uses the `SMS_PROVIDER` environment variable to switch between them at runtime.

### Option A: ClickSend

1. Create an account at [clicksend.com](https://www.clicksend.com)
2. Go to **Dashboard → API Credentials** — copy your username and API key
3. For the sender ID (`CLICKSEND_FROM`):
   - Use a short alphanumeric name (max 11 chars), e.g. `Reminders`
   - OR buy a virtual number from ClickSend for two-way SMS
4. Add test credits — ClickSend has a free trial with AUD credit
5. Set in `.env.local`:

   ```env
   SMS_PROVIDER=clicksend
   CLICKSEND_USERNAME=your-username
   CLICKSEND_API_KEY=your-api-key
   CLICKSEND_FROM=Reminders
   ```

Test a send manually:

```powershell
$creds = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("USERNAME:API_KEY"))
Invoke-RestMethod `
  -Uri "https://rest.clicksend.com/v3/sms/send" `
  -Method POST `
  -Headers @{ Authorization = "Basic $creds"; "Content-Type" = "application/json" } `
  -Body '{"messages":[{"to":"+61400000000","body":"Test from SMS Reminders","from":"Reminders"}]}'
```

### Option B: Twilio

1. Create an account at [twilio.com](https://www.twilio.com)
2. Go to **Console → Account Info** — copy your Account SID and Auth Token
3. In the **Phone Numbers** section, purchase an SMS-capable phone number (or use your trial number)
4. Set in `.env.local`:

   ```env
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=your-account-sid
   TWILIO_AUTH_TOKEN=your-auth-token
   TWILIO_FROM=+1234567890
   ```

   Replace `+1234567890` with your Twilio phone number in E.164 format (includes country code)

5. **Enable billing** if using production (trial accounts have limited SMS credits)

Test a send manually:

```powershell
$accountSid = "your-account-sid"
$authToken = "your-auth-token"
$creds = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$accountSid:$authToken"))
$body = "To=%2B61400000000&From=%2B1234567890&Body=Test+from+SMS+Reminders"

Invoke-RestMethod `
  -Uri "https://api.twilio.com/2010-04-01/Accounts/$accountSid/Messages.json" `
  -Method POST `
  -Headers @{ Authorization = "Basic $creds"; "Content-Type" = "application/x-www-form-urlencoded" } `
  -Body $body
```

---

## Step 7 — Set up OpenAI (Whisper)

OpenAI's Whisper API transcribes audio files to text. This is required for voice-based reminders.

### Prerequisites

- An OpenAI account (sign up at [platform.openai.com](https://platform.openai.com) if you don't have one)
- **Billing enabled** on your account — Whisper costs ~$0.006 per minute of audio

### Setup

1. Go to [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
2. Click **Create new secret key**
3. **Set permissions** (important for security):
   - **Project**: Select your project (or create one called "SMS Reminders")
   - **Permissions**: Restrict to **Whisper API only** (do NOT give it access to GPT-4, GPT-3.5, or other models)
   - This means if the key leaks, attackers can only use it for transcription, not expensive model calls
4. Click **Create** and copy the key immediately (you won't be able to see it again)
5. Add it to `.env.local`:

   ```env
   OPENAI_API_KEY=sk-proj-...
   ```

6. **Enable billing:** Go to [platform.openai.com/account/billing/overview](https://platform.openai.com/account/billing/overview) and add a payment method. Without billing enabled, API calls will fail with a 401 error.

### Verify it works

Test transcription locally with the Edge Function:

```powershell
# Terminal 1: start Supabase
supabase start

# Terminal 2: serve Edge Functions
supabase functions serve

# Terminal 3: send a test audio file (replace with your audio file path)
$headers = @{ Authorization = "Bearer <local anon key>" }
$form = @{ audio = Get-Item "C:\path\to\test.mp3" }
Invoke-RestMethod `
  -Uri "http://127.0.0.1:54321/functions/v1/transcribe" `
  -Method POST `
  -Headers $headers `
  -Form $form
```

You should see:

```json
{
  "text": "Your transcribed audio text here",
  "language": "en"
}
```

**If you get a 401 error:** Billing is not enabled. Go to [platform.openai.com/account/billing/overview](https://platform.openai.com/account/billing/overview) and add a payment method.

**If you get a 400 error:** Check that your audio file format is supported (mp3, wav, m4a, webm — max 25 MB).

---

## Step 8 — Run and test locally

Start everything:

```powershell
# Terminal 1 — local Supabase (if not already running)
supabase start

# Terminal 2 — serve Edge Functions locally with hot-reload
supabase functions serve
```

### Create a reminder via JSON

```powershell
$body = @{
  phone    = "+61400000000"
  message  = "Don't forget your 3pm appointment"
  send_at  = (Get-Date).AddMinutes(2).ToString("o")
  timezone = "Australia/Sydney"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://127.0.0.1:54321/functions/v1/create-reminder" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

### Create a reminder via voice

```powershell
$headers = @{ Authorization = "Bearer <local anon key>" }
$form = @{
  audio    = Get-Item "C:\path\to\reminder.mp3"
  phone    = "+61400000000"
  send_at  = (Get-Date).AddMinutes(2).ToString("o")
  timezone = "Australia/Sydney"
}
Invoke-RestMethod `
  -Uri "http://127.0.0.1:54321/functions/v1/create-reminder" `
  -Method POST `
  -Headers $headers `
  -Form $form
```

### Manually trigger the send function

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:54321/functions/v1/send-reminders" `
  -Method POST `
  -ContentType "application/json" `
  -Body "{}"
```

### Check Supabase Studio

Open [http://127.0.0.1:54323](http://127.0.0.1:54323) → **Table Editor** → `reminders` and `delivery_log` to see results.

---

## Step 9 — Connect to GitHub

```powershell
# From your project folder:
git init   # (if not done in Step 2)
git add .
git commit -m "feat: initial project setup"
```

Create a **private** repo at [github.com/new](https://github.com/new) named `sms-reminders`, then:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/sms-reminders.git
git branch -M main
git push -u origin main

# Create staging and develop branches
git checkout -b staging && git push -u origin staging
git checkout -b develop && git push -u origin develop
git checkout develop   # work here day-to-day
```

### Branch protection (GitHub → Settings → Branches)

Protect `main` and `staging`:

- Require pull request before merging
- Require status checks to pass (`Lint & Test`, `Typecheck Edge Functions`)
- Require branches to be up to date

---

## Step 10 — Add GitHub Actions secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

### Required secrets (all environments)

| Secret                         | Where to get it                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`        | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `STAGING_SUPABASE_PROJECT_REF` | Staging project → Settings → General                                                   |
| `PROD_SUPABASE_PROJECT_REF`    | Production project → Settings → General                                                |
| `SMS_PROVIDER`                 | Your choice: `clicksend` or `twilio`                                                   |
| `OPENAI_API_KEY`               | platform.openai.com → API keys                                                         |

### SMS Provider secrets (choose one set)

**If `SMS_PROVIDER=clicksend`:**

| Secret               | Where to get it                       |
| -------------------- | ------------------------------------- |
| `CLICKSEND_USERNAME` | ClickSend dashboard → API Credentials |
| `CLICKSEND_API_KEY`  | ClickSend dashboard → API Credentials |
| `CLICKSEND_FROM`     | Your sender ID (e.g. `Reminders`)     |

**If `SMS_PROVIDER=twilio`:**

| Secret               | Where to get it               |
| -------------------- | ----------------------------- |
| `TWILIO_ACCOUNT_SID` | Twilio console → Account Info |
| `TWILIO_AUTH_TOKEN`  | Twilio console → Account Info |
| `TWILIO_FROM`        | Your Twilio phone number      |

These secrets are used by `deploy-staging.yml` and `deploy-production.yml` to:

- Link and migrate each Supabase project
- Set Edge Function secrets (`supabase secrets set ...`)
- Deploy all three Edge Functions

---

## Step 11 — Deploy to Supabase (manual first deploy)

### Link and deploy staging

```powershell
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push

# Set secrets — choose the appropriate set based on your SMS provider

# If using ClickSend:
supabase secrets set `
  SMS_PROVIDER="clicksend" `
  CLICKSEND_USERNAME="your-username" `
  CLICKSEND_API_KEY="your-api-key" `
  CLICKSEND_FROM="Reminders" `
  OPENAI_API_KEY="sk-..."

# OR if using Twilio:
supabase secrets set `
  SMS_PROVIDER="twilio" `
  TWILIO_ACCOUNT_SID="your-account-sid" `
  TWILIO_AUTH_TOKEN="your-auth-token" `
  TWILIO_FROM="+1234567890" `
  OPENAI_API_KEY="sk-..."

supabase functions deploy create-reminder --no-verify-jwt
supabase functions deploy send-reminders  --no-verify-jwt
supabase functions deploy transcribe      --no-verify-jwt
```

### Set pg_cron runtime settings on staging

In Supabase dashboard → **SQL Editor** for your staging project:

```sql
ALTER DATABASE postgres SET app.supabase_url  = 'https://<staging-ref>.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = '<staging-service-role-key>';
```

After this, pg_cron will call `send-reminders` every minute automatically.

### Repeat for production

```powershell
supabase link --project-ref <PROD_PROJECT_REF>
# ... same commands as above
```

After the first manual deploy, GitHub Actions takes over for all subsequent deployments.

---

## Step 12 — Add a Supabase Storage bucket

Voice uploads need a bucket. In Supabase dashboard → **Storage → New bucket**:

- Name: `voice-uploads`
- Public: **No** (private — only accessible via service role)

Or add this to a migration:

```sql
insert into storage.buckets (id, name, public)
values ('voice-uploads', 'voice-uploads', false)
on conflict do nothing;
```

---

## Step 13 — Automated testing

### Testing philosophy

The project uses three test layers, each with a different scope and speed profile. CI only runs unit tests automatically (no infrastructure needed). Integration and e2e tests are run manually during development or against staging after a deploy.

| Layer       | Location             | Runs against                                | When to run                    | Speed |
| ----------- | -------------------- | ------------------------------------------- | ------------------------------ | ----- |
| Unit        | `tests/unit/`        | Nothing (pure functions)                    | Every commit — CI              | < 5 s |
| Integration | `tests/integration/` | Local Supabase                              | During development, before PRs | ~30 s |
| E2E         | `tests/e2e/`         | Local or stage Supabase + real SMS provider | Before merging to main         | ~60 s |

Edge Functions (Deno) have their own test runner — see §Edge Function tests below.

---

### Folder structure

```text
tests/
├── unit/                        # Pure logic — no network, no database
│   ├── reminders/               # CLI tool logic (validation, formatting, etc.)
│   └── functions/               # Extracted helper functions from Edge Functions
│
├── integration/                 # Calls local Supabase REST API and Edge Functions
│   ├── create-reminder.test.js  # POST /functions/v1/create-reminder
│   ├── send-reminders.test.js   # POST /functions/v1/send-reminders
│   ├── transcribe.test.js       # POST /functions/v1/transcribe
│   └── cli.test.js              # reminders.js CLI against local DB
│
├── e2e/                         # Full happy-path flows
│   └── full-flow.test.js        # create → wait for pg_cron → verify delivery
│
└── helpers/
    └── supabase.js              # Shared test client, createTestReminder(), cleanup()
```

---

### Running tests locally

**Unit tests** — no Supabase needed, run any time:

```powershell
npm test
```

**Integration tests** — requires local Supabase running:

```powershell
# Terminal 1: ensure Supabase is running
supabase start

# Terminal 2: serve Edge Functions (needed for HTTP-level integration tests)
supabase functions serve

# Terminal 3: run integration tests
npm run test:integration
```

**E2E tests** — requires Supabase + `supabase functions serve` + ClickSend test credits:

```powershell
npm run test:e2e
```

**All tests together:**

```powershell
npm run test:all
```

**With coverage report (unit only):**

```powershell
npm run test:coverage
# Opens coverage/ folder — view coverage/lcov-report/index.html in a browser
```

---

### Edge Function tests (Deno)

Edge Functions run on Deno, so their logic is tested with Deno's built-in test runner rather than Jest. Test files live alongside the function code:

```text
supabase/functions/
├── create-reminder/
│   ├── index.ts
│   └── index.test.ts       ← Deno test file (to be added later)
├── send-reminders/
│   ├── index.ts
│   └── index.test.ts
└── transcribe/
    ├── index.ts
    └── index.test.ts
```

Run Deno tests locally:

```powershell
# Test a single function
deno test supabase/functions/create-reminder/index.test.ts --allow-env --allow-net

# Test all functions
deno test supabase/functions/ --allow-env --allow-net
```

Deno tests use the `Deno.test()` API and are already typechecked by CI via `deno check`.

---

### Test helpers

`tests/helpers/supabase.js` provides shared utilities for integration and e2e tests:

```js
import {
  sb,
  functionsUrl,
  anonHeaders,
  createTestReminder,
  cleanup,
} from "../helpers/supabase.js";

// sb              — service-role Supabase client (bypasses RLS)
// functionsUrl    — base URL for Edge Functions, e.g. http://127.0.0.1:54321/functions/v1
// anonHeaders     — Authorization header using the anon key
// createTestReminder(overrides?) — inserts a test reminder, returns the row
// cleanup(ids)    — deletes test rows by ID (call in afterEach)
```

Example integration test pattern (actual tests to be written later):

```js
// tests/integration/create-reminder.test.js
import { functionsUrl, anonHeaders, cleanup } from "../helpers/supabase.js";

const createdIds = [];
afterEach(() => cleanup(createdIds));

test("creates a reminder from a valid JSON body", async () => {
  const res = await fetch(`${functionsUrl}/create-reminder`, {
    method: "POST",
    headers: anonHeaders,
    body: JSON.stringify({
      phone: "+61412345678",
      message: "Integration test reminder",
      send_at: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  });

  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.status).toBe("pending");
  createdIds.push(body.id); // cleaned up in afterEach
});
```

---

### What will be tested (coverage plan)

**Unit tests (to be written):**

- `scripts/reminders.js` — phone validation, date validation, argument parsing, help text output
- Any pure helper functions extracted from Edge Functions (date formatting, cron parsing, etc.)

**Integration tests (to be written):**

- `create-reminder` Edge Function — valid JSON body, valid multipart (mocked audio), missing fields, invalid phone, past `send_at`
- `send-reminders` Edge Function — picks up pending reminders, marks them sent, handles ClickSend errors
- `transcribe` Edge Function — valid audio, oversized file, unsupported MIME type
- CLI (`reminders.js`) — list filtering, create, edit, cancel, get, log

**E2E tests (to be written):**

- Full voice reminder flow: audio upload → Whisper transcription → reminder created → pg_cron fires → SMS delivered → status updated to `sent`
- Recurring reminder flow: reminder sent → new pending reminder re-queued at next occurrence

---

### CI behaviour

The GitHub Actions `ci.yml` workflow:

- Runs **unit tests** (`npm test`) on every push and pull request — no Supabase needed
- Runs **Deno typecheck** on all Edge Function files on every push
- Does **not** run integration or e2e tests in CI automatically (they require a running database)

To run integration tests in CI in future, you would add a `services:` block to spin up a local Supabase instance via Docker — the commented-out section in `ci.yml` shows where this would go.

---

```powershell
# Start a new feature
git checkout develop
git pull origin develop
git checkout -b feat/my-feature

# ... make changes ...

git add .
git commit -m "feat: add phone validation"
git push origin feat/my-feature
# → Open PR: feat/my-feature → develop (CI runs automatically)

# When ready to test on staging:
# Open PR: develop → staging (CI + deploy runs automatically)

# When ready to go live:
# Open PR: staging → main (CI + deploy to production runs automatically)
```

### Start local dev each day

```powershell
Set-Location "C:\Users\Peter\coderepo\sms-reminders"
supabase start                # if not already running
supabase functions serve      # hot-reload Edge Functions at localhost:54321
```

### Add a database migration

```powershell
supabase migration new add_contacts_table
# → creates supabase\migrations\<timestamp>_add_contacts_table.sql
# Edit the file with your SQL, then:
supabase db reset             # apply locally
git add supabase/migrations/
git commit -m "feat: add contacts table migration"
# CI/CD applies it to staging and prod automatically on merge
```

---

## Managing reminders — CLI tool

`scripts/reminders.js` is a Node CLI for viewing, creating, editing, and deleting reminders. It talks directly to the Supabase REST API using your service role key, so it works against both local and production databases depending on what's in your `.env`.

```powershell
# Shorthand via npm
npm run reminders -- <command>

# Or directly
node scripts/reminders.js <command>
```

### Listing reminders

```powershell
# Pending only (default)
npm run reminders -- list

# All reminders
npm run reminders -- list --status=all

# Filter by status
npm run reminders -- list --status=failed
npm run reminders -- list --status=sent

# Filter by phone
npm run reminders -- list --phone=+61412345678
```

Output looks like:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ID         │ Phone          │ Name   │ Status  │ Send at             │ Recurs │
├──────────────────────────────────────────────────────────────────────────────┤
│ 3f2a1b0c…  │ +61412345678   │ Peter  │ pending │ 21 May 26 09:00 AEST│ —      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Viewing a single reminder

```powershell
npm run reminders -- get 3f2a1b0c-1234-...

# Show delivery log (ClickSend responses, success/fail history)
npm run reminders -- log 3f2a1b0c-1234-...
```

### Creating a reminder

```powershell
npm run reminders -- create `
  --phone="+61412345678" `
  --message="Your dentist appointment is tomorrow at 10am" `
  --send-at="2026-06-01T09:00:00+10:00" `
  --timezone="Australia/Sydney" `
  --name="Peter"

# With recurrence (every Monday at 9am)
npm run reminders -- create `
  --phone="+61412345678" `
  --message="Weekly standup in 15 minutes" `
  --send-at="2026-06-02T09:00:00+10:00" `
  --recurrence="0 9 * * 1"
```

### Editing a reminder

Only the fields you pass will be updated — everything else stays as-is.

```powershell
# Change the message
npm run reminders -- edit 3f2a1b0c-... --message="Updated reminder text"

# Reschedule
npm run reminders -- edit 3f2a1b0c-... --send-at="2026-06-03T10:00:00+10:00"

# Add recurrence to a one-off
npm run reminders -- edit 3f2a1b0c-... --recurrence="0 9 * * 1-5"
```

### Cancelling and deleting

```powershell
# Cancel (sets status to 'cancelled' — can be undone via edit)
npm run reminders -- cancel 3f2a1b0c-...

# Hard delete (irreversible — prompts for confirmation)
npm run reminders -- delete 3f2a1b0c-...
```

### Pointing at production vs local

The CLI reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env`. To run a command against your production database, temporarily override them inline:

```powershell
$env:SUPABASE_URL="https://<prod-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<prod-service-role-key>"
npm run reminders -- list --status=failed
# Reset to local when done:
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY="<local-key>"
```

---

## Useful commands

```powershell
# Supabase local
supabase start                # start local stack (Docker must be running)
supabase stop                 # stop local stack
supabase status               # show local URLs and keys
supabase db reset             # reset + migrate + seed
supabase db push              # push migrations to linked remote project
supabase functions serve      # serve Edge Functions locally
supabase functions deploy     # deploy a function to Supabase cloud

# Reminder management
npm run reminders -- list
npm run reminders -- list --status=all
npm run reminders -- get <id>
npm run reminders -- log <id>
npm run reminders -- cancel <id>

# Testing
npm test                      # unit tests only (no Supabase needed)
npm run test:integration      # integration tests (needs: supabase start + functions serve)
npm run test:e2e              # end-to-end tests (needs: supabase start + functions serve)
npm run test:all              # all three layers
npm run test:coverage         # unit tests with coverage report

# Deno tests (Edge Functions)
deno test supabase/functions/ --allow-env --allow-net

# Seed test data
npm run seed

# Open Studio
Start-Process "http://127.0.0.1:54323"

# Git
git log --oneline --graph --all   # visual branch history
```

---

## Project structure

```text
sms-reminders\
├── .github\
│   └── workflows\
│       ├── ci.yml                  # lint + Deno typecheck on every push
│       ├── deploy-staging.yml      # migrate + deploy on merge to staging
│       └── deploy-production.yml   # migrate + deploy on merge to main
│
├── supabase\
│   ├── config.toml                 # local Supabase config
│   ├── migrations\
│   │   └── 001_initial_schema.sql  # reminders table, pg_cron job, delivery_log
│   └── functions\
│       ├── create-reminder\
│       │   └── index.ts            # POST: create reminder (JSON or audio)
│       ├── send-reminders\
│       │   └── index.ts            # called by pg_cron; sends via ClickSend
│       └── transcribe\
│           └── index.ts            # POST: audio → Whisper → text
│
├── scripts\
│   ├── Setup-Local.ps1             # one-time Windows 11 setup
│   ├── seed.js                     # insert sample reminders locally
│   └── reminders.js                # CLI: list/get/create/edit/cancel/delete/log
│
├── tests\
│   ├── unit\                       # fast, no I/O — run by CI on every push
│   ├── integration\                # requires local Supabase — run manually
│   ├── e2e\                        # full flow — run manually before releases
│   └── helpers\
│       └── supabase.js             # shared client, createTestReminder(), cleanup()
│
├── .env.example                    # template (safe to commit)
├── .env                            # your secrets (gitignored)
├── .gitignore
├── jest.config.js                  # Jest config (ESM + test layer path patterns)
├── package.json                    # Node tooling + test scripts
└── SETUP.md                        # this file
```

---

## API reference

### `POST /functions/v1/create-reminder`

**JSON body:**

```json
{
  "phone": "+61412345678",
  "message": "Reminder text (max 1600 chars)",
  "send_at": "2026-05-21T09:00:00+10:00",
  "timezone": "Australia/Sydney",
  "name": "Peter",
  "recurrence": "0 9 * * 1"
}
```

**Multipart form (voice):**

| Field        | Type   | Description                                  |
| ------------ | ------ | -------------------------------------------- |
| `audio`      | File   | Audio file (mp3, wav, m4a, webm — max 25 MB) |
| `phone`      | string | E.164 format                                 |
| `send_at`    | string | ISO 8601 future datetime                     |
| `timezone`   | string | Optional, default UTC                        |
| `recurrence` | string | Optional cron expression                     |

**Response `201`:**

```json
{
  "id": "uuid",
  "phone": "+61412345678",
  "message": "Transcribed or provided message",
  "send_at": "2026-05-21T09:00:00+10:00",
  "status": "pending"
}
```

---

### `POST /functions/v1/transcribe`

**Multipart form:**

| Field   | Type | Description            |
| ------- | ---- | ---------------------- |
| `audio` | File | Audio file (max 25 MB) |

Query param: `?language=en` (default `en`)

**Response `200`:**

```json
{
  "text": "Don't forget your doctor's appointment at 3pm",
  "language": "en"
}
```

---

### `POST /functions/v1/send-reminders`

Called automatically by pg_cron every minute. Can also be triggered manually (useful for testing).

**Response `200`:**

```json
{
  "processed": 3,
  "sent": 2,
  "failed": 1
}
```

---

## Environment variables reference

| Variable                    | Required | Description                           |
| --------------------------- | -------- | ------------------------------------- |
| `SUPABASE_URL`              | Yes      | Supabase project URL (local or cloud) |
| `SUPABASE_ANON_KEY`         | Yes      | Public anon key                       |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Service role key (server-side only)   |
| `CLICKSEND_USERNAME`        | Yes      | ClickSend account username            |
| `CLICKSEND_API_KEY`         | Yes      | ClickSend API key                     |
| `CLICKSEND_FROM`            | Yes      | Sender ID (max 11 chars alphanumeric) |
| `OPENAI_API_KEY`            | Yes      | OpenAI API key (for Whisper)          |
| `NODE_ENV`                  | No       | `development` or `production`         |
