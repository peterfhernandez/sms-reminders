-- ============================================================
-- SMS Reminders — Initial Schema
-- Stack: Supabase (Postgres) + pg_cron + SMS Provider (ClickSend/Twilio) + Whisper
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";   -- used by pg_cron to invoke Edge Functions

-- ────────────────────────────────────────────────────────────
-- 1. REMINDERS TABLE
-- ────────────────────────────────────────────────────────────
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),

  -- Recipient
  phone         text        not null check (phone ~ '^\+?[1-9]\d{6,14}$'),
  name          text,                        -- optional display name

  -- Content
  message       text        not null check (char_length(message) between 1 and 1600),
  voice_file    text,                        -- path/URL of original audio (if created via Whisper)

  -- Scheduling
  send_at       timestamptz not null,        -- when to deliver
  timezone      text        not null default 'UTC',

  -- Recurrence (null = one-off)
  -- cron expression stored here; pg_cron re-queues after each send
  recurrence    text,                        -- e.g. '0 9 * * 1' (every Monday 9am)

  -- Status tracking
  status        text        not null default 'pending'
                  check (status in ('pending','sent','failed','cancelled')),
  sent_at       timestamptz,
  error_msg     text,
  provider      text,                        -- SMS provider used (clicksend, twilio, etc)
  provider_msg_id text,                      -- Provider-specific message ID for delivery receipts

  -- Audit
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reminders_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_reminders_send_at_status
  on public.reminders (send_at, status)
  where status = 'pending';

create index if not exists idx_reminders_phone
  on public.reminders (phone);

-- ────────────────────────────────────────────────────────────
-- 2. DELIVERY LOG TABLE
-- ────────────────────────────────────────────────────────────
create table if not exists public.delivery_log (
  id            uuid primary key default gen_random_uuid(),
  reminder_id   uuid references public.reminders(id) on delete cascade,
  attempted_at  timestamptz not null default now(),
  success       boolean     not null,
  response_body jsonb,
  http_status   int
);

-- ────────────────────────────────────────────────────────────
-- 3. pg_cron JOB — invoke Edge Function every minute
--
-- The Edge Function "send-reminders" queries for pending
-- reminders where send_at <= now(), calls ClickSend for each,
-- and marks them sent/failed.
-- ────────────────────────────────────────────────────────────

-- The SUPABASE_URL and service role key must be set as Supabase
-- secrets before running this migration (see SETUP.md).
-- Replace <PROJECT_REF> with your actual Supabase project ref.

select cron.schedule(
  'send-due-reminders',           -- job name (unique)
  '* * * * *',                    -- every minute
  $$
    select net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- (disabled for backend-only; enable if you add auth later)
-- ────────────────────────────────────────────────────────────
alter table public.reminders    disable row level security;
alter table public.delivery_log disable row level security;

-- ────────────────────────────────────────────────────────────
-- 5. HELPER: set Postgres runtime settings used by pg_cron
--    (these are set via Supabase dashboard → Database → Config
--     OR via ALTER DATABASE ... SET ...)
-- ────────────────────────────────────────────────────────────
-- Run this after deploying; replace values with your project's:
--
--   ALTER DATABASE postgres SET app.supabase_url  = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';
