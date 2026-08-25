import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAccountEmail, normalizeAccountEmail } from "../src/lib/authEmailPolicy.js";

test("account email policy allows Tsinglan addresses", () => {
  assert.equal(isAllowedAccountEmail("reader@tsinglan.org"), true);
  assert.equal(isAllowedAccountEmail(" READER@TSINGLAN.ORG "), true);
});

test("account email policy allows only the designated Gmail exception", () => {
  assert.equal(isAllowedAccountEmail("carrieseventeen.218@gmail.com"), true);
  assert.equal(isAllowedAccountEmail(" CARRIESEVENTEEN.218@GMAIL.COM "), true);
  assert.equal(isAllowedAccountEmail("someone.else@gmail.com"), false);
  assert.equal(isAllowedAccountEmail("carrieseventeen.218+test@gmail.com"), false);
  assert.equal(isAllowedAccountEmail("carrieseventeen.218@gmail.com.evil.test"), false);
});

test("account emails are normalized before authentication", () => {
  assert.equal(normalizeAccountEmail(" Reader@Tsinglan.org "), "reader@tsinglan.org");
});
