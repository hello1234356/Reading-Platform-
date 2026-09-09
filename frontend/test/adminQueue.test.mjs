import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../src/lib/adminApi.js", import.meta.url), "utf8");

test("AI shared count uses the effective review queue beyond its page limit and refreshes after review", async () => {
  let waiting = 1001;
  const offsets = [];
  const context = vm.createContext({
    requireSupabase: () => ({
      from: () => ({ select: () => ({
        in: async () => ({ count: 2 }),
        eq: async () => ({ count: 3 }),
      }) }),
      rpc(name, args) {
        assert.equal(name, "list_effective_book_moderation_assessments");
        assert.equal(args.p_status, "review_required");
        offsets.push(args.p_offset);
        return { select: async (columns) => {
          assert.equal(columns, "id");
          return { data: Array.from({ length: Math.min(args.p_limit, Math.max(0, waiting - args.p_offset)) }, (_, id) => ({ id })) };
        } };
      },
    }),
  });
  const start = source.indexOf("async function countRows(");
  const end = source.indexOf("\nexport ", source.indexOf("export async function getAdminNotificationSummary") + 1);
  vm.runInContext(source.slice(start, end).replaceAll("export ", ""), context);
  let summary = await context.getAdminNotificationSummary();
  assert.equal(summary.aiReviewCount, 1001);
  assert.equal(summary.total, 1009);
  assert.deepEqual(offsets, [0, 500, 1000]);
  waiting = 1000;
  summary = await context.getAdminNotificationSummary();
  assert.equal(summary.aiReviewCount, 1000);
  assert.equal(summary.total, 1008);
  waiting = 0;
  assert.equal((await context.getAdminNotificationSummary()).aiReviewCount, 0);
});
