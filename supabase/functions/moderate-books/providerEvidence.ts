import { assessEvidenceQuality, type EvidencePacket } from "./evidence.ts";

export type ProviderEvidenceFailureCode =
  | "evidence_verification_failed"
  | "evidence_verification_unconfigured"
  | "evidence_verification_rate_limited"
  | "evidence_verification_invalid_response"
  | "provider_identity_not_found";

export class ProviderEvidenceError extends Error {
  code: ProviderEvidenceFailureCode;
  constructor(
    code: ProviderEvidenceFailureCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "ProviderEvidenceError";
    this.code = code;
  }
}

export const PROVIDER_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const MAX_GOOGLE_EVIDENCE_CONCURRENCY = 2;
const GOOGLE_EVIDENCE_MAX_ATTEMPTS = 3;
const GOOGLE_RETRY_BASE_MS = 250;
const GOOGLE_RETRY_MAX_MS = 4_000;

type FetchLike = typeof fetch;
type ProviderEvidenceOptions = {
  fetchImpl?: FetchLike;
  googleApiKey?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_GOOGLE_EVIDENCE_CONCURRENCY) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

const googleEvidenceSemaphore = new Semaphore();

const cleanIsbn = (value: unknown) => String(value || "")
  .replace(/[^0-9Xx]/g, "").toUpperCase();
const text = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const list = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value)
  ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean) : [];

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) =>
  setTimeout(resolve, milliseconds));

function retryAfterMs(response: Response, now = Date.now()) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

async function fetchJson(
  url: URL,
  options: ProviderEvidenceOptions = {},
  timeoutMs = 8_000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(url, { signal: controller.signal,
      headers: { Accept: "application/json" } });
    if (response.status === 404) {
      throw new ProviderEvidenceError(
        "provider_identity_not_found",
        "The provider identity was not found.",
      );
    }
    if (!response.ok) {
      throw new ProviderEvidenceError(
        "evidence_verification_failed",
        `Provider evidence returned ${response.status}.`,
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/json/i.test(contentType)) {
      throw new ProviderEvidenceError(
        "evidence_verification_invalid_response",
        "Provider evidence was not JSON.",
      );
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      throw new ProviderEvidenceError(
        "evidence_verification_invalid_response",
        "Provider evidence contained invalid JSON.",
        { cause: error },
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProviderEvidenceError(
        "evidence_verification_invalid_response",
        "Provider evidence was malformed.",
      );
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderEvidenceError) throw error;
    throw new ProviderEvidenceError(
      "evidence_verification_failed",
      "Provider evidence lookup failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGoogleJson(url: URL, options: ProviderEvidenceOptions) {
  const sleep = options.sleep || defaultSleep;
  const random = options.random || Math.random;
  for (let attempt = 1; attempt <= GOOGLE_EVIDENCE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await (options.fetchImpl || fetch)(url, { signal: controller.signal,
        headers: { Accept: "application/json" } });
      if (response.status === 429) {
        if (attempt === GOOGLE_EVIDENCE_MAX_ATTEMPTS) {
          throw new ProviderEvidenceError(
            "evidence_verification_rate_limited",
            "Google Books evidence verification remained rate limited.",
          );
        }
        const exponential = Math.min(
          GOOGLE_RETRY_MAX_MS,
          GOOGLE_RETRY_BASE_MS * (2 ** (attempt - 1)),
        );
        const jittered = exponential * (0.8 + (random() * 0.4));
        const delay = Math.min(
          GOOGLE_RETRY_MAX_MS,
          Math.max(jittered, retryAfterMs(response)),
        );
        await sleep(delay);
        continue;
      }
      if (response.status === 404) {
        throw new ProviderEvidenceError(
          "provider_identity_not_found",
          "The Google Books volume was not found.",
        );
      }
      if (!response.ok) {
        throw new ProviderEvidenceError(
          "evidence_verification_failed",
          `Google Books evidence returned ${response.status}.`,
        );
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType && !/json/i.test(contentType)) {
        throw new ProviderEvidenceError(
          "evidence_verification_invalid_response",
          "Google Books evidence was not JSON.",
        );
      }
      let value: unknown;
      try {
        value = await response.json();
      } catch (error) {
        throw new ProviderEvidenceError(
          "evidence_verification_invalid_response",
          "Google Books evidence contained invalid JSON.",
          { cause: error },
        );
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ProviderEvidenceError(
          "evidence_verification_invalid_response",
          "Google Books evidence was malformed.",
        );
      }
      return value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ProviderEvidenceError) throw error;
      throw new ProviderEvidenceError(
        "evidence_verification_failed",
        "Google Books evidence lookup failed.",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ProviderEvidenceError(
    "evidence_verification_rate_limited",
    "Google Books evidence verification remained rate limited.",
  );
}

function googleIsbn(info: Record<string, unknown>) {
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const values = identifiers.filter((item) => item && typeof item === "object")
    .map((item) => item as Record<string, unknown>);
  return cleanIsbn(
    values.find((item) => item.type === "ISBN_13")?.identifier ||
      values.find((item) => item.type === "ISBN_10")?.identifier,
  );
}

async function googleEvidence(
  packet: EvidencePacket,
  options: ProviderEvidenceOptions,
): Promise<EvidencePacket> {
  const googleKey = (options.googleApiKey ?? Deno.env.get("GOOGLE_BOOKS_API_KEY"))?.trim();
  if (!googleKey) {
    throw new ProviderEvidenceError(
      "evidence_verification_unconfigured",
      "Google Books provider evidence is not configured.",
    );
  }
  const url = new URL(`https://www.googleapis.com/books/v1/volumes/${
    encodeURIComponent(packet.externalId)
  }`);
  url.searchParams.set("key", googleKey);
  const data = await googleEvidenceSemaphore.run(() => fetchGoogleJson(url, options));
  if (text(data.id, 300) !== packet.externalId) {
    throw new ProviderEvidenceError(
      "evidence_verification_invalid_response",
      "Google Books returned a different identity.",
    );
  }
  const info = data.volumeInfo && typeof data.volumeInfo === "object"
    ? data.volumeInfo as Record<string, unknown> : {};
  const title = text(info.title, 500);
  if (!title) {
    throw new ProviderEvidenceError(
      "evidence_verification_invalid_response",
      "Google Books evidence has no title.",
    );
  }
  const publishedYear = Number(String(info.publishedDate || "").match(/^\d{1,4}/)?.[0]);
  const imageLinks = info.imageLinks && typeof info.imageLinks === "object"
    ? info.imageLinks as Record<string, unknown> : {};
  const merged = {
    ...packet,
    title,
    subtitle: text(info.subtitle, 500),
    authors: list(info.authors, 20, 300),
    description: text(info.description, 12_000),
    categories: list(info.categories, 40, 200),
    subjects: [],
    publisher: text(info.publisher, 300),
    publicationYear: Number.isInteger(publishedYear) ? publishedYear : undefined,
    isbn: googleIsbn(info),
    maturityRating: text(info.maturityRating, 100),
    language: text(info.language, 40),
    coverUrl: text(imageLinks.thumbnail || imageLinks.smallThumbnail, 2_000),
    providerMetadata: { canonicalProvider: "google_books" },
  };
  return { ...merged, evidenceQuality: assessEvidenceQuality(merged) };
}

async function openLibraryAuthors(
  data: Record<string, unknown>,
  options: ProviderEvidenceOptions,
) {
  const byStatement = text(data.by_statement, 1_000).replace(/^by\s+/iu, "");
  const authorRows = Array.isArray(data.authors) ? data.authors : [];
  const keys = authorRows.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const row = entry as Record<string, unknown>;
    const nested = row.author && typeof row.author === "object"
      ? row.author as Record<string, unknown> : row;
    return text(nested.key, 300);
  }).filter((key) => /^\/authors\/[A-Za-z0-9_-]+A$/u.test(key)).slice(0, 5);
  if (!keys.length) return byStatement ? [byStatement] : [];
  const settled = await Promise.allSettled(keys.map((key) =>
    fetchJson(new URL(`https://openlibrary.org${key}.json`), options)));
  const names = settled.flatMap((result) => result.status === "fulfilled"
    ? [text(result.value.name, 300)].filter(Boolean) : []);
  return names.length ? names : byStatement ? [byStatement] : [];
}

async function openLibraryEvidence(
  packet: EvidencePacket,
  options: ProviderEvidenceOptions,
): Promise<EvidencePacket> {
  const key = packet.externalId;
  const data = await fetchJson(new URL(`https://openlibrary.org${key}.json`), options);
  if (text(data.key, 300) && text(data.key, 300) !== key) {
    throw new ProviderEvidenceError(
      "evidence_verification_invalid_response",
      "Open Library returned a different identity.",
    );
  }
  const title = text(data.title, 500);
  if (!title) {
    throw new ProviderEvidenceError(
      "evidence_verification_invalid_response",
      "Open Library evidence has no title.",
    );
  }
  const description = typeof data.description === "object" && data.description
    ? text((data.description as Record<string, unknown>).value, 12_000)
    : text(data.description, 12_000);
  const publishDate = text(data.first_publish_date || data.publish_date, 100);
  const publishedYear = Number(publishDate.match(/\d{4}/)?.[0]);
  const covers = Array.isArray(data.covers) ? data.covers : [];
  const coverId = Number(covers[0]);
  const publishers = Array.isArray(data.publishers) ? data.publishers : [];
  const isbn = cleanIsbn(
    (Array.isArray(data.isbn_13) ? data.isbn_13[0] : "") ||
      (Array.isArray(data.isbn_10) ? data.isbn_10[0] : ""),
  );
  const merged = {
    ...packet,
    externalId: key,
    title,
    subtitle: text(data.subtitle, 500),
    authors: await openLibraryAuthors(data, options),
    description,
    categories: [],
    subjects: list(data.subjects, 80, 200),
    publisher: text(publishers[0], 300),
    publicationYear: Number.isInteger(publishedYear) ? publishedYear : undefined,
    isbn,
    maturityRating: "",
    language: "",
    coverUrl: coverId > 0
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : "",
    providerMetadata: { canonicalProvider: "open_library" },
  };
  return { ...merged, evidenceQuality: assessEvidenceQuality(merged) };
}

/**
 * Replace client metadata with evidence obtained from the canonical provider.
 * Community and ISBN.work rows are accepted only when the database already
 * bound the packet to a matching stored book.
 */
export async function verifyProviderEvidence(
  packet: EvidencePacket,
  options: ProviderEvidenceOptions = {},
): Promise<EvidencePacket> {
  if (packet.source === "google_books") return googleEvidence(packet, options);
  if (packet.source === "open_library") return openLibraryEvidence(packet, options);
  if ((packet.source === "community" || packet.source === "isbn_work") && packet.bookId) {
    return packet;
  }
  throw new ProviderEvidenceError(
    "evidence_verification_failed",
    "This provider identity could not be verified server-side.",
  );
}

export function trustedCachedProviderEvidence(
  packet: EvidencePacket,
  evidence: unknown,
): EvidencePacket | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const row = evidence as Record<string, unknown>;
  const metadata = row.providerMetadata && typeof row.providerMetadata === "object"
    ? row.providerMetadata as Record<string, unknown> : {};
  if (metadata.canonicalProvider !== packet.source) return null;
  const title = text(row.title, 500);
  if (!title) return null;
  const year = Number(row.publicationYear);
  const merged = {
    ...packet,
    title,
    subtitle: text(row.subtitle, 500),
    authors: list(row.authors, 20, 300),
    description: text(row.description, 12_000),
    categories: list(row.categories, 40, 200),
    subjects: list(row.subjects, 80, 200),
    publisher: text(row.publisher, 300),
    publicationYear: Number.isInteger(year) ? year : undefined,
    isbn: cleanIsbn(row.isbn),
    maturityRating: text(row.maturityRating, 100),
    language: text(row.language, 40),
    coverUrl: text(row.coverUrl, 2_000),
    providerMetadata: { canonicalProvider: packet.source },
  };
  return { ...merged, evidenceQuality: assessEvidenceQuality(merged) };
}
