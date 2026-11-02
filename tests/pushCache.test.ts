import test from "node:test";
import assert from "node:assert/strict";
import { changedOnlyClient, clearPushCache } from "../src/lib/supabase";

/** Minimal fake of the Supabase client: records what each upsert actually receives. */
function fakeClient(fail = false) {
  const sent: any[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (rows: any, _opts?: any) => {
          sent.push({ table, rows });
          return { data: null, error: fail ? { message: "boom" } : null };
        },
        select: () => "passthrough",
      };
    },
    other: () => "ok",
  };
  return { client, sent };
}

test("unchanged rows are not sent again, changed rows are", async () => {
  clearPushCache();
  const { client, sent } = fakeClient();
  const c = changedOnlyClient(client);
  const a = { id: 1, total: 10, updated_at: "t1" };
  const b = { id: 2, total: 20, updated_at: "t1" };

  await c.from("bills").upsert([a, b], { onConflict: "id" });
  assert.equal(sent.at(-1).rows.length, 2);

  // same content, new updated_at stamp -> nothing sent
  const before = sent.length;
  await c.from("bills").upsert([{ ...a, updated_at: "t2" }, { ...b, updated_at: "t2" }], { onConflict: "id" });
  assert.equal(sent.length, before);

  // one row changed -> only that row is sent
  await c.from("bills").upsert([{ ...a, updated_at: "t3" }, { ...b, total: 25, updated_at: "t3" }], { onConflict: "id" });
  assert.deepEqual(sent.at(-1).rows.map((r: any) => r.id), [2]);
});

test("a failed push is not remembered, so it is retried", async () => {
  clearPushCache();
  const bad = fakeClient(true);
  const row = { id: 7, total: 1, updated_at: "t" };
  await changedOnlyClient(bad.client).from("trips").upsert([row]);
  const good = fakeClient();
  await changedOnlyClient(good.client).from("trips").upsert([row]);
  assert.equal(good.sent.length, 1);
});

test("force sends everything; other tables and methods pass through", async () => {
  clearPushCache();
  const { client, sent } = fakeClient();
  const row = { id: 1, name: "x", updated_at: "t" };
  await changedOnlyClient(client).from("products").upsert([row]);
  await changedOnlyClient(client, true).from("products").upsert([row]);
  assert.equal(sent.length, 2);
  await changedOnlyClient(client).from("not_cached").upsert([row]);
  assert.equal(sent.length, 3);
  assert.equal(changedOnlyClient(client).other(), "ok");
});

test("writeCollectionMerged skips a write identical to what the cloud holds", async () => {
  const { writeCollectionMerged, noteCollectionContent } = await import("../src/lib/supabase");
  const sent: any[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      upsert: async (row: any) => {
        sent.push(row);
        return { error: null };
      },
    }),
  };
  noteCollectionContent("partners", [{ id: 1 }]);
  await writeCollectionMerged(client, "partners", [{ id: 1 }]); // same as cloud -> skipped
  assert.equal(sent.length, 0);
  await writeCollectionMerged(client, "partners", [{ id: 1 }, { id: 2 }]); // changed -> written
  assert.equal(sent.length, 1);
  await writeCollectionMerged(client, "partners", [{ id: 1 }, { id: 2 }]); // repeat -> skipped
  assert.equal(sent.length, 1);
});
