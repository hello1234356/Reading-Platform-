import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_FESTIVAL_PHOTO_SIZE,
  validateFestivalPhoto,
} from "../src/lib/festivalRecommendationModel.js";

const migrationUrl = new URL(
  "../../supabase/migrations/202608270003_gen_z_reading_festival.sql",
  import.meta.url,
);

test("festival photo validation accepts supported images and rejects unsafe uploads", () => {
  assert.doesNotThrow(() => validateFestivalPhoto({
    name: "student.webp",
    type: "image/webp",
    size: MAX_FESTIVAL_PHOTO_SIZE,
  }));
  assert.throws(() => validateFestivalPhoto({
    name: "student.svg",
    type: "image/svg+xml",
    size: 100,
  }), /JPG, PNG, or WebP/);
  assert.throws(() => validateFestivalPhoto({
    name: "student.jpg",
    type: "image/jpeg",
    size: MAX_FESTIVAL_PHOTO_SIZE + 1,
  }), /smaller than 5 MB/);
});

test("campaign schema is single-submission, constrained, and identity-bound", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /unique \(user_id\)/);
  assert.match(migration, /language in \('english', 'chinese'\)/);
  assert.match(migration, /status in \('submitted', 'selected', 'not_selected'\)/);
  assert.match(migration, /char_length\(btrim\(quote\)\) between 1 and 300/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.can_use_moderated_book\(book_id\)/);
  assert.match(migration, /on conflict \(user_id\) do update/);
  assert.doesNotMatch(migration, /on conflict[\s\S]*status = excluded\.status/);
});

test("festival photos are private and restricted to the authenticated user folder", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /'festival-student-photos',[\s\S]*?false,[\s\S]*?5242880/);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /or public\.is_admin\(\)/);
  assert.doesNotMatch(migration, /getPublicUrl/);
});

test("student and admin status writes use separate authorized RPCs", async () => {
  const [migration, api, modal, admin] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(new URL("../src/lib/festivalRecommendationApi.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/FestivalBookSubmissionModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/FestivalRecommendationAdmin.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /if not public\.is_admin\(\)/);
  assert.match(migration, /revoke all on function public\.review_festival/);
  assert.match(api, /materializeBookRecord\(userId, book\)/);
  assert.match(api, /createSignedUrl\(row\.student_photo_path, 3600\)/);
  assert.match(modal, /searchBooksByQueryLanguage\(term, 8\)/);
  assert.match(modal, /book\.moderationStatus !== "approved"/);
  assert.match(admin, /reviewFestivalRecommendation/);
});

test("homepage modal action is campaign-scoped and removable with its banner", async () => {
  const [home, carousel] = await Promise.all([
    readFile(new URL("../src/pages/Home.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HomepageSpotlightCarousel.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /target !== "festival-book-submission"/);
  assert.match(carousel, /banner\.actionType === "modal"/);
  assert.match(carousel, /onBannerModalAction\?\.\(banner\.actionTarget\)/);
  assert.doesNotMatch(home, /festival-book-submission[\s\S]*navigation/i);
});
