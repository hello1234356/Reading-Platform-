import assert from "node:assert/strict";
import test from "node:test";
import { createInstance } from "i18next";
import en from "../src/i18n/en.js";
import zh from "../src/i18n/zh.js";
import {
  formatFeedRelativeTime,
  getFeedActivityKey,
} from "../src/lib/feedPresentation.js";
import { getLocalizedNotificationTitle } from "../src/lib/notificationApi.js";

async function translator(language) {
  const instance = createInstance();
  await instance.init({
    lng: language,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zh },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
}

test("every stored feed post type maps to a complete activity sentence", () => {
  assert.equal(getFeedActivityKey("review", true), "home.activity.review");
  assert.equal(getFeedActivityKey("finished", true), "home.activity.finished");
  assert.equal(getFeedActivityKey("progress", true), "home.activity.progress");
  assert.equal(getFeedActivityKey("note", true), "home.activity.noteWithBook");
  assert.equal(getFeedActivityKey("note", false), "home.activity.noteWithoutBook");
});

test("English and Chinese activity templates preserve dynamic names and titles", async () => {
  const [english, chinese] = await Promise.all([
    translator("en"),
    translator("zh-CN"),
  ]);
  const values = { username: "Chrystal", bookTitle: "Immune" };

  assert.equal(
    english.t(getFeedActivityKey("review", true), values),
    "<user><bold>Chrystal</bold></user> reviewed <book>Immune</book>",
  );
  assert.equal(
    chinese.t(getFeedActivityKey("review", true), values),
    "<user><bold>Chrystal</bold></user> 评价了《<book>Immune</book>》",
  );
  assert.equal(
    chinese.t(getFeedActivityKey("note", false), values),
    "<user><bold>Chrystal</bold></user> 发布了一条阅读笔记",
  );
});

test("feed relative times retain English style and use natural Chinese units", async () => {
  const [english, chinese] = await Promise.all([
    translator("en"),
    translator("zh-CN"),
  ]);
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  const ago = (milliseconds) => new Date(now - milliseconds).toISOString();

  assert.equal(formatFeedRelativeTime(ago(20_000), english.t, "en", now), "just now");
  assert.equal(formatFeedRelativeTime(ago(5 * 60_000), english.t, "en", now), "5 min ago");
  assert.equal(formatFeedRelativeTime(ago(2 * 3_600_000), english.t, "en", now), "2 hrs ago");
  assert.equal(formatFeedRelativeTime(ago(20_000), chinese.t, "zh-CN", now), "刚刚");
  assert.equal(formatFeedRelativeTime(ago(5 * 60_000), chinese.t, "zh-CN", now), "5 分钟前");
  assert.equal(formatFeedRelativeTime(ago(16 * 3_600_000), chinese.t, "zh-CN", now), "16 小时前");
  assert.equal(formatFeedRelativeTime(ago(3 * 86_400_000), chinese.t, "zh-CN", now), "3 天前");
});

test("generated social notification titles localize without changing actor names", async () => {
  const chinese = await translator("zh-CN");
  const base = { actor: { name: "Chrystal" }, title: "stored English title" };

  assert.equal(getLocalizedNotificationTitle({ ...base, type: "reply" }, chinese.t), "Chrystal 回复了你的评论");
  assert.equal(getLocalizedNotificationTitle({ ...base, type: "comment" }, chinese.t), "Chrystal 评论了你的动态");
  assert.equal(getLocalizedNotificationTitle({ ...base, type: "reaction", targetType: "comment_like" }, chinese.t), "Chrystal 点赞了你的评论");
  assert.equal(getLocalizedNotificationTitle({ ...base, type: "reaction", targetType: "post_like", body: "Immune" }, chinese.t), "Chrystal 点赞了你的书评");
  assert.equal(getLocalizedNotificationTitle({ ...base, type: "admin_announcement" }, chinese.t), "stored English title");
});

test("Home renders activity templates with components instead of English fragments", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/pages/Home.jsx", import.meta.url), "utf8"));
  assert.match(source, /<Trans[\s\S]*i18nKey=\{post\.activityKey\}/);
  assert.match(source, /user: <ProfileLink userId=\{post\.userId\}/);
  assert.doesNotMatch(source, /\{post\.action\}|\{post\.time\}/);
});
