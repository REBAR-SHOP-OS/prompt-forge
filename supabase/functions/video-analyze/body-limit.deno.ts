import {
  readResponseBytesWithLimit,
  ResponseBodyTooLargeError,
} from "./body-limit.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("video analysis rejects an oversized content-length before buffering", async () => {
  const response = new Response("small", {
    headers: { "content-length": "11" },
  });
  let rejected = false;
  try {
    await readResponseBytesWithLimit(response, 10);
  } catch (error) {
    rejected = error instanceof ResponseBodyTooLargeError;
  }
  assert(rejected, "oversized declared response was accepted");
});

Deno.test("video analysis cancels an oversized stream as soon as the limit is crossed", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
    },
    cancel() {
      cancelled = true;
    },
  });
  let rejected = false;
  try {
    await readResponseBytesWithLimit(new Response(stream), 5);
  } catch (error) {
    rejected = error instanceof ResponseBodyTooLargeError;
  }
  assert(rejected, "oversized streamed response was accepted");
  assert(cancelled, "oversized stream was not cancelled");
});

Deno.test("video analysis returns bytes unchanged within the bound", async () => {
  const bytes = await readResponseBytesWithLimit(
    new Response(new Uint8Array([1, 2, 3, 4])),
    4,
  );
  assert(bytes.byteLength === 4, "bounded response length changed");
  assert(bytes[0] === 1 && bytes[3] === 4, "bounded response bytes changed");
});
