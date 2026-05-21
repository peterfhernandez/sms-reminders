/**
 * Local dev seed — inserts sample reminders into your local Supabase.
 * Run: node scripts/seed.js
 * Requires: .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config(); // load .env

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const reminders = [
  {
    phone:   "+61400000001",
    name:    "Test User 1",
    message: "Don't forget your 3pm meeting today!",
    send_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 min from now
    timezone: "Australia/Sydney",
  },
  {
    phone:   "+61400000002",
    name:    "Test User 2",
    message: "Weekly check-in reminder",
    send_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min from now
    timezone: "Australia/Sydney",
    recurrence: "0 9 * * 1", // every Monday 9am
  },
];

const { data, error } = await supabase
  .from("reminders")
  .insert(reminders)
  .select("id, phone, message, send_at");

if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}

console.log("Seeded reminders:");
console.table(data);
