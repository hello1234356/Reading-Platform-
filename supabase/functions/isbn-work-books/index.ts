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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal,
      headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(timer);
  }

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

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anon) return jsonResponse({ error: "Authentication is not configured." }, 500);
  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anon },
  });
  if (!authResponse.ok) return jsonResponse({ error: "Sign in to look up ISBN.work books." }, 401);

  try {
    const body = await request.json();
    const action = String(body?.action || "search");
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 20);

    if (action === "isbn") {
      const isbn = cleanIsbn(body?.isbn || body?.query);

      if (isbn.length !== 10 && isbn.length !== 13) {
        return jsonResponse({ error: "Enter an ISBN to look up this book." }, 400);
      }

      const providerUrl = new URL("https://data.isbn.work/openApi/getInfoByIsbn");
      providerUrl.searchParams.set("isbn", isbn);
      providerUrl.searchParams.set("appKey", appKey);

      return jsonResponse(await fetchIsbnWork(providerUrl));
    }

    const query = String(body?.query || "").trim();

    if (!query || query.length > 300) {
      return jsonResponse({ error: "Enter a Chinese title to search." }, 400);
    }

    const providerUrl = new URL("https://data.isbn.work/openApi/book/page");
    providerUrl.searchParams.set("bookName", query);
    providerUrl.searchParams.set("current", "1");
    providerUrl.searchParams.set("size", String(limit));
    providerUrl.searchParams.set("appKey", appKey);

    return jsonResponse(await fetchIsbnWork(providerUrl));
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
