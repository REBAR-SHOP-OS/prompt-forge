import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aiGateway } from "../_shared/modules/external-api-adapter/service.ts";

/** Snapshot and clear env vars that leak from the host shell into tests. */
function isolateEnv(): () => void {
  const keys = [
    "LOCAL_VIDEO_ROUTER_URL",
    "LOCAL_VIDEO_ROUTER_TYPE",
    "LOCAL_VIDEO_ROUTER_CREATE_PATH",
    "LOCAL_VIDEO_ROUTER_STATUS_PATH",
    "LOCAL_VIDEO_ROUTER_OUTPUT_PATH",
    "LOCAL_VIDEO_ROUTER_TIMEOUT_MS",
    "LOCAL_VIDEO_COMFY_WORKFLOW_JSON",
    "LOCAL_VIDEO_ROUTER_TOKEN",
    "ALLOW_LOCAL_VIDEO_HTTP",
    "ALLOW_LOCAL_VIDEO_LOOPBACK",
  ];
  const snapshot = new Map<string, string | undefined>();
  for (const k of keys) snapshot.set(k, Deno.env.get(k));
  for (const k of keys) Deno.env.delete(k);
  return () => {
    for (const k of keys) {
      const v = snapshot.get(k);
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  };
}

Deno.test("local video router 404 on /videos/generations falls back to /videos", async () => {
  const restoreEnv = isolateEnv();
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example/v1");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "openai_compatible");
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
    restoreEnv();
  }
});

Deno.test("flow route never resolves retired Veo 3.0 model ids", async () => {
  const fakeClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { provider_key: "flow", default_model: "flow-video-1", enabled: true },
            error: null,
          }),
        }),
      }),
    }),
  };

  const fast = await aiGateway.resolveRoute(
    fakeClient,
    "flow",
    "veo-3.0-fast-generate-001",
    "test prompt",
    { durationSeconds: 5 },
  );
  assertEquals(fast.resolvedModel, "veo-3.1-fast-generate-preview");

  const standard = await aiGateway.resolveRoute(
    fakeClient,
    "flow",
    "veo-3.0-generate-001",
    "test prompt",
    { durationSeconds: 5 },
  );
  assertEquals(standard.resolvedModel, "veo-3.1-generate-preview");

  const extended = await aiGateway.resolveRoute(
    fakeClient,
    "flow",
    "flow-video-1",
    "test prompt",
    { durationSeconds: 15 },
  );
  assertEquals(extended.resolvedModel, "veo-3.1-generate-preview");
});

Deno.test("local video status probes the ComfyUI create endpoint with POST", async () => {
  const restoreEnv = isolateEnv();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; body: string }> = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "comfyui");
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
    restoreEnv();
  }
});

Deno.test("local video router ComfyUI falls back through common prompt endpoints", async () => {
  const restoreEnv = isolateEnv();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "comfyui");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", "1000");
  Deno.env.set(
    "LOCAL_VIDEO_COMFY_WORKFLOW_JSON",
    JSON.stringify({
      "1": { inputs: { text: "{{PROMPT}}" }, class_type: "CLIPTextEncode" },
    }),
  );

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ method, url });
    if (url === "https://router.example/prompt" || url === "https://router.example/prompt/") {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ prompt_id: "queue_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const result = await aiGateway.startGeneration("local", "local/ltx-video-i2v", {
      prompt: "test comfyui local video",
      firstFrameUrl: "https://frames.example/start.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    assertEquals(requests, [
      { method: "POST", url: "https://router.example/prompt" },
      { method: "POST", url: "https://router.example/prompt/" },
      { method: "POST", url: "https://router.example/api/prompt" },
    ]);
    assertEquals(result.providerJobId, "localcomfy:queue_1");
    assertEquals(result.isComplete, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

Deno.test("local video router ComfyUI retries prompt endpoint with trailing slash", async () => {
  const restoreEnv = isolateEnv();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "comfyui");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", "1000");
  Deno.env.set(
    "LOCAL_VIDEO_COMFY_WORKFLOW_JSON",
    JSON.stringify({
      "1": { inputs: { text: "{{PROMPT}}" }, class_type: "CLIPTextEncode" },
    }),
  );

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ method, url });
    if (url === "https://router.example/prompt") {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }
    if (url === "https://router.example/prompt/") {
      return Promise.resolve(
        new Response(JSON.stringify({ prompt_id: "queue_slash_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  }) as typeof fetch;

  try {
    const result = await aiGateway.startGeneration("local", "local/ltx-video-i2v", {
      prompt: "test comfyui local video slash fallback",
      firstFrameUrl: "https://frames.example/start.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    assertEquals(requests, [
      { method: "POST", url: "https://router.example/prompt" },
      { method: "POST", url: "https://router.example/prompt/" },
    ]);
    assertEquals(result.providerJobId, "localcomfy:queue_slash_1");
    assertEquals(result.isComplete, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

Deno.test("local video router ComfyUI tries proxied /comfy prompt endpoint", async () => {
  const restoreEnv = isolateEnv();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];

  Deno.env.set("LOCAL_VIDEO_ROUTER_URL", "https://router.example");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TYPE", "comfyui");
  Deno.env.set("LOCAL_VIDEO_ROUTER_TIMEOUT_MS", "1000");
  Deno.env.set(
    "LOCAL_VIDEO_COMFY_WORKFLOW_JSON",
    JSON.stringify({
      "1": { inputs: { text: "{{PROMPT}}" }, class_type: "CLIPTextEncode" },
    }),
  );
  Deno.env.set("LOCAL_VIDEO_ROUTER_CREATE_PATH", "/comfy/prompt");

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ method, url });
    if (url !== "https://router.example/comfy/prompt") {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ prompt_id: "proxied_queue_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const result = await aiGateway.startGeneration("local", "local/ltx-video-i2v", {
      prompt: "test proxied comfyui local video",
      firstFrameUrl: "https://frames.example/start.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
    });

    assertEquals(requests, [
      { method: "POST", url: "https://router.example/comfy/prompt" },
    ]);
    assertEquals(result.providerJobId, "localcomfy:proxied_queue_1");
    assertEquals(result.isComplete, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
