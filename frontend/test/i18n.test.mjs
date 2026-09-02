import assert from "node:assert/strict";
import test from "node:test";

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object"
      ? flattenKeys(child, path)
      : [path];
  });
}

test("English and Simplified Chinese catalogs expose the same keys", async () => {
  const [{ default: en }, { default: zh }] = await Promise.all([
    import("../src/i18n/en.js"),
    import("../src/i18n/zh.js"),
  ]);

  assert.deepEqual(flattenKeys(zh).sort(), flattenKeys(en).sort());
  assert.equal(zh.nav.discover, "发现");
  assert.equal(en.nav.discover, "Discover");
});

test("language preference persists and synchronizes the document language", async () => {
  const values = new Map([["litshelf-language", "zh-CN"]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.document = { documentElement: { lang: "" } };

  const { default: i18n, LANGUAGE_STORAGE_KEY } = await import("../src/i18n/index.js");
  assert.equal(i18n.resolvedLanguage, "zh-CN");
  assert.equal(document.documentElement.lang, "zh-CN");

  await i18n.changeLanguage("en");
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "en");
  assert.equal(document.documentElement.lang, "en");
});
