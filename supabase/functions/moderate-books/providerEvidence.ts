import { assessEvidenceQuality, type EvidencePacket } from "./evidence.ts";

export class ProviderEvidenceError extends Error {
  code = "evidence_verification_failed" as const;
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "ProviderEvidenceError";
  }
}

const cleanIsbn = (value: unknown) => String(value || "")
  .replace(/[^0-9Xx]/g, "").toUpperCase();
const text = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const list = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value)
  ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean) : [];

async function fetchJson(url: URL, timeoutMs = 8_000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal,
      headers: { Accept: "application/json" } });
    if (!response.ok) throw new ProviderEvidenceError(`Provider evidence returned ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/json/i.test(contentType)) {
      throw new ProviderEvidenceError("Provider evidence was not JSON.");
    }
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProviderEvidenceError("Provider evidence was malformed.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderEvidenceError) throw error;
    throw new ProviderEvidenceError("Provider evidence lookup failed.", { cause: error });
  } finally {
    clearTimeout(timer);
  }
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

async function googleEvidence(packet: EvidencePacket): Promise<EvidencePacket> {
  const url = new URL(`https://www.googleapis.com/books/v1/volumes/${
    encodeURIComponent(packet.externalId)
  }`);
  const googleKey = Deno.env.get("GOOGLE_BOOKS_API_KEY")?.trim();
  if (googleKey) url.searchParams.set("key", googleKey);
  const data = await fetchJson(url);
  if (text(data.id, 300) !== packet.externalId) {
    throw new ProviderEvidenceError("Google Books returned a different identity.");
  }
  const info = data.volumeInfo && typeof data.volumeInfo === "object"
    ? data.volumeInfo as Record<string, unknown> : {};
  const title = text(info.title, 500);
  if (!title) throw new ProviderEvidenceError("Google Books evidence has no title.");
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

async function openLibraryAuthors(data: Record<string, unknown>) {
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
    fetchJson(new URL(`https://openlibrary.org${key}.json`))));
  const names = settled.flatMap((result) => result.status === "fulfilled"
    ? [text(result.value.name, 300)].filter(Boolean) : []);
  return names.length ? names : byStatement ? [byStatement] : [];
}

async function openLibraryEvidence(packet: EvidencePacket): Promise<EvidencePacket> {
  const key = packet.externalId;
  const data = await fetchJson(new URL(`https://openlibrary.org${key}.json`));
  if (text(data.key, 300) && text(data.key, 300) !== key) {
    throw new ProviderEvidenceError("Open Library returned a different identity.");
  }
  const title = text(data.title, 500);
  if (!title) throw new ProviderEvidenceError("Open Library evidence has no title.");
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
    authors: await openLibraryAuthors(data),
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
export async function verifyProviderEvidence(packet: EvidencePacket): Promise<EvidencePacket> {
  if (packet.source === "google_books") return googleEvidence(packet);
  if (packet.source === "open_library") return openLibraryEvidence(packet);
  if ((packet.source === "community" || packet.source === "isbn_work") && packet.bookId) {
    return packet;
  }
  throw new ProviderEvidenceError("This provider identity could not be verified server-side.");
}
