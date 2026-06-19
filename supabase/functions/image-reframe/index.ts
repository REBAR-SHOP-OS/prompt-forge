// Image Reframe edge function: takes an image URL + a target aspect ratio
// (9:16, 1:1, 16:9) and asks Nano Banana to outpaint the original image to
// the target ratio. We send a small reference PNG at the exact target
// dimensions as the LAST image so the model adopts that aspect ratio
// (per Gemini 2.5 Flash Image guidance).
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
// deno-lint-ignore-file no-explicit-any

const TARGETS: Record<string, { label: string; w: number; h: number }> = {
  "9:16": { label: "9:16 vertical", w: 1080, h: 1920 },
  "1:1":  { label: "1:1 square",    w: 1080, h: 1080 },
  "16:9": { label: "16:9 horizontal", w: 1920, h: 1080 },
};

function isAllowedImageUrl(u: string): boolean {
  try {
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const allowed = [supabaseHost, ".supabase.co", ".supabase.in"].filter(Boolean);
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    return allowed.some((s) => (s.startsWith(".") ? h.endsWith(s) : h === s));
  } catch { return false; }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

// CRC32 for PNG chunk integrity.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(buf: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Build a tiny solid-gray PNG of given width/height, with no compression
// (stored deflate blocks). This is enough for the model to read the
// aspect ratio from the reference image.
function makeRefPng(width: number, height: number): Uint8Array {
  // Downscale to keep payload small while preserving the ratio.
  const max = 256;
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));

  // Raw image: 1 filter byte (0) per row + w gray bytes (128).
  const raw = new Uint8Array(h * (1 + w));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w)] = 0;
    for (let x = 0; x < w; x++) raw[y * (1 + w) + 1 + x] = 0x80;
  }

  // zlib stream with stored (uncompressed) deflate blocks.
  const MAX = 65535;
  const blocks: Uint8Array[] = [];
  for (let off = 0; off < raw.length; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const last = (off + len >= raw.length) ? 1 : 0;
    const hdr = new Uint8Array(5);
    hdr[0] = last;
    hdr[1] = len & 0xff;
    hdr[2] = (len >>> 8) & 0xff;
    hdr[3] = (~len) & 0xff;
    hdr[4] = ((~len) >>> 8) & 0xff;
    blocks.push(hdr, raw.subarray(off, off + len));
  }
  const deflateLen = blocks.reduce((n, b) => n + b.length, 0);
  const ad = adler32(raw);
  const zlib = new Uint8Array(2 + deflateLen + 4);
  zlib[0] = 0x78; zlib[1] = 0x01;
  let p = 2;
  for (const b of blocks) { zlib.set(b, p); p += b.length; }
  zlib[p++] = (ad >>> 24) & 0xff;
  zlib[p++] = (ad >>> 16) & 0xff;
  zlib[p++] = (ad >>> 8) & 0xff;
  zlib[p++] = ad & 0xff;

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + data.length + 4);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
    out.set(data, 8);
    const crcBuf = out.subarray(4, 8 + data.length);
    dv.setUint32(8 + data.length, crc32(crcBuf));
    return out;
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dvi = new DataView(ihdr.buffer);
  dvi.setUint32(0, w);
  dvi.setUint32(4, h);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 0;   // grayscale
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", zlib);
  const iendChunk = chunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let q = 0;
  out.set(sig, q); q += sig.length;
  out.set(ihdrChunk, q); q += ihdrChunk.length;
  out.set(idatChunk, q); q += idatChunk.length;
  out.set(iendChunk, q);
  return out;
}

// Read width/height from PNG/JPEG/WebP byte streams. Returns null if unknown.
function readImageDims(bytes: Uint8Array): { w: number; h: number } | null {
  // PNG
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // JPEG
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      i += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const segLen = dv.getUint16(i);
      // SOFn markers (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = dv.getUint16(i + 3);
        const w = dv.getUint16(i + 5);
        return { w, h };
      }
      i += segLen;
    }
    return null;
  }
  // WebP
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    // VP8 / VP8L / VP8X
    const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (tag === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { w, h };
    } else if (tag === "VP8L") {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { w, h };
    } else if (tag === "VP8 ") {
      const w = dv.getUint16(26, true) & 0x3fff;
      const h = dv.getUint16(28, true) & 0x3fff;
      return { w, h };
    }
  }
  return null;
}

async function callNanoBanana(apiKey: string, srcDataUrl: string, target: { label: string; w: number; h: number }, ratio: string, strict: boolean) {
  const instruction = [
    `Reframe the provided image to a ${target.label} canvas (${target.w}x${target.h}, exact ${ratio} aspect ratio).`,
    `Preserve the ENTIRE original image content — every subject, logo, text, button, and graphic element must remain fully visible, uncropped, undistorted, and at the same proportions.`,
    `Fill the newly added space by OUTPAINTING the existing background — extend the same colors, gradients, lighting, particles, textures, and surroundings so the result looks like one cohesive ${ratio} composition.`,
    `Do NOT add letterboxing, black bars, borders, frames, watermarks, captions, or any new text.`,
    `Do NOT crop, zoom, recompose, or move the original subject. Keep it centered horizontally and vertically inside the new canvas.`,
    strict
      ? `CRITICAL: the output image MUST have true ${ratio} pixel dimensions (target ${target.w}x${target.h}). Do NOT return the source aspect ratio. Return exactly one image.`
      : `Return one image at exactly ${ratio} aspect ratio.`,
  ].join(" ");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      modalities: ["image", "text"],
      // Gemini-native image config (passed through by the AI gateway).
      responseFormat: {
        image: {
          aspectRatio: ratio,
          imageSize: "1K",
        },
      },
      // OpenAI-compatible alias, just in case the gateway prefers snake_case.
      response_format: {
        image: {
          aspect_ratio: ratio,
          image_size: "1K",
        },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: srcDataUrl } },
          ],
        },
      ],
    }),
  });
  return resp;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio.trim() : "";

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return new Response(JSON.stringify({ error: "valid imageUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const target = TARGETS[aspectRatio];
    if (!target) {
      return new Response(JSON.stringify({ error: "aspectRatio must be one of 9:16, 1:1, 16:9" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Source image
    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) {
      return new Response(JSON.stringify({ error: "Could not fetch source image" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());
    let srcMime = srcResp.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!/^image\/(png|jpe?g|webp)$/i.test(srcMime)) srcMime = "image/png";
    const srcDataUrl = `data:${srcMime};base64,${bytesToBase64(srcBytes)}`;

    // 2) Call Nano Banana 2 with explicit aspect ratio in responseFormat,
    //    with one retry if the returned image's pixel ratio is wrong.
    const tolerance = 0.06;
    const targetRatio = target.w / target.h;
    let lastDataUrl = "";
    let lastBytes: Uint8Array | null = null;
    let lastMime = "image/png";

    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await callNanoBanana(apiKey, srcDataUrl, target, aspectRatio, attempt === 1);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error("image-reframe gateway error", resp.status, text);
        return new Response(JSON.stringify({ error: `AI gateway error (${resp.status})` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await resp.json();
      const dataUrl: string = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
      const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) {
        console.error("image-reframe: no image returned", JSON.stringify(data).slice(0, 400));
        return new Response(JSON.stringify({ error: "Model did not return an image" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mimeType = m[1];
      const bytes = decodeBase64(m[2]);
      lastDataUrl = dataUrl; lastBytes = bytes; lastMime = mimeType;

      const dims = readImageDims(bytes);
      if (!dims) break; // can't verify, accept
      const got = dims.w / dims.h;
      const ok = Math.abs(got - targetRatio) / targetRatio <= tolerance;
      console.log(`image-reframe attempt ${attempt + 1}: dims ${dims.w}x${dims.h} ratio ${got.toFixed(3)} target ${targetRatio.toFixed(3)} ok=${ok}`);
      if (ok) break;
      if (attempt === 1) {
        return new Response(JSON.stringify({
          error: `Model returned ${dims.w}x${dims.h} which does not match ${aspectRatio}. Please try again.`,
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!lastBytes) {
      return new Response(JSON.stringify({ error: "Model did not return an image" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = lastMime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const svc = getServiceClient();
    // Upload into wan-frames so the resulting URL is accepted by the
    // jobs-create validator (which only allows your own wan-frames/{userId}/...).
    // Include an unguessable random component so object paths cannot be enumerated.
    const path = `${auth.userId}/reframed-${Date.now()}-${aspectRatio.replace(":", "x")}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await svc.storage.from("wan-frames").upload(path, lastBytes, {
      contentType: lastMime, upsert: false,
    });
    if (upErr) {
      console.error("image-reframe upload failed", upErr.message);
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // wan-frames is a PRIVATE bucket — return a signed URL the client can render
    // and re-submit as a start frame.
    const { data: signed, error: signErr } = await svc.storage
      .from("wan-frames")
      .createSignedUrl(path, 60 * 60 * 6);
    if (signErr || !signed?.signedUrl) {
      console.error("image-reframe sign failed", signErr?.message);
      return new Response(JSON.stringify({ error: "Could not sign result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ publicUrl: signed.signedUrl, path, aspectRatio }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("image-reframe unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
