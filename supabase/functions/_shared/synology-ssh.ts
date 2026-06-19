// Shared Synology SSH helper for edge functions.
// Key-based access only. Never logs secret values.
import { Client } from "npm:ssh2@1.15.0";

export interface SynologyConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  passphrase?: string;
}

/**
 * Rebuild a PEM private key that may have been stored as a single line.
 * Preserves an already well-formed multi-line key untouched.
 */
function normalizePem(raw: string): string {
  const key = raw.trim();
  if (key.includes("\n") && key.includes("-----BEGIN")) return key;

  // Single-line key: reconstruct header/body/footer with 64-char body lines.
  const headerMatch = key.match(/-----BEGIN [^-]+-----/);
  const footerMatch = key.match(/-----END [^-]+-----/);
  if (!headerMatch || !footerMatch) return key;

  const header = headerMatch[0];
  const footer = footerMatch[0];
  const body = key
    .slice(header.length, key.length - footer.length)
    .replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${header}\n${wrapped}\n${footer}\n`;
}

export function readSynologyConfig(): SynologyConfig | null {
  const host = Deno.env.get("SYNOLOGY_SSH_HOST");
  const username = Deno.env.get("SYNOLOGY_SSH_USER");
  const privateKey = Deno.env.get("SYNOLOGY_SSH_PRIVATE_KEY");
  const portRaw = Deno.env.get("SYNOLOGY_SSH_PORT");
  const passphrase = Deno.env.get("SYNOLOGY_SSH_PASSPHRASE") || undefined;
  if (!host || !username || !privateKey) return null;
  const port = portRaw ? Number.parseInt(portRaw, 10) : 22;
  return {
    host,
    port: Number.isFinite(port) ? port : 22,
    username,
    privateKey: normalizePem(privateKey),
    passphrase,
  };
}

export function connect(cfg: SynologyConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      try { conn.end(); } catch { /* ignore */ }
      reject(new Error("SSH connection timed out"));
    }, 20_000);
    conn
      .on("ready", () => { clearTimeout(timer); resolve(conn); })
      .on("error", (err: Error) => { clearTimeout(timer); reject(err); })
      .connect({
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        privateKey: cfg.privateKey,
        passphrase: cfg.passphrase,
        readyTimeout: 20_000,
      });
  });
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function exec(conn: Client, cmd: string, timeoutMs = 600_000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err: Error | undefined, stream: any) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        reject(new Error("SSH command timed out"));
      }, timeoutMs);
      stream
        .on("close", (code: number) => {
          clearTimeout(timer);
          resolve({ code: code ?? 0, stdout, stderr });
        })
        .on("data", (d: Uint8Array) => { stdout += new TextDecoder().decode(d); })
        .stderr.on("data", (d: Uint8Array) => { stderr += new TextDecoder().decode(d); });
    });
  });
}
