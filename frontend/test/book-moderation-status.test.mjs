import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BOOK_MODERATION_MESSAGES,
  getBookModerationPresentation,
} from "../src/lib/bookModerationStatus.js";

test("checking uses the bookish gatekeeper message", () => {
  assert.deepEqual(getBookModerationPresentation("checking"), {
    kind: "checking",
    message: "Checking with our bookish gatekeepers… 📚",
    reportActionLabel: "",
  });
});

test("approved has no moderation presentation", () => {
  assert.equal(getBookModerationPresentation("approved"), null);
});

test("review-required uses the closer-look message without an internal reason", () => {
  assert.deepEqual(getBookModerationPresentation({
    moderationStatus: "review_required",
    reasonForReview: "internal policy reason",
  }), {
    kind: "review_required",
    message: "Our bookish gatekeepers are taking a closer look at this one. Check back soon!",
    reportActionLabel: "",
  });
});

test("final blocked and manually rejected decisions offer the admin-report action", () => {
  ["blocked", "rejected", "manual_rejected", "manually_rejected"].forEach((status) => {
    const presentation = getBookModerationPresentation(status);
    assert.equal(presentation.kind, "blocked");
    assert.equal(presentation.message,
      "The book gatekeepers have gatekept this one. Think we've made a mistake?");
    assert.equal(presentation.reportActionLabel, "Message the admin team");
  });
  assert.equal(
    `${BOOK_MODERATION_MESSAGES.blocked} ${BOOK_MODERATION_MESSAGES.reportAction}.`,
    "The book gatekeepers have gatekept this one. Think we've made a mistake? Message the admin team.",
  );
});

test("technical errors use temporary-unavailable language", () => {
  [
    "classifier_unavailable",
    "edge_request_failed",
    "cache_request_failed",
    "persistence_error",
  ].forEach((failureCode) => {
    const presentation = getBookModerationPresentation({
      moderationStatus: "failed",
      moderationFailureCode: failureCode,
    });
    assert.equal(presentation.kind, "technical_error");
    assert.equal(presentation.message,
      "Our bookish gatekeepers are temporarily unavailable. Try again in a moment.");
    assert.equal(presentation.reportActionLabel, "");
  });
});

test("classifier_unavailable can never render as a rejection", () => {
  const presentation = getBookModerationPresentation({
    moderationStatus: "blocked",
    moderationFailureCode: "classifier_unavailable",
  });
  assert.equal(presentation.kind, "technical_error");
  assert.doesNotMatch(presentation.message, /gatekept this one/i);
  assert.equal(presentation.reportActionLabel, "");
});

test("book moderation UI contains no old availability terminology", async () => {
  const files = await Promise.all([
    "../src/pages/Discover.jsx",
    "../src/pages/BookClubs.jsx",
    "../src/components/BookModerationStatus.jsx",
    "../src/lib/bookModerationStatus.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const moderationUi = files.join("\n");
  assert.doesNotMatch(moderationUi, /\bavailability\b/i);
  assert.doesNotMatch(moderationUi,
    /Checking availability|Availability check failed|Pending school review/i);
  assert.match(moderationUi, /reportBlockedBookModeration/);
  assert.match(moderationUi, /onClick=\{reportDecision\}/);
  assert.match(moderationUi, /<BookModerationStatus book=\{book\}/);
});

test("blocked reports are authenticated, structured, and do not change the decision", async () => {
  const migration = await readFile(new URL(
    "../../supabase/migrations/202608250011_book_moderation_user_reports.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration, /reporting_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /target\.status <> 'blocked' or not target\.manually_reviewed/);
  assert.match(migration, /'title', resolved_title/);
  assert.match(migration, /'author', resolved_author/);
  assert.match(migration, /'source', target\.source/);
  assert.match(migration, /'external_id', target\.external_id/);
  assert.match(migration, /'current_moderation_decision', target\.status/);
  assert.match(migration, /'reporting_user_id', reporting_user_id/);
  assert.match(migration, /previous_status[\s\S]*next_status[\s\S]*target\.status[\s\S]*target\.status/);
  assert.match(migration, /book_moderation_user_report_unique/);
});

test("required copy remains centralized and exact", () => {
  assert.equal(BOOK_MODERATION_MESSAGES.reportAction, "Message the admin team");
});
