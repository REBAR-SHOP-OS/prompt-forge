import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aiGateway } from "../_shared/modules/external-api-adapter/service.ts";

Deno.test("local video router 404 on /videos/generations falls back to /videos", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = Deno.env.get("LOCAL_VIDEO_ROUTER_URL");
  const previousPath = Deno.env.get("LOCAL_VIDEO_ROUTER_CREATE_PATH");
  const previousTimeout = Deno.env.get("LOCAL_VIDEO_ROUTER_TIMEOUT_MS");
  const requestedUrls: string[] = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example/v1");
  Deno.env.delete("LOCAL_VIDEO_ROUTER_CREATE_PATH");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", "1000");

  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith("/videos/generations")) {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ id: "job_123", status: "queued" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const result = await aiGateway.startGeneration("local", "local/wan-2.1-i2v", {
      prompt: "test local video",
      firstFrameUrl: "https://frames.example/start.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    assertEquals(requestedUrls, [
      "https://router.example/v1/videos/generations",
      "https://router.example/v1/videos",
    ]);
    assertEquals(result.providerJobId, "local:job_123");
    assertEquals(result.isComplete, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_URL");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_URL", previousUrl);
    if (previousPath === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_CREATE_PATH");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_CREATE_PATH", previousPath);
    if (previousTimeout === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_TIMEOUT_MS");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", previousTimeout);
  }
});

Deno.test("local video status probes the ComfyUI create endpoint with POST", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = Deno.env.get("LOCAL_VIDEO_ROUTER_URL");
  const previousType = Deno.env.get("LOCAL_VIDEO_ROUTER_TYPE");
  const previousPath = Deno.env.get("LOCAL_VIDEO_ROUTER_CREATE_PATH");
  const previousTimeout = Deno.env.get("LOCAL_VIDEO_ROUTER_TIMEOUT_MS");
  const requests: Array<{ method: string; url: string; body: string }> = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "comfyui");
  Deno.env.delete("LOCAL_VIDEO_ROUTER_CREATE_PATH");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", "1000");

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    requests.push({ method, url, body });
    return Promise.resolve(
      new Response(JSON.stringify({ error: "bad workflow" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const result = await aiGateway.localVideoStatus(true);

    assertEquals(requests, [
      {
        method: "POST",
        url: "https://router.example/prompt",
        body: JSON.stringify({ prompt: {}, client_id: "local-video-status-probe" }),
      },
    ]);
    assertEquals(result.status, "configured");
    assertEquals(result.reachable, true);
    assertEquals(result.create_endpoint_found, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_URL");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_URL", previousUrl);
    if (previousType === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_TYPE");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", previousType);
    if (previousPath === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_CREATE_PATH");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_CREATE_PATH", previousPath);
    if (previousTimeout === undefined) Deno.env.delete("LOCAL_VIDEO_ROUTER_TIMEOUT_MS");
    else Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", previousTimeout);
  }
});
