import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function httpsUrl(value: unknown) {
  const normalized = String(value || "").trim().replace(/^http:/i, "https:");
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function cleanIsbn(value: unknown) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

async function isUsableImage(url: string) {
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-2047" },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    return response.ok && contentType.toLowerCase().startsWith("image/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function repairGoogleBooksCover(externalId: string) {
  if (!externalId) return "";
  const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(externalId)}`);
  const apiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY")?.trim();
  if (apiKey) url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) return "";
  const data = await response.json();
  const links = data?.volumeInfo?.imageLinks || {};
  const candidates = [
    links.extraLarge,
    links.large,
    links.medium,
    links.small,
    links.thumbnail,
    links.smallThumbnail,
  ].map(httpsUrl).filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    if (await isUsableImage(candidate)) return candidate;
  }
  return "";
}

function normalizeOpenLibraryKey(value: string) {
  const key = String(value || "").trim();
  if (/^\/(?:works|books)\/OL[A-Z0-9]+[WM]$/i.test(key)) return key;
  if (/^OL[A-Z0-9]+[WM]$/i.test(key)) {
    return `${key.toUpperCase().endsWith("M") ? "/books/" : "/works/"}${key}`;
  }
  return "";
}

async function repairOpenLibraryCover(externalId: string, isbnValue: string) {
  const candidates: string[] = [];
  const key = normalizeOpenLibraryKey(externalId);

  if (key) {
    const response = await fetch(`https://openlibrary.org${key}.json`);
    if (response.ok) {
      const data = await response.json();
      for (const coverId of Array.isArray(data?.covers) ? data.covers : []) {
        if (Number(coverId) > 0) {
          candidates.push(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`);
        }
      }
    }
  }

  const isbn = cleanIsbn(isbnValue);
  if (isbn) {
    candidates.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`);
  }

  for (const candidate of [...new Set(candidates)]) {
    if (await isUsableImage(candidate)) return candidate;
  }
  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Use POST for cover repair." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Cover repair is not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData } = await userClient.auth.getUser(accessToken);
  if (!userData.user) return jsonResponse({ error: "Sign in to repair book covers." }, 401);

  let body: { bookId?: number; staleCoverUrl?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid cover repair request." }, 400);
  }

  const bookId = Number(body.bookId);
  const staleCoverUrl = String(body.staleCoverUrl || "").trim();
  if (!Number.isSafeInteger(bookId) || bookId <= 0 || !staleCoverUrl) {
    return jsonResponse({ error: "A stored book and cover URL are required." }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: claim, error: claimError } = await serviceClient.rpc("claim_book_cover_repair", {
    p_book_id: bookId,
    p_stale_cover_url: staleCoverUrl,
  });
  if (claimError) return jsonResponse({ error: "Cover repair is unavailable." }, 500);
  if (!claim?.claimed) {
    const coverChanged = claim?.reason === "cover_changed" && Boolean(claim?.cover_url);
    return jsonResponse({
      repaired: coverChanged,
      reason: claim?.reason,
      coverUrl: coverChanged ? claim.cover_url : "",
    });
  }

  let repairedCoverUrl = "";
  try {
    if (claim.source === "google_books") {
      repairedCoverUrl = await repairGoogleBooksCover(String(claim.external_id || ""));
    } else if (claim.source === "open_library") {
      repairedCoverUrl = await repairOpenLibraryCover(
        String(claim.external_id || ""),
        String(claim.isbn || ""),
      );
    }
  } catch {
    repairedCoverUrl = "";
  }

  if (repairedCoverUrl === staleCoverUrl) repairedCoverUrl = "";
  const { data: completed, error: completionError } = await serviceClient.rpc(
    "complete_book_cover_repair",
    {
      p_book_id: bookId,
      p_stale_cover_url: staleCoverUrl,
      p_repaired_cover_url: repairedCoverUrl || null,
    },
  );
  if (completionError) return jsonResponse({ error: "Cover repair could not be saved." }, 500);

  return jsonResponse({
    repaired: Boolean(completed?.updated),
    coverUrl: completed?.updated ? completed.cover_url : "",
    reason: completed?.updated ? "repaired" : "not_found",
  });
});
