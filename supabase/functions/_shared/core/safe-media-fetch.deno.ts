import { fetchBoundedStorageObject, storageObjectUrl } from "./safe-media-fetch.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ref = { bucket: "user-videos", path: "user id/clip one.mp4", canonical: "user-videos/user id/clip one.mp4" };

Deno.test("canonical storage URL encodes every untrusted segment", () => {
  const url = storageObjectUrl("https://project.supabase.co", ref);
  assert(url === "https://project.supabase.co/storage/v1/object/user-videos/user%20id/clip%20one.mp4", url);
});

Deno.test("bounded fetch disables redirects and uses service authentication", async () => {
  let init: RequestInit | undefined;
  const fetchImpl = ((_input: RequestInfo | URL, value?: RequestInit) => {
    init = value;
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-length": "3", "content-type": "video/mp4" },
    }));
  }) as typeof fetch;
  const result = await fetchBoundedStorageObject({
    origin: "https://project.supabase.co",
    serviceKey: "service",
    ref,
    maxBytes: 4,
    timeoutMs: 1000,
    fetchImpl,
  });
  assert(init?.redirect === "error", "redirects must fail closed");
  assert(new Headers(init?.headers).get("authorization") === "Bearer service", "service auth missing");
  assert(result.bytes.byteLength === 3, "unexpected byte count");
});

Deno.test("bounded fetch rejects an oversized declared response", async () => {
  const fetchImpl = (() => Promise.resolve(new Response(new Uint8Array([1]), {
    status: 200,
    headers: { "content-length": "99" },
  }))) as typeof fetch;
  let status = 0;
  try {
    await fetchBoundedStorageObject({ origin: "https://project.supabase.co", serviceKey: "s", ref, maxBytes: 4, timeoutMs: 1000, fetchImpl });
  } catch (error) { status = (error as { status?: number }).status ?? 0; }
  assert(status === 413, `expected 413, got ${status}`);
});
