/**
 * transcribe Edge Function
 *
 * Standalone transcription endpoint — useful for testing Whisper
 * separately from reminder creation, or for future use in a client app.
 *
 * POST /functions/v1/transcribe
 * Content-Type: multipart/form-data
 *   audio: <audio file>   (mp3, mp4, mpeg, mpga, m4a, wav, webm — max 25 MB)
 *
 * Returns: { text: "transcribed message..." }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const ALLOWED_TYPES = new Set([
  "audio/mpeg", "audio/mp4", "audio/mpga", "audio/wav",
  "audio/webm", "audio/ogg", "audio/x-m4a",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — OpenAI limit

serve(async (req: Request) => {
  // CORS preflight
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "Content-Type must be multipart/form-data" }, 400);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Could not parse multipart form" }, 400);
  }

  const audioFile = form.get("audio") as File | null;
  if (!audioFile) {
    return json({ error: "Missing 'audio' field in form data" }, 400);
  }

  // Validate type
  const mimeType = audioFile.type.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return json(
      {
        error: `Unsupported audio type '${mimeType}'. Allowed: mp3, mp4, m4a, wav, webm, ogg`,
      },
      415
    );
  }

  // Validate size
  if (audioFile.size > MAX_BYTES) {
    return json({ error: "Audio file exceeds 25 MB limit" }, 413);
  }

  // Determine language (optional query param)
  const url      = new URL(req.url);
  const language = url.searchParams.get("language") ?? "en";

  try {
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, audioFile.name || "audio.wav");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", language);
    whisperForm.append("response_format", "json");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      }
    );

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error(`Whisper API ${whisperRes.status}:`, errText);
      return json(
        { error: `Whisper API error: ${whisperRes.status}` },
        502
      );
    }

    const { text } = await whisperRes.json();

    return json({
      text:     text.trim(),
      language,
      duration: audioFile.size,  // size as proxy; replace with actual if needed
    });

  } catch (err: unknown) {
    console.error("transcribe error:", err);
    return json({ error: "Internal server error" }, 500);
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
