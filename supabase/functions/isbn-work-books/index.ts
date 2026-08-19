const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanIsbn(isbn = "") {
  return String(isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
}

async function fetchIsbnWork(url: URL) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ISBN.work returned ${response.status}.`);
  }

  const data = await response.json();

  if (data?.success === false || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(data?.msg || data?.message || "ISBN.work could not find matching books.");
  }

  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for ISBN.work book lookup." }, 405);
  }

  const appKey = Deno.env.get("ISBN_WORK_APP_KEY");

  if (!appKey) {
    return jsonResponse(
      { error: "ISBN_WORK_APP_KEY is not configured in Supabase." },
      500,
    );
  }

  try {
    const body = await request.json();
    const action = String(body?.action || "search");
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 40);

    if (action === "isbn") {
      const isbn = cleanIsbn(body?.isbn || body?.query);

      if (!isbn) {
        return jsonResponse({ error: "Enter an ISBN to look up this book." }, 400);
      }

      const url = new URL("http://data.isbn.work/openApi/getInfoByIsbn");
      url.searchParams.set("isbn", isbn);
      url.searchParams.set("appKey", appKey);

      return jsonResponse(await fetchIsbnWork(url));
    }

    const query = String(body?.query || "").trim();

    if (!query) {
      return jsonResponse({ error: "Enter a Chinese title to search." }, 400);
    }

    const url = new URL("http://data.isbn.work/openApi/book/page");
    url.searchParams.set("bookName", query);
    url.searchParams.set("current", "1");
    url.searchParams.set("size", String(limit));
    url.searchParams.set("appKey", appKey);

    return jsonResponse(await fetchIsbnWork(url));
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Chinese book search is unavailable right now.",
      },
      500,
    );
  }
});
