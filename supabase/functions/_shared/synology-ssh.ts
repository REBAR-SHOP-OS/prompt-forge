// Synology NAS SSH/SFTP helper for edge functions.
//
// Connects to the NAS over SSH (key-based) and exposes SFTP operations used by
// the nas-storage function: list, stat, ranged read, delete.
//
// Secrets (runtime env):
//   SYNOLOGY_SSH_HOST, SYNOLOGY_SSH_PORT, SYNOLOGY_SSH_USER,
//   SYNOLOGY_SSH_PRIVATE_KEY, SYNOLOGY_SSH_PASSPHRASE (optional)
//
// The private key is normalized in-memory only and is never logged.

import { Client } from "npm:ssh2@1.15.0";
import { Buffer } from "node:buffer";

export interface NasFileEntry {
  name: string;
  size: number;
  mtime: number; // epoch ms
  isDirectory: boolean;
}

/** Rebuild a PEM key that may have been stored as a single line. */
function normalizePrivateKey(raw: string): string {
  const key = raw.trim();
  if (key.includes("\n")) return key + (key.endsWith("\n") ? "" : "\n");

  // Single-line PEM: rebuild header/footer + 64-char base64 body.
  const m = key.match(/-----BEGIN ([A-Z ]+)-----(.*)-----END \1-----/);
  if (!m) return key; // not a recognizable PEM, pass through as-is
  const label = m[1];
  const body = m[2].replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function getNasConfig() {
  const host = Deno.env.get("SYNOLOGY_SSH_HOST");
  const user = Deno.env.get("SYNOLOGY_SSH_USER");
  const rawKey = Deno.env.get("SYNOLOGY_SSH_PRIVATE_KEY");
  if (!host || !user || !rawKey) {
    throw new Error("NAS SSH secrets are not configured");
  }
  const port = Number(Deno.env.get("SYNOLOGY_SSH_PORT") ?? "22") || 22;
  const passphrase = Deno.env.get("SYNOLOGY_SSH_PASSPHRASE") || undefined;
  return { host, port, username: user, privateKey: normalizePrivateKey(rawKey), passphrase };
}

// deno-lint-ignore no-explicit-any
export function connect(): Promise<any> {
  const cfg = getNasConfig();
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", (err: Error) => reject(err))
      .connect({
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        privateKey: cfg.privateKey,
        passphrase: cfg.passphrase,
        readyTimeout: 20000,
      });
  });
}

// deno-lint-ignore no-explicit-any
function getSftp(conn: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    conn.sftp((err: Error, sftp: any) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

export async function sftpList(
  // deno-lint-ignore no-explicit-any
  conn: any,
  dir: string,
): Promise<NasFileEntry[]> {
  const sftp = await getSftp(conn);
  return await new Promise((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    sftp.readdir(dir, (err: Error, list: any[]) => {
      if (err) return reject(err);
      const entries: NasFileEntry[] = (list ?? []).map((it) => ({
        name: it.filename as string,
        size: Number(it.attrs?.size ?? 0),
        mtime: Number(it.attrs?.mtime ?? 0) * 1000,
        isDirectory: typeof it.attrs?.isDirectory === "function"
          ? it.attrs.isDirectory()
          : ((Number(it.attrs?.mode ?? 0) & 0o170000) === 0o040000),
      }));
      resolve(entries);
    });
  });
}

export async function sftpStatSize(
  // deno-lint-ignore no-explicit-any
  conn: any,
  path: string,
): Promise<number> {
  const sftp = await getSftp(conn);
  return await new Promise((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    sftp.stat(path, (err: Error, stats: any) => {
      if (err) return reject(err);
      resolve(Number(stats?.size ?? 0));
    });
  });
}

/** Read a byte range [start, end] (inclusive) of a file into a single Buffer. */
export async function sftpReadRange(
  // deno-lint-ignore no-explicit-any
  conn: any,
  path: string,
  start: number,
  end: number,
): Promise<Uint8Array> {
  const sftp = await getSftp(conn);
  const stream = sftp.createReadStream(path, { start, end });
  const chunks: Uint8Array[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (c: Uint8Array) => chunks.push(c));
    stream.on("error", (err: Error) => reject(err));
    stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
  });
}

export async function sftpDelete(
  // deno-lint-ignore no-explicit-any
  conn: any,
  path: string,
): Promise<void> {
  const sftp = await getSftp(conn);
  await new Promise<void>((resolve, reject) => {
    sftp.unlink(path, (err: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
