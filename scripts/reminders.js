#!/usr/bin/env node
/**
 * reminders.js — CLI management tool for SMS Reminders
 *
 * Usage:
 *   node scripts/reminders.js <command> [options]
 *
 * Commands:
 *   list                          List reminders (default: pending only)
 *   list --status=all             List all reminders
 *   list --status=sent            Filter by status
 *   list --phone=+61412345678     Filter by phone number
 *   get   <id>                    Show full details of one reminder
 *   log   <id>                    Show delivery log for a reminder
 *   create --phone=+61... --message="..." --send-at="2026-05-21T09:00:00+10:00"
 *   edit   <id> --message="..." --send-at="..." --recurrence="0 9 * * 1"
 *   cancel <id>                   Mark reminder as cancelled
 *   delete <id>                   Hard-delete a reminder (irreversible)
 *
 * Requires: .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config }        from "dotenv";
import { parseArgs }     from "node:util";
import { stdin as input } from "node:process";
import * as readline     from "node:readline/promises";

config(); // load .env

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  die("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

const STATUS_COLOUR = {
  pending:   c.yellow,
  sent:      c.green,
  failed:    c.red,
  cancelled: c.gray,
};

function colourStatus(s) {
  return `${STATUS_COLOUR[s] ?? ""}${s}${c.reset}`;
}

function die(msg) {
  console.error(`${c.red}Error:${c.reset} ${msg}`);
  process.exit(1);
}

function ok(msg)   { console.log(`${c.green}✓${c.reset}  ${msg}`); }
function info(msg) { console.log(`${c.cyan}→${c.reset}  ${msg}`); }
function warn(msg) { console.log(`${c.yellow}!${c.reset}  ${msg}`); }

// ── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return c.gray + "—" + c.reset;
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function shortId(id) {
  return id ? id.slice(0, 8) + "…" : "—";
}

// ── Table renderer ────────────────────────────────────────────────────────────

function renderTable(rows, cols) {
  if (rows.length === 0) {
    console.log(c.dim + "  (no results)" + c.reset);
    return;
  }
  // Measure column widths (accounting for ANSI escape codes)
  const stripAnsi = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  const widths = cols.map(col =>
    Math.max(col.header.length, ...rows.map(r => stripAnsi(col.render(r)).length))
  );
  const hr = "─".repeat(widths.reduce((a, w) => a + w + 3, 1));
  const pad = (s, w) => {
    const visible = stripAnsi(s);
    return s + " ".repeat(Math.max(0, w - visible.length));
  };

  console.log(c.dim + "┌" + hr + "┐" + c.reset);
  console.log(c.dim + "│ " + c.reset +
    cols.map((col, i) => c.bold + pad(col.header, widths[i]) + c.reset).join(c.dim + " │ " + c.reset) +
    c.dim + " │" + c.reset);
  console.log(c.dim + "├" + hr + "┤" + c.reset);
  for (const row of rows) {
    console.log(c.dim + "│ " + c.reset +
      cols.map((col, i) => pad(col.render(row) ?? c.gray + "—" + c.reset, widths[i])).join(c.dim + " │ " + c.reset) +
      c.dim + " │" + c.reset);
  }
  console.log(c.dim + "└" + hr + "┘" + c.reset);
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdList({ status, phone, limit = 50 }) {
  let q = sb.from("reminders").select("*").order("send_at", { ascending: true }).limit(limit);

  if (status && status !== "all") {
    q = q.eq("status", status);
  }
  if (phone) {
    q = q.ilike("phone", `%${phone}%`);
  }

  const { data, error } = await q;
  if (error) die(error.message);

  const statusLabel = status === "all" ? "all" : (status ?? "pending");
  console.log(`\n${c.bold}Reminders${c.reset} ${c.dim}[${statusLabel}]${c.reset}\n`);

  renderTable(data, [
    { header: "ID",       render: r => c.dim + shortId(r.id) + c.reset },
    { header: "Phone",    render: r => r.phone },
    { header: "Name",     render: r => r.name ?? c.dim + "—" + c.reset },
    { header: "Status",   render: r => colourStatus(r.status) },
    { header: "Send at",  render: r => fmtDate(r.send_at) },
    { header: "Sent at",  render: r => r.sent_at ? fmtDate(r.sent_at) : c.dim + "—" + c.reset },
    { header: "Recurs",   render: r => r.recurrence ?? c.dim + "—" + c.reset },
  ]);

  console.log(`\n${c.dim}${data.length} reminder(s) shown. Use --status=all to see everything.${c.reset}\n`);
}

async function cmdGet(id) {
  const { data, error } = await sb
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) die(`Reminder not found: ${id}`);

  console.log(`\n${c.bold}Reminder${c.reset} ${c.dim}${data.id}${c.reset}\n`);

  const rows = [
    ["Phone",        data.phone],
    ["Name",         data.name ?? "—"],
    ["Status",       colourStatus(data.status)],
    ["Message",      data.message],
    ["Send at",      fmtDate(data.send_at)],
    ["Timezone",     data.timezone],
    ["Recurrence",   data.recurrence ?? "—"],
    ["Sent at",      data.sent_at ? fmtDate(data.sent_at) : "—"],
    ["ClickSend ID", data.clicksend_msg_id ?? "—"],
    ["Voice file",   data.voice_file ?? "—"],
    ["Error",        data.error_msg ?? "—"],
    ["Created",      fmtDate(data.created_at)],
    ["Updated",      fmtDate(data.updated_at)],
  ];

  const labelWidth = Math.max(...rows.map(([l]) => l.length));
  for (const [label, value] of rows) {
    console.log(
      `  ${c.bold}${label.padEnd(labelWidth)}${c.reset}  ${value}`
    );
  }
  console.log();
}

async function cmdLog(id) {
  // Verify reminder exists first
  const { data: reminder, error: rErr } = await sb
    .from("reminders")
    .select("id, phone, message")
    .eq("id", id)
    .single();
  if (rErr) die(`Reminder not found: ${id}`);

  const { data, error } = await sb
    .from("delivery_log")
    .select("*")
    .eq("reminder_id", id)
    .order("attempted_at", { ascending: false });
  if (error) die(error.message);

  console.log(`\n${c.bold}Delivery log${c.reset} for ${c.dim}${id}${c.reset}`);
  console.log(`${c.dim}Phone: ${reminder.phone}  Message: ${reminder.message.slice(0, 60)}…${c.reset}\n`);

  if (data.length === 0) {
    console.log(c.dim + "  No delivery attempts yet." + c.reset + "\n");
    return;
  }

  renderTable(data, [
    { header: "Attempted",   render: r => fmtDate(r.attempted_at) },
    { header: "Success",     render: r => r.success ? c.green + "yes" + c.reset : c.red + "no" + c.reset },
    { header: "HTTP",        render: r => String(r.http_status ?? "—") },
    { header: "Response",    render: r => r.response_body
        ? JSON.stringify(r.response_body).slice(0, 60) + "…"
        : "—" },
  ]);
  console.log();
}

async function cmdCreate({ phone, message, sendAt, timezone, recurrence, name }) {
  if (!phone)   die("--phone is required");
  if (!message) die("--message is required");
  if (!sendAt)  die("--send-at is required (ISO 8601, e.g. 2026-06-01T09:00:00+10:00)");

  info(`Creating reminder for ${phone}…`);

  const { data, error } = await sb
    .from("reminders")
    .insert({
      phone,
      message,
      send_at:    sendAt,
      timezone:   timezone   ?? "UTC",
      recurrence: recurrence ?? null,
      name:       name       ?? null,
    })
    .select("id, phone, message, send_at, status")
    .single();

  if (error) die(error.message);

  ok(`Created — ID: ${c.cyan}${data.id}${c.reset}`);
  console.log(`   Phone:   ${data.phone}`);
  console.log(`   Message: ${data.message}`);
  console.log(`   Send at: ${fmtDate(data.send_at)}`);
  console.log(`   Status:  ${colourStatus(data.status)}\n`);
}

async function cmdEdit(id, updates) {
  if (Object.keys(updates).length === 0) {
    die("Provide at least one field to update: --message, --send-at, --recurrence, --phone, --name");
  }

  const { data, error } = await sb
    .from("reminders")
    .update(updates)
    .eq("id", id)
    .select("id, phone, message, send_at, status")
    .single();

  if (error) die(error.message);

  ok(`Updated ${c.cyan}${id}${c.reset}`);
  for (const [k, v] of Object.entries(updates)) {
    console.log(`   ${k}: ${v}`);
  }
  console.log();
}

async function cmdCancel(id) {
  const { data: existing } = await sb
    .from("reminders").select("status").eq("id", id).single();

  if (!existing) die(`Reminder not found: ${id}`);
  if (existing.status !== "pending") {
    warn(`Reminder is already ${existing.status} — nothing changed.`);
    return;
  }

  const { error } = await sb
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) die(error.message);
  ok(`Cancelled ${c.cyan}${id}${c.reset}\n`);
}

async function cmdDelete(id) {
  // Confirm before hard-deleting
  const rl = readline.createInterface({ input, output: process.stdout });
  const answer = await rl.question(
    `${c.red}Delete reminder ${id}? This is irreversible. Type "yes" to confirm: ${c.reset}`
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "yes") {
    warn("Aborted — nothing deleted.\n");
    return;
  }

  const { error } = await sb.from("reminders").delete().eq("id", id);
  if (error) die(error.message);
  ok(`Deleted ${c.cyan}${id}${c.reset}\n`);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c.bold}reminders.js${c.reset} — SMS Reminders CLI

${c.bold}USAGE${c.reset}
  node scripts/reminders.js <command> [options]
  npm run reminders -- <command> [options]

${c.bold}COMMANDS${c.reset}

  ${c.cyan}list${c.reset}                            List pending reminders
  ${c.cyan}list${c.reset} --status=all               List all reminders
  ${c.cyan}list${c.reset} --status=sent              Filter by status (pending|sent|failed|cancelled)
  ${c.cyan}list${c.reset} --phone=+61412345678       Filter by phone number

  ${c.cyan}get${c.reset} <id>                        Show full details of one reminder
  ${c.cyan}log${c.reset} <id>                        Show delivery log for a reminder

  ${c.cyan}create${c.reset} --phone=+61412345678 \\
         --message="Your reminder text" \\
         --send-at="2026-06-01T09:00:00+10:00" \\
         [--timezone="Australia/Sydney"] \\
         [--name="Peter"] \\
         [--recurrence="0 9 * * 1"]

  ${c.cyan}edit${c.reset} <id> [--message="..."] [--send-at="..."] [--recurrence="..."]

  ${c.cyan}cancel${c.reset} <id>                     Mark reminder as cancelled (reversible via edit)
  ${c.cyan}delete${c.reset} <id>                     Hard-delete (irreversible, prompts for confirmation)

${c.bold}RECURRENCE${c.reset}
  Use standard cron expressions (minute hour day month weekday):
    "0 9 * * 1"     Every Monday at 9am
    "0 8 * * 1-5"   Weekdays at 8am
    "0 9 1 * *"     First of every month at 9am

${c.bold}STATUS VALUES${c.reset}
  ${c.yellow}pending${c.reset}     Scheduled, not yet sent
  ${c.green}sent${c.reset}        Successfully delivered
  ${c.red}failed${c.reset}      Delivery attempt failed (check: log <id>)
  ${c.gray}cancelled${c.reset}   Manually cancelled

${c.bold}EXAMPLES${c.reset}
  node scripts/reminders.js list
  node scripts/reminders.js list --status=failed
  node scripts/reminders.js create --phone="+61412345678" --message="Buy milk" --send-at="2026-06-01T09:00:00+10:00"
  node scripts/reminders.js get 3f2a1b0c-...
  node scripts/reminders.js edit 3f2a1b0c-... --send-at="2026-06-02T09:00:00+10:00"
  node scripts/reminders.js cancel 3f2a1b0c-...
  node scripts/reminders.js log 3f2a1b0c-...
`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    status:     { type: "string" },
    phone:      { type: "string" },
    message:    { type: "string" },
    "send-at":  { type: "string" },
    timezone:   { type: "string" },
    recurrence: { type: "string" },
    name:       { type: "string" },
    limit:      { type: "string" },
    help:       { type: "boolean", short: "h" },
  },
});

const [command, id] = positionals;

if (!command || values.help) {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "list":
    await cmdList({
      status: values.status ?? "pending",
      phone:  values.phone,
      limit:  values.limit ? parseInt(values.limit, 10) : 50,
    });
    break;

  case "get":
    if (!id) die("Usage: reminders.js get <id>");
    await cmdGet(id);
    break;

  case "log":
    if (!id) die("Usage: reminders.js log <id>");
    await cmdLog(id);
    break;

  case "create":
    await cmdCreate({
      phone:      values.phone,
      message:    values.message,
      sendAt:     values["send-at"],
      timezone:   values.timezone,
      recurrence: values.recurrence,
      name:       values.name,
    });
    break;

  case "edit":
    if (!id) die("Usage: reminders.js edit <id> [--message=...] [--send-at=...] ...");
    {
      const updates = {};
      if (values.message)    updates.message    = values.message;
      if (values["send-at"]) updates.send_at    = values["send-at"];
      if (values.recurrence) updates.recurrence = values.recurrence;
      if (values.phone)      updates.phone      = values.phone;
      if (values.name)       updates.name       = values.name;
      if (values.timezone)   updates.timezone   = values.timezone;
      await cmdEdit(id, updates);
    }
    break;

  case "cancel":
    if (!id) die("Usage: reminders.js cancel <id>");
    await cmdCancel(id);
    break;

  case "delete":
    if (!id) die("Usage: reminders.js delete <id>");
    await cmdDelete(id);
    break;

  default:
    console.error(`${c.red}Unknown command: ${command}${c.reset}`);
    printHelp();
    process.exit(1);
}
