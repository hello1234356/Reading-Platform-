import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyBooks, MODEL_VERSION } from "./classifier.ts";
import { planBookAssessments, safeEvidenceForStorage, type EvidencePacket } from "./evidence.ts";
import { applyPolicy, MODERATION_MODE, POLICY_VERSION } from "./policy.ts";
import { moderationIdentity, validateRequestBody, type Classification } from "./schema.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const publicResult = (row: Record<string, unknown>, cached: boolean) => ({
  source: row.source, externalId: row.external_id, status: row.status,
  confidence: row.confidence, evidenceQuality: row.evidence_quality,
  policyVersion: row.policy_version, cached,
});

type DbClient = ReturnType<typeof createClient>;

async function saveAssessment(
  service: DbClient,
  packet: EvidencePacket,
  previous: Record<string, unknown> | undefined,
  values: Record<string, unknown>,
  eventType?: "ai_assessed" | "evidence_updated",
  eventDetails: Record<string, unknown> = {},
) {
  const row = { book_id: packet.bookId || null, source: packet.source,
    external_id: packet.externalId, evidence_quality: packet.evidenceQuality,
    evidence: safeEvidenceForStorage(packet), policy_version: POLICY_VERSION,
    model_version: MODEL_VERSION, updated_at: new Date().toISOString(), ...values };
  let wroteAssessment = false;

  if (previous?.status === "error" && !previous.manually_reviewed) {
    const { data, error } = await service.from("book_moderation_assessments").update(row)
      .eq("id", previous.id).eq("manually_reviewed", false).select("id");
    if (error) throw error;
    wroteAssessment = Boolean(data?.length);
  } else {
    const { data, error } = await service.from("book_moderation_assessments").upsert(row,
      { onConflict: "source,external_id,policy_version", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    wroteAssessment = Boolean(data?.length);
  }

  const { data: saved, error: readError } = await service.from("book_moderation_assessments")
    .select("*").eq("source", packet.source).eq("external_id", packet.externalId)
    .eq("policy_version", POLICY_VERSION).single();
  if (readError) throw readError;
  if (eventType && wroteAssessment && !saved.manually_reviewed) {
    await service.from("book_moderation_events").insert({ assessment_id: saved.id,
      event_type: eventType, next_status: saved.status, details: eventDetails });
  }
  return saved;
}

function riskScores(classification: Classification) {
  return { sexual_content: classification.sexual_content, violence: classification.violence,
    self_harm: classification.self_harm, drugs_or_gambling: classification.drugs_or_gambling,
    hate_or_extremism: classification.hate_or_extremism,
    political_or_regulatory_sensitivity: classification.political_or_regulatory_sensitivity,
    age_suitability: classification.age_suitability };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST for book moderation." }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anon || !serviceRole) return json({ error: "Book moderation is not configured." }, 500);
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (!authData.user) return json({ error: "Sign in to assess books." }, 401);

  let books;
  try { books = validateRequestBody(await request.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400); }

  const service = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sources = [...new Set(books.map((book) => book.source))];
  const externalIds = [...new Set(books.map((book) => book.externalId))];
  const { data: cachedRows, error: cacheError } = await service.from("book_moderation_assessments")
    .select("*").eq("policy_version", POLICY_VERSION).in("source", sources).in("external_id", externalIds);
  if (cacheError) return json({ error: "Moderation cache is unavailable." }, 500);
  const cache = new Map((cachedRows || []).map((row) => [moderationIdentity(row.source, row.external_id), row]));
  const { data: storedRows } = await service.from("books").select(
    "id,title,author,isbn,genre,description,language,publisher,publication_year,source,external_id"
  ).in("source", sources).in("external_id", externalIds);
  const stored = new Map((storedRows || []).map((row) => [moderationIdentity(row.source, row.external_id), row]));

  const resultByIdentity = new Map<string, Record<string, unknown>>();
  const plan = planBookAssessments(books, cache, stored);
  plan.cached.forEach((assessment, identity) => {
    resultByIdentity.set(identity, publicResult(assessment, true));
  });
  const unknownPackets = plan.unknown;

  // Insufficient evidence is decided deterministically and omitted from the AI batch.
  const insufficient = unknownPackets.filter((packet) => packet.evidenceQuality === "insufficient");
  const eligible = unknownPackets.filter((packet) => packet.evidenceQuality !== "insufficient");
  let batch = { valid: new Map(), errors: new Map<string, string>(), rejectedIdentities: [] as string[] };
  let providerFailure = "";
  if (eligible.length) {
    try {
      batch = await classifyBooks(eligible);
      if (batch.rejectedIdentities.length) console.warn("Rejected AI book identities", batch.rejectedIdentities);
    } catch (error) {
      providerFailure = error instanceof Error ? error.message : "AI batch classification failed.";
      console.error("Book AI batch failed", { count: eligible.length, message: providerFailure });
    }
  }

  for (const packet of insufficient) {
    const identity = moderationIdentity(packet.source, packet.externalId);
    try {
      const saved = await saveAssessment(service, packet, cache.get(identity), {
        status: "review_required", confidence: 0, risk_scores: {},
        flags: ["insufficient_evidence"],
        summary: "Available metadata is insufficient for automatic approval.",
        model_version: "deterministic-no-ai",
      }, "evidence_updated", { reason: "insufficient_evidence", mode: MODERATION_MODE });
      resultByIdentity.set(identity, publicResult(saved, false));
    } catch (error) {
      console.error("Could not save insufficient-evidence assessment", { identity,
        message: error instanceof Error ? error.message : "unknown" });
      resultByIdentity.set(identity, { source: packet.source, externalId: packet.externalId,
        status: "error", confidence: 0, evidenceQuality: packet.evidenceQuality,
        policyVersion: POLICY_VERSION, cached: false });
    }
  }

  for (const packet of eligible) {
    const identity = moderationIdentity(packet.source, packet.externalId);
    const classification = batch.valid.get(identity) as Classification | undefined;
    try {
      const saved = classification
        ? await saveAssessment(service, packet, cache.get(identity), {
          status: applyPolicy(classification, packet.evidenceQuality),
          confidence: classification.confidence, risk_scores: riskScores(classification),
          flags: classification.flags, summary: classification.summary,
        }, "ai_assessed", { recommendation: classification.recommendation, mode: MODERATION_MODE })
        : await saveAssessment(service, packet, cache.get(identity), {
          status: "error", confidence: 0, risk_scores: {},
          flags: [providerFailure ? "classifier_unavailable" : batch.errors.get(identity) || "invalid_classification"],
          summary: "Automated assessment was unavailable or invalid and requires retry or review.",
        });
      resultByIdentity.set(identity, publicResult(saved, false));
    } catch (error) {
      console.error("Could not save book assessment", { identity,
        message: error instanceof Error ? error.message : "unknown" });
      resultByIdentity.set(identity, { source: packet.source, externalId: packet.externalId,
        status: "error", confidence: 0, evidenceQuality: packet.evidenceQuality,
        policyVersion: POLICY_VERSION, cached: false });
    }
  }

  return json({ mode: MODERATION_MODE, policyVersion: POLICY_VERSION,
    results: books.map((book) => resultByIdentity.get(moderationIdentity(book.source, book.externalId))) });
});
