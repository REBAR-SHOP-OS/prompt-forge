import {
  decodedBase64Size,
  MAX_MEDIA_BYTES,
  parseOwnedTranscriptMedia,
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "./security.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const origin = "https://project.supabase.co";
const user = "11111111-1111-4111-8111-111111111111";

Deno.test("transcript media accepts only caller-owned project storage", () => {
  const owned = `${origin}/storage/v1/object/sign/merged-videos/${user}/film.mp4?token=x`;
  assert(parseOwnedTranscriptMedia(owned, origin, user)?.path === `${user}/film.mp4`, "owned media rejected");
  assert(parseOwnedTranscriptMedia(`https://evil.example/video.mp4`, origin, user) === null, "foreign origin accepted");
  assert(parseOwnedTranscriptMedia(`${origin}/storage/v1/object/sign/merged-videos/other/film.mp4`, origin, user) === null, "foreign owner accepted");
  assert(parseOwnedTranscriptMedia(`${origin}/storage/v1/object/sign/admin/${user}/film.mp4`, origin, user) === null, "foreign bucket accepted");
});

Deno.test("base64 size is checked before decoding", () => {
  assert(decodedBase64Size("YQ==") === 1, "base64 size mismatch");
  const oversized = "a".repeat(Math.ceil((MAX_MEDIA_BYTES + 1) * 4 / 3));
  assert(decodedBase64Size(oversized) > MAX_MEDIA_BYTES, "oversized payload was not detected");
});

Deno.test("request body rejects an oversized declared length before buffering", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": "5" },
    body: "tiny",
  });
  let rejected = false;
  try { await readBoundedRequestText(request, 4); } catch (error) { rejected = error instanceof RequestBodyTooLargeError; }
  assert(rejected, "oversized declared body was accepted");
});

Deno.test("request body stream is bounded even without content-length", async () => {
  const request = new Request("https://example.test", { method: "POST", body: "12345" });
  let rejected = false;
  try { await readBoundedRequestText(request, 4); } catch (error) { rejected = error instanceof RequestBodyTooLargeError; }
  assert(rejected, "oversized streamed body was accepted");

  const accepted = await readBoundedRequestText(
    new Request("https://example.test", { method: "POST", body: "1234" }),
    4,
  );
  assert(accepted === "1234", "bounded body changed content");
});
