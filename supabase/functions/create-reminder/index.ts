// @supabase.auth: false
/**
 * create-reminder Edge Function
 *
 * POST /functions/v1/create-reminder
 *
 * Accepts either:
 *   (a) JSON body  { phone, message, send_at, timezone?, recurrence?, name? }
 *   (b) multipart/form-data with an "audio" file → Whisper transcribes it,
 *       then same fields (phone, send_at, etc.) from the form fields.
 *
 * Returns: { id, phone, message, send_at, status }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY      = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Whisper transcription ─────────────────────────────────────────────────────

async function transcribeAudio(audioBlob: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, filename);
  form.append("model", "whisper-1");
  form.append("language", "en");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.text as string).trim();
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone);
}

function isValidSendAt(sendAt: string): boolean {
  const d = new Date(sendAt);
  return !isNaN(d.getTime()) && d > new Date();
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let phone: string, send_at: string, name: string | undefined,
        timezone: string | undefined, recurrence: string | undefined,
        message: string | undefined, voice_file: string | undefined;

    // ── Branch: multipart (audio upload) ─────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      phone      = form.get("phone") as string;
      send_at    = form.get("send_at") as string;
      name       = form.get("name") as string | undefined;
      timezone   = form.get("timezone") as string | undefined;
      recurrence = form.get("recurrence") as string | undefined;

      const audioFile = form.get("audio") as File | null;
      if (!audioFile) {
        return json({ error: "multipart request must include an 'audio' file" }, 400);
      }

      // Optional: store original audio in Supabase Storage
      const storageKey = `voice/${Date.now()}_${audioFile.name}`;
      const { error: storageErr } = await supabase.storage
        .from("voice-uploads")
        .upload(storageKey, audioFile, { contentType: audioFile.type, upsert: false });

      if (storageErr) {
        console.warn("Storage upload failed (non-fatal):", storageErr.message);
      } else {
        voice_file = storageKey;
      }

      // Transcribe with Whisper
      message = await transcribeAudio(audioFile, audioFile.name);

      if (!message || message.length === 0) {
        return json({ error: "Whisper could not transcribe audio — please try again" }, 422);
      }

    // ── Branch: JSON body ─────────────────────────────────────────────────────
    } else {
      const body = await req.json();
      phone      = body.phone;
      message    = body.message;
      send_at    = body.send_at;
      name       = body.name;
      timezone   = body.timezone;
      recurrence = body.recurrence;
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    const errors: string[] = [];
    if (!phone)               errors.push("phone is required");
    else if (!isValidPhone(phone)) errors.push("phone must be E.164 format (e.g. +61412345678)");
    if (!message)             errors.push("message is required");
    else if (message.length > 1600) errors.push("message must be ≤ 1600 characters");
    if (!send_at)             errors.push("send_at is required (ISO 8601)");
    else if (!isValidSendAt(send_at)) errors.push("send_at must be a future datetime");

    if (errors.length > 0) {
      return json({ error: errors.join("; ") }, 400);
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        phone,
        message,
        send_at,
        name:       name       ?? null,
        timezone:   timezone   ?? "UTC",
        recurrence: recurrence ?? null,
        voice_file: voice_file ?? null,
      })
      .select("id, phone, message, send_at, status")
      .single();

    if (error) throw error;

    return json(data, 201);

  } catch (err: unknown) {
    console.error("create-reminder error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
