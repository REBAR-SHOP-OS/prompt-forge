// Diagnostic: verify Synology NAS SSH/SFTP connectivity, permissions and free space.
// Read-only style check. Writes a tiny temp file via SFTP then removes it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  readSynologyConfig,
  connect,
  exec,
  sftp,
  sftpMkdirP,
  sftpPut,
  sftpStat,
  sftpRemove,
  getMediaBasePath,
} from "../_shared/synology-ssh.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const result: Record<string, unknown> = { ok: false, steps: {} };
  const steps = result.steps as Record<string, unknown>;

  const cfg = readSynologyConfig();
  if (!cfg) {
    result.error = "Missing Synology SSH secrets (host/user/private key).";
    return new Response(JSON.stringify(result), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  steps.config = { host: cfg.host, port: cfg.port, username: cfg.username, hasPassphrase: !!cfg.passphrase };

  let conn;
  try {
    conn = await connect(cfg);
    steps.connect = "ok";
  } catch (e) {
    steps.connect = `failed: ${e instanceof Error ? e.message : String(e)}`;
    return new Response(JSON.stringify(result), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // whoami + groups (confirm administrators group + real shell)
    try {
      const who = await exec(conn, "id; whoami", 15_000);
      steps.identity = { code: who.code, stdout: who.stdout.trim(), stderr: who.stderr.trim() };
    } catch (e) {
      steps.identity = `failed: ${e instanceof Error ? e.message : String(e)}`;
    }

    const base = getMediaBasePath();
    steps.mediaBasePath = base;

    // free space
    try {
      const df = await exec(conn, `df -h ${base.split("/").slice(0, 3).join("/")} 2>/dev/null || df -h /volume1`, 15_000);
      steps.diskFree = { code: df.code, stdout: df.stdout.trim() };
    } catch (e) {
      steps.diskFree = `failed: ${e instanceof Error ? e.message : String(e)}`;
    }

    // SFTP write/read/delete round-trip
    const sftpClient = await sftp(conn);
    const testDir = `${base}/_healthcheck`;
    const testPath = `${testDir}/probe-${Date.now()}.bin`;
    const payload = new TextEncoder().encode("synology-healthcheck");

    await sftpMkdirP(sftpClient, testDir);
    steps.mkdir = "ok";
    await sftpPut(sftpClient, testPath, payload);
    steps.write = "ok";
    const stat = await sftpStat(sftpClient, testPath);
    steps.stat = stat ? { size: stat.size } : "missing-after-write";
    await sftpRemove(sftpClient, testPath);
    steps.delete = "ok";

    result.ok = stat?.size === payload.length;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    try { conn.end(); } catch { /* ignore */ }
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
