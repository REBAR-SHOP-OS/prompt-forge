import { ownsGenerationJob } from "./ownership.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function client(result: { id?: string } | null, calls: string[]) {
  const chain = {
    select(value: string) { calls.push(`select:${value}`); return chain; },
    eq(column: string, value: string) { calls.push(`eq:${column}:${value}`); return chain; },
    maybeSingle() { return Promise.resolve({ data: result, error: null }); },
  };
  return { from(table: string) { calls.push(`from:${table}`); return chain; } };
}

Deno.test("copyright ownership binds both job and authenticated user", async () => {
  const calls: string[] = [];
  assert(await ownsGenerationJob(client({ id: "job-1" }, calls) as unknown as Parameters<typeof ownsGenerationJob>[0], "user-1", "job-1"), "owned job rejected");
  assert(calls.includes("eq:id:job-1"), "job filter missing");
  assert(calls.includes("eq:user_id:user-1"), "user filter missing");
});

Deno.test("copyright ownership rejects a missing or foreign job", async () => {
  assert(!(await ownsGenerationJob(client(null, []) as unknown as Parameters<typeof ownsGenerationJob>[0], "user-1", "job-2")), "foreign job accepted");
});
