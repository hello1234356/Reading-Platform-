import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findLargestFittingFontSize } from "../src/lib/fitText.js";

const componentUrl = new URL("../src/components/FittedProfileName.jsx", import.meta.url);
const cssUrl = new URL("../src/pages/Profile.css", import.meta.url);

function fitName(name, availableWidth) {
  return findLargestFittingFontSize({
    minSize: 34,
    maxSize: 104,
    wrapMinSize: 22,
    fits: (fontSize, lineCount = 1) => name.length * fontSize * 0.56 <= availableWidth * lineCount,
  });
}

test("short, medium, and long names progressively use available width", () => {
  const short = fitName("Amy", 520);
  const medium = fitName("CarrieShelf", 520);
  const long = fitName("welisten&wedontjudge", 520);
  assert.equal(short.fontSize, 104);
  assert.ok(medium.fontSize < short.fontSize && medium.fontSize > long.fontSize);
  assert.ok(long.fontSize >= 34);
});

test("an extreme name uses the readable two-line fallback", () => {
  assert.deepEqual(fitName("averyveryveryverylongshelfnamethatshouldstillfit", 320), {
    fontSize: 23,
    needsWrap: true,
  });
});

test("long-name fitting remains contained as representative viewport allocations narrow", () => {
  const allocatedWidths = [760, 620, 520, 440, 360, 320, 280, 260, 240];
  const results = allocatedWidths.map((width) => fitName("welisten&wedontjudge", width));
  results.forEach((result, index) => {
    const lineCapacity = allocatedWidths[index] * (result.needsWrap ? 2 : 1);
    assert.ok("welisten&wedontjudge".length * result.fontSize * 0.56 <= lineCapacity);
  });
  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index].fontSize <= results[index - 1].fontSize);
  }
});

test("fit component responds to content, width, and loaded font metrics without loops", async () => {
  const [component, css] = await Promise.all([
    readFile(componentUrl, "utf8"), readFile(cssUrl, "utf8"),
  ]);
  assert.match(component, /new ResizeObserver\(scheduleFit\)/);
  assert.match(component, /availableWidth === lastWidth/);
  assert.match(component, /document\.fonts\?\.ready/);
  assert.match(component, /observer\.disconnect\(\)/);
  assert.match(css, /\.profile-identity \.profile-display-name--wrap[\s\S]*overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /\.profile-display-name[^}]*overflow:\s*hidden/);
});
