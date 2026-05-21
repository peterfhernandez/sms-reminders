/**
 * tests/helpers/supabase.js
 *
 * Shared Supabase client for integration and e2e tests.
 * Points at your local Supabase instance by default.
 *
 * Usage in a test file:
 *   import { sb, cleanup } from '../helpers/supabase.js';
 *
 *   afterEach(() => cleanup(createdIds));
 */

import { createClient } from "@supabase/supabase-js";
import { config }        from "dotenv";

config(); // load .env

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.\n" +
    "Make sure local Supabase is running: supabase start"
  );
}

/** Service-role client — bypasses RLS, suitable for test setup/teardown */
export const sb = createClient(url, key);

/**
 * Base URL for calling Edge Functions locally.
 * e.g. `${functionsUrl}/create-reminder`
 */
export const functionsUrl = `${url}/functions/v1`;

/**
 * Auth header for calling Edge Functions with the anon key.
 * Integration tests use the anon key to simulate real callers.
 */
export const anonHeaders = {
  Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Delete test reminders by ID after each test.
 * Pass the array you've been collecting IDs into.
 *
 * @param {string[]} ids
 */
export async function cleanup(ids = []) {
  if (ids.length === 0) return;
  const { error } = await sb.from("reminders").delete().in("id", ids);
  if (error) console.warn("cleanup error:", error.message);
  ids.length = 0; // clear in-place
}

/**
 * Insert a minimal valid reminder for testing.
 * Returns the created row.
 *
 * @param {Partial<object>} overrides
 */
export async function createTestReminder(overrides = {}) {
  const defaults = {
    phone:    "+61400000099",
    message:  "Test reminder — safe to delete",
    send_at:  new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
    timezone: "UTC",
    status:   "pending",
  };

  const { data, error } = await sb
    .from("reminders")
    .insert({ ...defaults, ...overrides })
    .select()
    .single();

  if (error) throw new Error(`createTestReminder failed: ${error.message}`);
  return data;
}
