# SMS Reminders — Complete Dev Setup Guide (Windows 11)

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth) · Tailwind CSS · Mobile Message (SMS) · Vercel · GitHub Actions

**Local project path:** `C:\Users\Peter\coderepo\sms-reminders`

---

## Architecture Overview

```text
Your machine (VS Code)
    │
    ├── develop branch  ──→  local Supabase (Docker) + localhost:3000
    ├── staging branch  ──→  Supabase STAGING project + Vercel preview URL
    └── main branch     ──→  Supabase PRODUCTION project + your live domain
```

### Branch strategy

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `develop` | Active development | Local only |
| `staging` | Pre-release testing | Vercel preview + Supabase staging |
| `main` | Live production | Vercel production + Supabase prod |

**Flow:** `develop` → Pull Request → `staging` → test → Pull Request → `main`

---

## Step 1 — Install tools on Windows 11

Open **PowerShell as Administrator** (search "PowerShell" → right-click → Run as Administrator) and run each block.

### Allow PowerShell scripts to run (one-time)

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Install winget (if not already present)

winget ships with Windows 11 by default. Verify it works:

```powershell
winget --version
```

If missing, install the [App Installer from the Microsoft Store](https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1).

### Install core tools

```powershell
# Git
winget install --id Git.Git --source winget --accept-package-agreements

# Node.js 20 LTS
winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements

# Docker Desktop (needed for local Supabase)
winget install --id Docker.DockerDesktop --source winget --accept-package-agreements

# Visual Studio Code
winget install --id Microsoft.VisualStudioCode --source winget --accept-package-agreements

# PowerShell 7 (modern version, recommended over Windows PowerShell 5)
winget install --id Microsoft.PowerShell --source winget --accept-package-agreements
```

**Close and reopen PowerShell 7** after these installs so PATH updates take effect.

### Install Supabase CLI via Scoop

```powershell
# Install Scoop (a package manager for dev tools)
irm get.scoop.sh | iex

# Add Supabase bucket and install
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Verify everything installed correctly

```powershell
git --version         # git version 2.x.x
node -v               # v20.x.x
npm -v                # 10.x.x
docker --version      # Docker version 27.x.x
supabase --version    # 2.x.x
code --version        # VS Code version
```

### Start Docker Desktop

Open Docker Desktop from the Start menu and wait for it to show "Engine running" in the bottom-left. You'll need Docker running whenever you do local Supabase work.

---

## Step 2 — Create your project folder and Next.js app

Open **PowerShell 7** (not as Administrator this time — regular user is fine):

```powershell
# Create the coderepo folder and navigate into it
New-Item -ItemType Directory -Path "C:\Users\Peter\coderepo" -Force
Set-Location "C:\Users\Peter\coderepo"

# Scaffold the Next.js app
# When prompted, choose: TypeScript ✓, Tailwind ✓, App Router ✓, src/ dir ✓, import alias @/* ✓
npx create-next-app@latest sms-reminders

Set-Location sms-reminders

# Install Supabase client libraries
npm install @supabase/supabase-js @supabase/ssr

# Install dev tools
npm install -D prettier eslint-config-prettier
```

### Open in VS Code

```powershell
code .
```

VS Code will open and prompt you to install the recommended extensions — click **Install All**.

---

## Step 3 — Connect to GitHub

Still in PowerShell inside `C:\Users\Peter\coderepo\sms-reminders`:

```powershell
# Copy the project files from your Claude workspace into this folder
# (migrations, .github workflows, .env.example, etc. — see folder structure below)

# Initialise git and make your first commit
git init
git add .
git commit -m "feat: initial project setup"
```

### Create the GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `sms-reminders`
3. Set to **Private**
4. Do NOT initialise with README (you already have files locally)
5. Click **Create repository**

```powershell
# Link your local repo to GitHub and push
git remote add origin https://github.com/YOUR_USERNAME/sms-reminders.git
git branch -M main
git push -u origin main

# Create staging and develop branches
git checkout -b staging
git push -u origin staging

git checkout -b develop
git push -u origin develop

# Switch to develop — this is your day-to-day working branch
git checkout develop
```

### Set branch protection rules in GitHub

Go to your repo → **Settings → Branches → Add branch protection rule**:

**Rule 1 — protect `main`**

- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass → add: `Lint, Type-check & Test`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

**Rule 2 — protect `staging`**

- Branch name pattern: `staging`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass

---

## Step 4 — Set up Supabase (Staging + Production)

You need **two separate Supabase projects** — one for staging, one for production.

### 4a. Create the two projects

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Create **sms-reminders-staging**
   - Region: **Southeast Asia (Singapore)** — closest to Australia with good latency
   - Generate a strong DB password — save it in a password manager
3. Create **sms-reminders-production**
   - Same region
   - A different strong DB password

### 4b. Initialise Supabase in your project

```powershell
# From C:\Users\Peter\coderepo\sms-reminders:
supabase init
```

Then copy the `supabase/` folder from your Claude workspace into `C:\Users\Peter\coderepo\sms-reminders\` — it contains:

- `config.toml` — local dev configuration
- `migrations/` — your initial database schema
- `seed/` — local test data

### 4c. Start local Supabase

Make sure Docker Desktop is running, then:

```powershell
supabase start
```

You'll see output like:

```text
API URL: http://localhost:54321
GraphQL URL: http://localhost:54321/graphql/v1
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
anon key: eyJ...
service_role key: eyJ...
```

**Copy these values** — you'll need them for `.env.local`.

Apply migrations and seed data to your local database:

```powershell
supabase db reset
```

### 4d. Get your remote API keys

For each Supabase project (staging + prod), go to:
**Project → Settings → API**

Copy:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon / public key**
- **service_role key** — keep this secret, never expose to the browser

Also go to **Settings → General** and copy the **Project Ref** (the short alphanumeric ID).

For GitHub Actions you also need a personal **Supabase Access Token**:
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token

---

## Step 5 — Configure environment variables

### Local development

```powershell
# From C:\Users\Peter\coderepo\sms-reminders:
Copy-Item .env.example .env.local
```

Open `.env.local` in VS Code and fill in the values that `supabase start` printed for local dev:

```code
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
MOBILE_MESSAGE_API_KEY=your-mobile-message-key
MOBILE_MESSAGE_SENDER_ID=YourBrand
CRON_SECRET=any-random-string-for-local
```

> `.env.local` is in `.gitignore` — it will never be committed to GitHub.

---

## Step 6 — Add GitHub Secrets for CI/CD

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add all of these:

| Secret name | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Tokens |
| `STAGING_SUPABASE_PROJECT_REF` | Staging project → Settings → General |
| `STAGING_SUPABASE_URL` | Staging project → Settings → API |
| `STAGING_SUPABASE_ANON_KEY` | Staging project → Settings → API |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging project → Settings → API |
| `STAGING_APP_URL` | Your Vercel staging preview URL (add after Vercel setup) |
| `STAGING_MOBILE_MESSAGE_API_KEY` | Mobile Message dashboard |
| `PROD_SUPABASE_PROJECT_REF` | Production project → Settings → General |
| `PROD_SUPABASE_URL` | Production project → Settings → API |
| `PROD_SUPABASE_ANON_KEY` | Production project → Settings → API |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | Production project → Settings → API |
| `PROD_APP_URL` | Your live domain |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Account Settings |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings |
| `MOBILE_MESSAGE_SENDER_ID` | Your SMS sender name/brand |

---

## Step 7 — Set up Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `sms-reminders` GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Add your **production** environment variables under the Production environment
5. Add your **staging** environment variables under the Preview environment
6. Deploy — Vercel will auto-deploy preview URLs for every push to `staging`, and your live site on every push to `main`

---

## Step 8 — Verify package.json scripts

Open `package.json` and make sure these scripts exist (create-next-app adds most of them — add `type-check` if missing):

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest --passWithNoTests",
    "test:watch": "jest --watch"
  }
}
```

---

## Step 9 — Run the one-time setup script

```powershell
# From C:\Users\Peter\coderepo\sms-reminders:
.\scripts\Setup-Local.ps1
```

This will install dependencies, create `.env.local`, start local Supabase, and apply migrations automatically.

---

## Day-to-day development workflow

```powershell
# 1. Start a new feature
git checkout develop
git pull origin develop
git checkout -b feat/my-feature-name

# 2. Work on your code, then commit
git add .
git commit -m "feat: add contact management page"
git push origin feat/my-feature-name

# 3. Open a Pull Request on GitHub: feat/my-feature-name → develop
#    GitHub Actions runs CI (lint + type-check + tests) automatically

# 4. Merge to develop when ready

# 5. When ready to test on staging, open a PR: develop → staging
#    On merge: GitHub Actions deploys to Vercel + applies Supabase migrations to staging

# 6. Test on staging URL, then open a PR: staging → main
#    On merge: auto-deploys to production
```

### Start your local dev server each day

```powershell
# Make sure Docker is running, then:
Set-Location "C:\Users\Peter\coderepo\sms-reminders"
supabase start    # if it's not already running
npm run dev       # starts Next.js on http://localhost:3000
```

### Adding a database migration

```powershell
# Create a new migration file (from inside your project folder):
supabase migration new add_reminder_recurrence

# This creates: supabase\migrations\<timestamp>_add_reminder_recurrence.sql
# Edit that file with your SQL changes, then apply locally:
supabase db reset

# Commit the migration file to git — CI/CD will apply it to staging and prod automatically
```

---

## Mobile Message integration

Mobile Message is an Australian SMS gateway. Create `src\lib\sms.ts`:

```typescript
// SMS via Mobile Message
// Check your actual API docs at mobilemessage.com.au after signing in

export async function sendSMS(to: string, message: string) {
  const response = await fetch('https://api.mobilemessage.com.au/sms/v1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MOBILE_MESSAGE_API_KEY}`,
    },
    body: JSON.stringify({
      to,
      from: process.env.MOBILE_MESSAGE_SENDER_ID,
      body: message,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SMS send failed: ${error}`);
  }

  return response.json();
}
```

> ⚠️ Verify the exact endpoint and request shape from your Mobile Message dashboard — the above is illustrative.

---

## Useful commands cheat sheet

```powershell
# Daily dev
npm run dev                        # Start Next.js on localhost:3000
supabase start                     # Start local Supabase (needs Docker)
supabase stop                      # Stop local Supabase
supabase db reset                  # Reset local DB + run migrations + seed
Start-Process http://localhost:54323  # Open Supabase Studio in browser

# Database migrations
supabase migration new <name>      # Create a new migration file
supabase db push                   # Push pending migrations to remote
supabase db diff                   # Show what's changed vs remote

# Git
git checkout develop               # Switch to develop branch
git pull origin develop            # Get latest
git checkout -b feat/name          # Start a new feature branch
git log --oneline --graph          # Visual branch history
```

---

## Project folder structure

```text
C:\Users\Peter\coderepo\sms-reminders\
├── .github\
│   ├── workflows\
│   │   ├── ci.yml                    # Run on every Pull Request
│   │   ├── deploy-staging.yml        # Auto-deploy on merge to staging
│   │   └── deploy-production.yml     # Auto-deploy on merge to main
│   └── PULL_REQUEST_TEMPLATE\
│       └── pull_request_template.md
├── .vscode\
│   ├── extensions.json               # Recommended VS Code extensions
│   └── settings.json                 # Format on save, Tailwind, etc.
├── supabase\
│   ├── config.toml                   # Local Supabase config
│   ├── migrations\                   # SQL migrations (committed to git)
│   │   └── 20260519000001_initial_schema.sql
│   └── seed\
│       └── seed.sql                  # Local dev seed data only
├── src\
│   ├── app\                          # Next.js App Router pages + API routes
│   ├── components\                   # Reusable React components
│   ├── lib\
│   │   ├── supabase\                 # Supabase client helpers
│   │   └── sms.ts                    # Mobile Message integration
│   └── types\                        # TypeScript type definitions
├── scripts\
│   └── Setup-Local.ps1               # One-time local setup (PowerShell)
├── .env.example                      # Template — safe to commit
├── .env.local                        # Your local secrets — DO NOT COMMIT
├── .gitignore
└── SETUP.md                          # This file
```
