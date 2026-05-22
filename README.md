# SMS Reminders

A Supabase-based SMS reminder service that sends scheduled SMS messages, supports voice-to-text transcription, and provides a CLI for reminder management.

**Stack:** Supabase (Postgres + Edge Functions + pg_cron) · SMS Provider (ClickSend or Twilio) · Whisper/OpenAI (voice-to-text) · Node.js (local tooling) · Docker · GitHub Actions

---

## Quick Start

For detailed setup instructions, see [SETUP.md](./SETUP.md).

```powershell
# Install dependencies
npm install

# Start local Supabase (Docker must be running)
supabase start

# In another terminal: serve Edge Functions
supabase functions serve

# In a third terminal: run integration tests
npm run test:integration
```

---

## Environments

This project uses three environments: **Local** (for development), **Staging** (for pre-release testing), and **Production** (live).

### Environment Configuration

Each environment has its own `.env` file:

| Environment | File            | Purpose                                  | Database     |
| ----------- | --------------- | ---------------------------------------- | ------------ |
| **Local**   | `.env.local`    | Your Windows 11 machine (Docker)         | Local Postgres (via supabase start) |
| **Staging** | `.env.stage`    | Pre-release testing                      | Supabase Cloud (staging project) |
| **Production** | `.env.prod` | Live production                          | Supabase Cloud (production project) |

### .env Files

Create `.env.local` for development (copy from `.env.example`):

```powershell
Copy-Item .env.example .env.local
```

Fill in your local Supabase keys after running `supabase start`, plus your SMS provider credentials:

**For ClickSend:**

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
SMS_PROVIDER=clicksend
CLICKSEND_USERNAME=your-username
CLICKSEND_API_KEY=your-api-key
CLICKSEND_FROM=Reminders
OPENAI_API_KEY=sk-...
```

**For Twilio:**

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM=+1234567890
OPENAI_API_KEY=sk-...
```

For **staging** and **production**, create `.env.stage` and `.env.prod` with the corresponding Supabase project credentials. These are used by:

- The CLI (`npm run reminders`) to target different environments
- CI/CD workflows (GitHub Actions) to deploy to each environment
- Manual testing against remote instances

### Using Different Environments

**Development (local):**

```powershell
npm run reminders -- list                    # uses .env.local
```

**Staging:**

```powershell
$env:NODE_ENV="staging"
npm run reminders -- list                    # uses .env.stage
```

**Production:**

```powershell
$env:NODE_ENV="production"
npm run reminders -- list                    # uses .env.prod
```

Or override directly:

```powershell
$env:SUPABASE_URL="https://<staging-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"
npm run reminders -- list
```

---

## Development Workflow

### Branch Strategy

| Branch      | Purpose                  | Deploys To    | CI/CD Action                                 |
| ----------- | ------------------------ | ------------- | -------------------------------------------- |
| `develop`   | Day-to-day work          | —             | Lint + typecheck on every push               |
| `staging`   | Pre-release testing      | Staging env   | Lint + typecheck + migrate + deploy functions |
| `main`      | Production               | Production    | Lint + typecheck + migrate + deploy functions |

### Daily Workflow

```powershell
# 1. Start from develop
git checkout develop
git pull origin develop

# 2. Create a feature branch
git checkout -b feat/my-feature

# 3. Make changes, test locally with .env.local
npm run reminders -- list
npm test
npm run test:integration

# 4. Push and open PR: feat/my-feature → develop
git push origin feat/my-feature
# → Open PR on GitHub (CI runs automatically)

# 5. When ready for staging, merge to staging
# → Open PR: develop → staging
# → CI + deploy to staging environment automatically

# 6. When ready for production, merge to main
# → Open PR: staging → main
# → CI + deploy to production automatically
```

---

## Managing Reminders

Use the CLI tool (`scripts/reminders.js`) to manage reminders across all environments:

```powershell
# List pending reminders
npm run reminders -- list

# List all reminders
npm run reminders -- list --status=all

# Create a reminder
npm run reminders -- create \
  --phone="+61412345678" \
  --message="Appointment reminder" \
  --send-at="2026-05-25T09:00:00+10:00" \
  --timezone="Australia/Sydney"

# Get reminder details
npm run reminders -- get 3f2a1b0c-...

# View delivery log
npm run reminders -- log 3f2a1b0c-...

# Edit a reminder
npm run reminders -- edit 3f2a1b0c-... --message="Updated text"

# Cancel a reminder
npm run reminders -- cancel 3f2a1b0c-...
```

For full CLI documentation, see [SETUP.md — Managing reminders](./SETUP.md#managing-reminders--cli-tool).

---

## Testing

Three test layers with different scope and speed:

| Layer       | Command                  | Runs Against                    | When to Run    | Speed |
| ----------- | ------------------------ | ------------------------------- | -------------- | ----- |
| Unit        | `npm test`               | Pure functions (no network)     | Every commit   | < 5s  |
| Integration | `npm run test:integration` | Local Supabase + Edge Functions | Before PR      | ~30s  |
| E2E         | `npm run test:e2e`       | Full flow (real ClickSend)      | Before release | ~60s  |

All tests together:

```powershell
npm run test:all
```

With coverage report:

```powershell
npm run test:coverage
```

For detailed testing guide, see [SETUP.md — Automated testing](./SETUP.md#step-13--automated-testing).

---

## Useful Commands

```powershell
# Local development
supabase start                          # start Docker + Postgres
supabase stop                           # stop local Supabase
supabase functions serve                # serve Edge Functions (hot-reload)
supabase db reset                       # reset + migrate + seed

# Reminders management
npm run reminders -- list
npm run reminders -- create --phone="+61412345678" --message="..."
npm run reminders -- get <id>
npm run reminders -- cancel <id>

# Testing
npm test                                # unit tests
npm run test:integration                # integration tests
npm run test:e2e                        # end-to-end tests
npm run test:all                        # all layers
npm run test:coverage                   # with coverage report

# Database
supabase db push                        # push migrations to remote
supabase migration new <name>           # create new migration

# Git
git log --oneline --graph --all         # visual branch history
```

---

## Deployment

Deployments happen automatically via GitHub Actions:

- **Merge to `staging`** → CI + deploy to staging Supabase project
- **Merge to `main`** → CI + deploy to production Supabase project

For manual first-time setup, see [SETUP.md — Deploy to Supabase](./SETUP.md#step-11--deploy-to-supabase-manual-first-deploy).

---

## Project Structure

```text
sms-reminders/
├── supabase/
│   ├── migrations/          # Database schema
│   └── functions/           # Edge Functions (Deno)
│
├── scripts/
│   ├── reminders.js         # CLI: list/create/edit/cancel/delete/log
│   └── seed.js              # Insert sample data
│
├── tests/
│   ├── unit/                # Pure logic tests
│   ├── integration/         # Supabase + Edge Function tests
│   ├── e2e/                 # Full flow tests
│   └── helpers/             # Shared test utilities
│
├── .env.example             # Template for .env files
├── .env.local               # Local development (git ignored)
├── .env.stage               # Staging environment (git ignored)
├── .env.prod                # Production environment (git ignored)
├── .gitignore
├── jest.config.js
├── package.json
├── SETUP.md                 # Complete setup guide
└── README.md                # This file
```

---

## Further Reading

- **[SETUP.md](./SETUP.md)** — Complete development environment setup for Windows 11, database migrations, testing strategy
- **[AGENTS.md](./AGENTS.md)** — Notes on breaking changes in this Next.js version

---

## License

MIT
