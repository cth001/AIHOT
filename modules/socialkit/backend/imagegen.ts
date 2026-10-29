// Text-to-image through any OpenAI-compatible /images/generations endpoint (OpenAI gpt-image, Zhipu CogView,
// SiliconFlow FLUX or Kolors …), chosen by IMAGE_BASE_URL, IMAGE_API_KEY and IMAGE_MODEL. A paid request with
// a receipt like every model call: the picture is saved to disk before the receipt completes, so a retry or
// a restart reuses what was paid for. Model calls stop with MODEL_CALLS_ENABLED.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, credential } from "@aihot/backend/config";
import { assertAccepted, ModelUnavailableError, paidRequest } from "@aihot/backend/providers/receipts";

export const ART_DIR = path.join(config.dataDir, "socialkit-art");

export function imageSettings() {
  const base = credential("models", "IMAGE_BASE_URL");
  const key = credential("models", "IMAGE_API_KEY");
  const model = credential("models", "IMAGE_MODEL");
  if (!base || !key || !model) return null;
  return { base: base.replace(/\/+$/, ""), key, model, size: credential("models", "IMAGE_SIZE") ?? "1024x1024" };
}

/** A safe file name for an illustration: its content's hash. */
const fileFor = (bytes: Buffer) => `${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.png`;

/** Saved as PNG whatever the model sent (JPEG, WebP …), at most 1536 px on a side: the image templates read PNG. */
async function save(raw: Buffer): Promise<string> {
  const bytes = await sharp(raw).resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  await mkdir(ART_DIR, { recursive: true });
  const file = fileFor(bytes);
  const tmp = path.join(ART_DIR, `${file}.${process.pid}.tmp`);
  await writeFile(tmp, bytes);
  await rename(tmp, path.join(ART_DIR, file));
  return file;
}

export async function artExists(file: string): Promise<boolean> {
  return /^[0-9a-f]{32}\.png$/.test(file) && (await readFile(path.join(ART_DIR, file)).then(() => true, () => false));
}

export function readArt(file: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{32}\.png$/.test(file)) return Promise.resolve(null);
  return readFile(path.join(ART_DIR, file)).catch(() => null);
}

/** Draws one illustration: its file name under ART_DIR, and the receipt the caller completes once it is stored. */
export async function drawImage(prompt: string, opts: { purpose: string; subject: string }): Promise<{ file: string; receiptId: number }> {
  const settings = imageSettings();
  if (!settings) throw new ModelUnavailableError("No text-to-image model (IMAGE_BASE_URL, IMAGE_API_KEY, IMAGE_MODEL)");
  if (!config.modelCallsEnabled) throw new ModelUnavailableError("Model calls are disabled (MODEL_CALLS_ENABLED=false)");
  const request = { service: "image", model: settings.model, purpose: opts.purpose, subject: opts.subject, identity: { model: settings.model, size: settings.size, prompt } };
  const draw = (attemptTag?: string) => paidRequest({ ...request, attemptTag, requestSummary: { model: settings.model, size: settings.size } }, async () => {
    // Like the chat models (providers/llm.ts), the endpoint is the operator's own choice, a self-hosted one included.
    const res = await fetch(`${settings.base}/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.key}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ model: settings.model, prompt, size: settings.size, n: 1 }),
      signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    assertAccepted("image", res.status, text);
    const first = JSON.parse(text)?.data?.[0] ?? {};
    let bytes: Buffer;
    if (first.b64_json) bytes = Buffer.from(String(first.b64_json), "base64");
    else if (first.url) {
      const picture = await fetch(String(first.url), { signal: AbortSignal.timeout(60_000) });
      if (!picture.ok) throw new Error(`generated image: HTTP ${picture.status}`);
      bytes = Buffer.from(await picture.arrayBuffer());
    }
    else throw new Error("the image model answered without an image");
    return { response: { file: await save(bytes) }, usage: { bytes: bytes.length } };
  });
  const receipt = await draw();
  const file = String((receipt.response as { file?: string })?.file ?? "");
  if (await artExists(file)) return { file, receiptId: receipt.receiptId };
  // The paid picture's file is gone (the data folder was cleared): draw it again under a new attempt.
  const again = await draw(`redraw-${Date.now()}`);
  return { file: String((again.response as { file?: string }).file), receiptId: again.receiptId };
}
