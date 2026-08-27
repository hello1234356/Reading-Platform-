import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarSource = await readFile(new URL("../src/components/Navbar.jsx", import.meta.url), "utf8");
const navbarCss = await readFile(new URL("../src/components/Navbar.css", import.meta.url), "utf8");
const responsiveCss = await readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8");

test("navbar has exactly three direct layout zones in brand-links-actions order", () => {
  const markup = navbarSource.slice(navbarSource.indexOf("return ("));
  assert.ok(markup.indexOf('className="nav-brand"') < markup.indexOf('className="nav-links"'));
  assert.ok(markup.indexOf('className="nav-links"') < markup.indexOf('className="nav-school-actions nav-actions"'));
  assert.equal((markup.match(/className="nav-search"/g) || []).length, 1);
  assert.equal((markup.match(/label: "Admin"/g) || []).length, 1);
});

test("Admin is conditionally added to the same primary nav collection", () => {
  assert.match(navbarSource, /const visibleNavItems = adminRole\s*\? \[\.\.\.navItems, \{ to: "\/admin", label: "Admin" \}\]\s*: navItems/);
  assert.match(navbarSource, /visibleNavItems\.map/);
  assert.doesNotMatch(navbarSource, /className=["'][^"']*admin-nav/);
});

test("desktop navbar uses three explicit grid columns with bounded shrinking search", () => {
  assert.match(responsiveCss, /Stable three-zone desktop navbar:[\s\S]*grid-template-columns: minmax\(140px, 170px\) max-content minmax\(0, 1fr\)/);
  assert.match(responsiveCss, /\.nav-search,[\s\S]*flex: 0 1 320px;[\s\S]*width: clamp\(180px, 20vw, 320px\);[\s\S]*min-width: 180px/);
  assert.match(responsiveCss, /\.nav-search input \{[\s\S]*width: 100%;[\s\S]*min-width: 0/);
  assert.match(responsiveCss, /@media \(min-width: 1021px\) and \(max-width: 1120px\)[\s\S]*\.nav-search,[\s\S]*width: 180px/);
});

test("Admin has no special desktop sizing or search override", () => {
  assert.doesNotMatch(navbarCss, /\.site-nav-admin\s*\{|\.site-nav-admin \.nav-center|\.site-nav-admin \.nav-search|\.site-nav-admin \.nav-links/);
});
