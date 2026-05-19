-- ============================================================
-- SMS REMINDERS — Initial Schema
-- Created: 2026-05-19
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- CONTACTS
-- People who will receive SMS reminders
-- ============================================================
create table if not exists contacts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  phone       text not null,  -- E.164 format, e.g. +61412345678
  notes       text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,

  unique(user_id, phone)
);

-- ============================================================
-- REMINDERS
-- Scheduled SMS messages
-- ============================================================
create table if not exists reminders (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  contact_id    uuid references contacts(id) on delete cascade not null,
  message       text not null,
  scheduled_at  timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at       timestamptz,
  error_message text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- ============================================================
-- SMS LOG
-- Audit trail of every SMS attempted
-- ============================================================
create table if not exists sms_log (
  id            uuid primary key default uuid_generate_v4(),
  reminder_id   uuid references reminders(id) on delete set null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  phone         text not null,
  message       text not null,
  provider      text not null default 'mobile_message',
  status        text not null check (status in ('sent', 'failed')),
  provider_ref  text,  -- Message ID from Mobile Message
  error_message text,
  sent_at       timestamptz default now() not null
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only see/edit their own data
-- ============================================================
alter table contacts enable row level security;
alter table reminders enable row level security;
alter table sms_log enable row level security;

-- Contacts policies
create policy "Users manage own contacts"
  on contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reminders policies
create policy "Users manage own reminders"
  on reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SMS log policies
create policy "Users view own SMS log"
  on sms_log for select
  using (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-update updated_at on every row change
-- ============================================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_updated_at
  before update on contacts
  for each row execute function handle_updated_at();

create trigger reminders_updated_at
  before update on reminders
  for each row execute function handle_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index reminders_user_id_idx on reminders(user_id);
create index reminders_status_scheduled_idx on reminders(status, scheduled_at)
  where status = 'pending';
create index contacts_user_id_idx on contacts(user_id);
create index sms_log_reminder_id_idx on sms_log(reminder_id);
