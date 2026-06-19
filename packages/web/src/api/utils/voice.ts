/**
 * Voice utilities:
 *  - STT: Whisper (OpenAI API) — voice → text
 *  - TTS: ElevenLabs API       — text  → audio buffer
 */

// ─── STT: OpenAI Whisper ──────────────────────────────────────────────────────

/**
 * Transcribe raw audio bytes (ogg/mp3/wav/m4a) to text via OpenAI Whisper.
 * Uses multipart/form-data as required by the Whisper endpoint.
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  mimeType = "audio/ogg",
  filename = "voice.ogg",
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
  form.append("model", "whisper-1");
  form.append("language", "uz"); // Uzbek; fallback to auto-detect if needed

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    // If Uzbek is not supported well, retry without language hint
    if (err.includes("language") || err.includes("unsupported")) {
      const form2 = new FormData();
      form2.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
      form2.append("model", "whisper-1");
      const res2 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form2,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res2.ok) throw new Error(`Whisper error: ${await res2.text()}`);
      const data2 = await res2.json() as { text: string };
      return data2.text?.trim() ?? "";
    }
    throw new Error(`Whisper error: ${err}`);
  }

  const data = await res.json() as { text: string };
  return data.text?.trim() ?? "";
}

// ─── TTS: ElevenLabs ─────────────────────────────────────────────────────────

/**
 * Convert text to speech using ElevenLabs API.
 * Returns raw MP3 audio as ArrayBuffer.
 *
 * Default voice: multilingual v2 model, "Rachel" voice (supports Uzbek/Russian/etc)
 * Set ELEVENLABS_VOICE_ID env to override the voice.
 */
export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  // Truncate to 5000 chars (ElevenLabs limit per request)
  const truncated = text.length > 4800 ? text.slice(0, 4800) + "..." : text;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: truncated,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS error: ${err}`);
  }

  return res.arrayBuffer();
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

/**
 * Download a Telegram file by file_id.
 * Returns { buffer, mimeType }.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<{ buffer: ArrayBuffer; mimeType: string; fileName: string }> {
  // Step 1: get file path
  const infoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!infoRes.ok) throw new Error(`getFile failed: ${await infoRes.text()}`);
  const info = await infoRes.json() as { ok: boolean; result: { file_path: string } };
  const filePath = info.result.file_path;

  // Step 2: download binary
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!fileRes.ok) throw new Error(`file download failed: ${fileRes.status}`);
  const buffer = await fileRes.arrayBuffer();

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "ogg";
  const mimeMap: Record<string, string> = {
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };

  return {
    buffer,
    mimeType: mimeMap[ext] ?? "audio/ogg",
    fileName: `voice.${ext}`,
  };
}
