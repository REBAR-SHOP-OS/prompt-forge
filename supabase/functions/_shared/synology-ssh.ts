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
  const host = Deno.env.get("SYNOLOGY_SSH_HOST")?.trim();
  const username = Deno.env.get("SYNOLOGY_SSH_USER")?.trim();
  const privateKey = Deno.env.get("SYNOLOGY_SSH_PRIVATE_KEY");
  const portRaw = Deno.env.get("SYNOLOGY_SSH_PORT")?.trim();
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

// ---------------------------------------------------------------------------
// SFTP helpers. Per skill/synology-nas-access: always use SFTP streams for file
// transfer, never `cat`/`base64` over an exec channel (busybox hangs on EOF).
// ---------------------------------------------------------------------------

export function getMediaBasePath(): string {
  return Deno.env.get("SYNOLOGY_MEDIA_PATH") || "/volume1/ERP/media";
}

/** Open the SFTP subsystem on an existing connection. */
export function sftp(conn: Client): Promise<any> {
  return new Promise((resolve, reject) => {
    conn.sftp((err: Error | undefined, sftpClient: any) => {
      if (err) return reject(err);
      resolve(sftpClient);
    });
  });
}

/** Recursively create a remote directory (no shell required). */
export async function sftpMkdirP(sftpClient: any, dir: string): Promise<void> {
  const parts = dir.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur += "/" + part;
    await new Promise<void>((resolve) => {
      // mkdir errors when the directory already exists; that is fine.
      sftpClient.mkdir(cur, (_err: Error | undefined) => resolve());
    });
  }
}

/** Write bytes to a remote path via SFTP. */
export function sftpPut(sftpClient: any, remotePath: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = sftpClient.createWriteStream(remotePath);
    ws.on("error", (err: Error) => reject(err));
    ws.on("close", () => resolve());
    // ssh2 write streams accept Buffer/Uint8Array.
    ws.end(bytes);
  });
}

/** Stat a remote file. Returns null if it does not exist. */
export function sftpStat(sftpClient: any, remotePath: string): Promise<{ size: number } | null> {
  return new Promise((resolve) => {
    sftpClient.stat(remotePath, (err: Error | undefined, stats: any) => {
      if (err || !stats) return resolve(null);
      resolve({ size: Number(stats.size) });
    });
  });
}

/** Remove a remote file. Resolves even if it is already gone. */
export function sftpRemove(sftpClient: any, remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    sftpClient.unlink(remotePath, () => resolve());
  });
}

/**
 * Open a remote read stream (optionally a byte range) and return it as a web
 * ReadableStream suitable for a Response body. The SSH connection is closed
 * when the stream ends/errors via the provided onDone callback.
 */
export function sftpReadStream(
  sftpClient: any,
  remotePath: string,
  opts: { start?: number; end?: number } = {},
  onDone?: () => void,
): ReadableStream<Uint8Array> {
  const streamOpts: Record<string, number> = {};
  if (typeof opts.start === "number") streamOpts.start = opts.start;
  if (typeof opts.end === "number") streamOpts.end = opts.end; // inclusive
  const nodeStream = sftpClient.createReadStream(remotePath, streamOpts);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Uint8Array) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        try { controller.close(); } catch { /* already closed */ }
        onDone?.();
      });
      nodeStream.on("error", (err: Error) => {
        try { controller.error(err); } catch { /* ignore */ }
        onDone?.();
      });
    },
    cancel() {
      try { nodeStream.destroy(); } catch { /* ignore */ }
      onDone?.();
    },
  });
}

/** Stream an HTTP response body straight to a remote SFTP path. */
export function sftpPutStream(
  sftpClient: any,
  remotePath: string,
  source: ReadableStream<Uint8Array>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = sftpClient.createWriteStream(remotePath);
    ws.on("error", (err: Error) => reject(err));
    ws.on("close", () => resolve());
    (async () => {
      try {
        const reader = source.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            // Respect backpressure so very large files don't buffer in memory.
            const ok = ws.write(value);
            if (!ok) {
              await new Promise<void>((res) => ws.once("drain", res));
            }
          }
        }
        ws.end();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}
