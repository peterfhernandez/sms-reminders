-- ============================================================
-- SMS REMINDERS — Seed data for local development
-- Run: supabase db reset  (resets DB and applies this seed)
-- ============================================================

-- NOTE: This only works locally. Seed data is never pushed to
-- staging or production via migrations.

-- Insert a test user (auth.users is managed by Supabase Auth —
-- use the Supabase Studio UI or supabase CLI to create test users
-- for local dev: http://localhost:54323)

-- Example: after creating a test user in Studio, grab their UUID
-- and insert some test contacts/reminders here:

-- insert into contacts (user_id, name, phone, notes) values
--   ('your-test-user-uuid-here', 'Alice Smith', '+61411111111', 'Test contact'),
--   ('your-test-user-uuid-here', 'Bob Jones',  '+61422222222', 'Another contact');
