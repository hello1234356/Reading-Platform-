import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatNotificationTime, safeNotificationTarget } from "../src/lib/notificationApi.js";
import { getNotificationPanelHeight } from "../src/lib/notificationLayout.js";

const migrationUrl = new URL("../../supabase/migrations/202608250005_notifications.sql", import.meta.url);
const unreadResetMigrationUrl = new URL(
  "../../supabase/migrations/202608250009_reset_all_notifications_unread.sql",
  import.meta.url,
);
const publicAnnouncementMigrationUrl = new URL(
  "../../supabase/migrations/202608260001_public_announcements.sql",
  import.meta.url,
);
const navbarUrl = new URL("../src/components/Navbar.jsx", import.meta.url);
const inboxUrl = new URL("../src/components/NotificationInbox.jsx", import.meta.url);
const navbarCssUrl = new URL("../src/components/Navbar.css", import.meta.url);
const responsiveCssUrl = new URL("../src/styles/responsive.css", import.meta.url);
const homeUrl = new URL("../src/pages/Home.jsx", import.meta.url);
const discoverUrl = new URL("../src/pages/Discover.jsx", import.meta.url);
const notificationApiUrl = new URL("../src/lib/notificationApi.js", import.meta.url);
const adminApiUrl = new URL("../src/lib/adminApi.js", import.meta.url);
const adminUrl = new URL("../src/pages/Admin.jsx", import.meta.url);

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

test("notification panel height is derived from its rendered top and viewport bottom", () => {
  assert.equal(getNotificationPanelHeight(100, 600), 488);
  assert.equal(getNotificationPanelHeight(82, 900), 560);
  assert.equal(getNotificationPanelHeight(590, 600), 0);
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

test("one-time reset marks every existing notification unread", async () => {
  const sql = await readFile(unreadResetMigrationUrl, "utf8");
  assert.match(sql, /update public\.notifications\s+set is_read = false\s+where is_read = true/i);
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

test("Everyone creates one global announcement without enumerating profiles", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  const compatibilityRpc = sql.match(
    /create or replace function public\.broadcast_notification[\s\S]*?\n\$\$;/i,
  )?.[0] || "";
  assert.match(compatibilityRpc, /public\.save_public_announcement/i);
  assert.match(compatibilityRpc, /'announcement_count', 1/i);
  assert.doesNotMatch(compatibilityRpc, /from public\.profiles/i);
  assert.doesNotMatch(compatibilityRpc, /insert into public\.notifications/i);
});

test("public announcements use sparse independent read state and active windows", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.public_announcements/i);
  assert.match(sql, /create table if not exists public\.public_announcement_reads/i);
  assert.match(sql, /primary key \(announcement_id, user_id\)/i);
  assert.match(sql, /is_active\s+and starts_at <= now\(\)\s+and \(ends_at is null or ends_at > now\(\)\)/i);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\)/i);
  assert.match(sql, /with check \(user_id = auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /insert into public\.public_announcement_reads[\s\S]{0,200}from public\.profiles/i);
});

test("combined inbox and badge include active unread public announcements", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.get_notification_inbox/i);
  assert.match(sql, /from public\.notifications[\s\S]*union all[\s\S]*from public\.public_announcements/i);
  assert.match(sql, /create or replace function public\.get_unread_notification_count/i);
  assert.match(sql, /not exists \([\s\S]*from public\.public_announcement_reads/i);
  assert.match(sql, /on conflict \(announcement_id, user_id\)\s+do update set read_at/i);
});

test("targeted admin messages use only the selected profile UUID", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  const targetedRpc = sql.match(
    /create or replace function public\.send_targeted_admin_notification[\s\S]*?\n\$\$;/i,
  )?.[0] || "";
  assert.match(targetedRpc, /if not public\.is_admin\(\)/i);
  assert.match(targetedRpc, /where id = p_recipient_id/i);
  assert.match(targetedRpc, /p_recipient_id, 'admin_announcement'/i);
  assert.doesNotMatch(targetedRpc, /from public\.profiles as profiles/i);
});

test("legacy broadcast is reconstructed once and duplicate copies are suppressed", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  assert.match(sql, /latest_legacy_broadcast[\s\S]*limit 1/i);
  assert.match(sql, /legacy_broadcast_id/i);
  assert.match(sql, /where migrated\.legacy_broadcast_id::text = notification\.entity_id/i);
  assert.match(sql, /notification\.is_read[\s\S]*on conflict \(announcement_id, user_id\) do nothing/i);
  assert.doesNotMatch(sql, /delete from public\.notifications/i);
});

test("announcement tables are protected and participate in existing realtime", async () => {
  const sql = await readFile(publicAnnouncementMigrationUrl, "utf8");
  assert.match(sql, /alter table public\.public_announcements enable row level security/i);
  assert.match(sql, /revoke all on table public\.public_announcements from anon, authenticated/i);
  assert.match(sql, /public\.is_admin\(\)[\s\S]*is_active/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete) on table public\.public_announcements to authenticated/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.public_announcements/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.public_announcement_reads/i);
});

test("frontend combines announcement reads, badge count, and realtime refreshes", async () => {
  const api = await readFile(notificationApiUrl, "utf8");
  assert.match(api, /rpc\("get_notification_inbox"/);
  assert.match(api, /rpc\("get_unread_notification_count"/);
  assert.match(api, /notification\?\.itemKind === "public_announcement"/);
  assert.match(api, /"mark_public_announcement_read"/);
  assert.match(api, /table: "public_announcements"/);
  assert.match(api, /table: "public_announcement_reads"[\s\S]*filter: `user_id=eq\.\$\{userId\}`/);
});

test("Admin composer keeps targeted and Everyone delivery paths distinct", async () => {
  const [api, admin] = await Promise.all([
    readFile(adminApiUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ]);
  assert.match(api, /rpc\("send_targeted_admin_notification"[\s\S]*p_recipient_id: recipientId/);
  assert.match(api, /rpc\("save_public_announcement"/);
  assert.match(admin, /Specific user/);
  assert.match(admin, /Everyone/);
  assert.match(admin, /await sendTargetedAdminNotification\([\s\S]*recipientId: selectedRecipient\.id/);
  assert.match(admin, /await savePublicAnnouncement\([\s\S]*startsAt,[\s\S]*endsAt/);
  assert.match(admin, /getPublicAnnouncementsForAdmin/);
  assert.match(admin, /editAnnouncement\(announcement\)/);
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
  const panelRule = css.match(/\.notification-inbox-panel\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(panelRule, /display:\s*flex/);
  assert.match(panelRule, /flex-direction:\s*column/);
  assert.match(panelRule, /height:\s*var\(--notification-panel-height/);
  assert.match(panelRule, /max-height:\s*var\(--notification-panel-height/);
  assert.match(panelRule, /min-height:\s*0/);
  assert.match(panelRule, /overflow:\s*hidden/);
  const headerRule = css.match(/\.notification-inbox-header\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(headerRule, /flex:\s*0 0 auto/);
  const listRule = css.match(/\.notification-inbox-list\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(listRule, /flex:\s*1 1 auto/);
  assert.match(listRule, /min-height:\s*0/);
  assert.match(listRule, /overflow-y:\s*auto/);
  assert.match(listRule, /overflow-x:\s*hidden/);
  assert.match(listRule, /scrollbar-width:\s*thin/);
  assert.match(listRule, /touch-action:\s*pan-y/);
  assert.doesNotMatch(css, /notification-inbox-list[^}]*scrollbar-width:\s*none/);
  assert.doesNotMatch(css, /notification-inbox-list::-[^{]*scrollbar[^}]*display:\s*none/);
  assert.match(css, /\.notification-inbox-row--admin_announcement \.notification-inbox-copy span[\s\S]*overflow: visible[\s\S]*-webkit-line-clamp: unset/);
  assert.match(responsive, /max-width: 720px[\s\S]*\.notification-inbox-panel[\s\S]*position: fixed/);
  assert.match(responsive, /max-width: 1020px[\s\S]*\.nav-school-actions[\s\S]*grid-column: 2/);
});

test("notification clicks persist read state before navigating", async () => {
  const inbox = await readFile(inboxUrl, "utf8");
  const handler = inbox.match(/async function openNotification\(item\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.ok(handler.indexOf("await markNotificationRead(item)") < handler.indexOf("navigate(item.targetUrl)"));
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
