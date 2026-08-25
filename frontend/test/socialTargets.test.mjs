import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSocialTarget, resolveSocialTarget } from "../src/lib/socialTargets.js";

const migrationUrl = new URL("../../supabase/migrations/202608250006_social_targets_and_mentions.sql", import.meta.url);
const homeUrl = new URL("../src/pages/Home.jsx", import.meta.url);
const appUrl = new URL("../src/App.jsx", import.meta.url);

test("canonical social routes preserve exact post, comment, and reply IDs", () => {
  assert.equal(buildSocialTarget({ postId: 12 }), "/post/12");
  assert.equal(buildSocialTarget({ postId: 12, commentId: 34 }), "/post/12?comment=34");
  assert.equal(buildSocialTarget({ postId: 12, commentId: 34, replyId: 56 }), "/post/12?comment=34&reply=56");
  assert.deepEqual(resolveSocialTarget({ pathname: "/post/12", search: "?comment=34&reply=56" }), {
    postId: "12", commentId: "34", replyId: "56",
  });
});

test("legacy targets remain reloadable and normal feed routes remain unaffected", () => {
  assert.deepEqual(resolveSocialTarget({ pathname: "/", search: "?post=12&comment=34" }), {
    postId: "12", commentId: "34", replyId: "",
  });
  assert.equal(resolveSocialTarget({ pathname: "/", search: "?search=books" }), null);
  assert.equal(resolveSocialTarget({ pathname: "/discover", search: "?comment=34" }), null);
  assert.equal(buildSocialTarget({ postId: "bad", commentId: 34 }), "");
});

test("router and feed reconstruct targets and wait for asynchronously loaded content", async () => {
  const [app, home] = await Promise.all([readFile(appUrl, "utf8"), readFile(homeUrl, "utf8")]);
  assert.match(app, /path="\/post\/:postId" element=\{<Home \/>\}/);
  assert.match(home, /if \(feedLoading \|\| !targetPostId\) return undefined/);
  assert.match(home, /requestedContent\.isReply \? "reply" : "comment"/);
  assert.match(home, /scrollIntoView\(/);
  assert.match(home, /prefers-reduced-motion/);
  assert.match(home, /notificationTargetHandledRef\.current = targetKey/);
  assert.match(home, /`feed-post-\$\{targetPostId\}`/);
});

test("mention notifications validate profiles, deduplicate, and prioritize direct replies", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /profiles\.username = candidate\[2\]/);
  assert.match(sql, /select comments\.user_id into direct_reply_recipient/);
  assert.match(sql, /primary key \(comment_id, mentioned_user_id\)/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /mentioned_profile\.id <> new\.user_id/);
  assert.match(sql, /mentioned_profile\.id is distinct from direct_reply_recipient/);
  assert.match(sql, /'reply'.*replied to your comment/s);
  assert.match(sql, /'mention'.*mentioned you in a reply/s);
  assert.match(sql, /after insert on public\.comments/);
  assert.doesNotMatch(sql, /after update.*notify_post_comment/i);
});

test("structured notification targets use stable foreign keys", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /post_id bigint references public\.posts\(id\) on delete set null/);
  assert.match(sql, /comment_id bigint references public\.comments\(id\) on delete set null/);
  assert.match(sql, /reply_id bigint references public\.comments\(id\) on delete set null/);
  assert.match(sql, /'\/post\/' \|\| new\.post_id::text/);
});
