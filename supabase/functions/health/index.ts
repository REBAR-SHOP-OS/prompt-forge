import { corsHeaders, jsonResponse } from "../_shared/utils.ts";

const VERSION = "0.1.0-foundation";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return jsonResponse({
    status: "ok",
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});
