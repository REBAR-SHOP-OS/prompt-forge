import { connect, sftpList } from "../_shared/synology-ssh.ts";

Deno.test("nas connect + list base dir", async () => {
  const conn = await connect();
  try {
    const entries = await sftpList(conn, "/volume1/video/REBAR SHOP OS VIDEOS");
    console.log("NAS entries:", entries.length, entries.slice(0, 5).map((e) => e.name));
  } finally {
    conn.end();
  }
});
