import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatNotificationTime, safeNotificationTarget } from "../src/lib/notificationApi.js";

const migrationUrl = new URL("../../supabase/migrations/202608250005_notifications.sql", import.meta.url);
const navbarUrl = new URL("../src/components/Navbar.jsx", import.meta.url);
const inboxUrl = new URL("../src/components/NotificationInbox.jsx", import.meta.url);
const navbarCssUrl = new URL("../src/components/Navbar.css", import.meta.url);
const responsiveCssUrl = new URL("../src/styles/responsive.css", import.meta.url);
const homeUrl = new URL("../src/pages/Home.jsx", import.meta.url);
const discoverUrl = new URL("../src/pages/Discover.jsx", import.meta.url);

test("notification destinations accept only bounded internal paths", () => {
  assert.equal(safeNotificationTarget("/discover?search=history"), "/discover?search=history");
  assert.equal(safeNotificationTarget("javascript:alert(1)"), "");
  assert.equal(safeNotificationTarget("//evil.example"), "");
  assert.equal(safeNotificationTarget(`/${"a".repeat(501)}`), "");
});

test("notification relative timestamps remain deterministic", () => {
  const now = new Date("2026-08-25T12:00:00Z").getTime();
  assert.equal(formatNotificationTime("2026-08-25T11:58:00Z", now), "2m ago");
  assert.equal(formatNotificationTime("2026-08-24T12:00:00Z", now), "Yesterday");
});

test("migration enforces recipient privacy and narrow read workflows", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /using \(recipient_id = auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on table public\.notifications from anon, authenticated/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete).*notifications to authenticated/i);
  assert.match(sql, /mark_notification_read[\s\S]*recipient_id = auth\.uid\(\)/i);
  assert.match(sql, /mark_all_notifications_read[\s\S]*recipient_id = auth\.uid\(\)/i);
});

test("durable triggers prevent self and duplicate interaction notifications", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /post_owner = new\.user_id then return new/i);
  assert.match(sql, /mentioned_recipient <> new\.user_id/i);
  assert.match(sql, /post_owner <> new\.user_id/i);
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/gi);
  assert.match(sql, /after insert on public\.post_likes/i);
  assert.doesNotMatch(sql, /after delete on public\.(?:post_likes|likes)/i);
});

test("interaction and approval notifications have exact durable destinations", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'\/\?post=' \|\| new\.post_id::text/);
  assert.match(sql, /'\/\?post=' \|\| new\.post_id::text \|\| '&comment=' \|\| new\.id::text/g);
  assert.match(sql, /case when post_type = 'review' then actor_name \|\| ' liked your review'/);
  assert.match(sql, /'\/discover\?bookId=' \|\| new\.approved_book_id::text/);
  assert.doesNotMatch(sql, /target_url[\s\S]{0,120}'\/'\s*,/i);
});

test("book outcomes notify only on actual status transitions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /new\.status is not distinct from old\.status[\s\S]*return new/i);
  assert.match(sql, /after update of status on public\.book_submissions/i);
  assert.match(sql, /book_submission_approved/);
  assert.match(sql, /book_submission_rejected/);
});

test("announcement fanout is admin-only and retry-deduplicated", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /if not public\.is_admin\(\)/i);
  assert.match(sql, /from public\.profiles[\s\S]*on conflict \(dedupe_key\) do nothing/i);
  assert.match(sql, /admin_broadcast:' \|\| p_broadcast_id::text \|\| ':' \|\| profiles\.id::text/i);
});

test("navbar mailbox placement, bounded inbox, and accessibility are explicit", async () => {
  const [navbar, inbox, css, responsive] = await Promise.all([
    readFile(navbarUrl, "utf8"), readFile(inboxUrl, "utf8"),
    readFile(navbarCssUrl, "utf8"), readFile(responsiveCssUrl, "utf8"),
  ]);
  assert.match(navbar, /className="nav-school-actions"[\s\S]*<NotificationInbox[\s\S]*className="school-logo"/);
  assert.ok(navbar.indexOf('className="nav-search"') < navbar.indexOf('className="nav-login"'));
  assert.match(inbox, /aria-expanded=\{open\}/);
  assert.match(inbox, /event\.key === "Escape"/);
  assert.match(inbox, /You&apos;re all caught up/);
  assert.match(css, /\.notification-mailbox[\s\S]*position: relative/);
  const buttonRule = css.match(/\.notification-mailbox-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(buttonRule, /width:\s*44px/);
  assert.match(buttonRule, /height:\s*44px/);
  assert.match(buttonRule, /border:\s*0/);
  assert.match(buttonRule, /background:\s*transparent/);
  assert.match(buttonRule, /box-shadow:\s*none/);
  const schoolActionsRule = css.match(/\.nav-school-actions\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(Number(schoolActionsRule.match(/gap:\s*(\d+)px/)?.[1]) >= 14);
  assert.match(css, /\.notification-mailbox-button > svg[\s\S]*width:\s*26px[\s\S]*height:\s*26px/);
  assert.match(css, /\.notification-mailbox-button:focus-visible[\s\S]*0 0 0 3px/);
  assert.match(css, /\.notification-unread-badge[\s\S]*position: absolute/);
  assert.match(css, /width: min\(390px, calc\(100vw - 32px\)\)/);
  assert.match(css, /\.notification-inbox-row--admin_announcement \.notification-inbox-copy span[\s\S]*overflow: visible[\s\S]*-webkit-line-clamp: unset/);
  assert.match(responsive, /max-width: 720px[\s\S]*\.notification-inbox-panel[\s\S]*position: fixed/);
  assert.match(responsive, /max-width: 1020px[\s\S]*\.nav-school-actions[\s\S]*grid-column: 2/);
});

test("notification clicks persist read state before navigating", async () => {
  const inbox = await readFile(inboxUrl, "utf8");
  const handler = inbox.match(/async function openNotification\(item\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.ok(handler.indexOf("await markNotificationRead(item.id)") < handler.indexOf("navigate(item.targetUrl)"));
  assert.match(handler, /setUnreadCount\(\(count\) => Math\.max\(0, count - 1\)\)/);
});

test("feed deep links wait for data, reveal comments, scroll, and fail safely", async () => {
  const home = await readFile(homeUrl, "utf8");
  assert.match(home, /if \(feedLoading \|\| !targetPostId\) return undefined/);
  assert.match(home, /posts\.find\(\(post\) => String\(post\.id\) === targetPostId\)/);
  assert.match(home, /if \(!targetPost\)[\s\S]*return undefined/);
  assert.match(home, /setExpandedCommentPostIds/);
  assert.match(home, /`feed-post-\$\{post\.id\}`/);
  assert.match(home, /comment\.isReply \? "reply" : "comment"/);
  assert.match(home, /scrollIntoView\(/);
  assert.match(home, /notification-content-target/);
});

test("approved-book deep links reuse the existing detail workflow", async () => {
  const discover = await readFile(discoverUrl, "utf8");
  assert.match(discover, /searchParams\.get\("bookId"\)/);
  assert.match(discover, /getCatalogBookById\(targetBookId\)/);
  assert.match(discover, /await openBookDetails\(targetBook\)/);
});
