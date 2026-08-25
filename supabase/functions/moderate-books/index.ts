import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyBooks, enrichBook, ENRICHMENT_MODEL, MODEL_VERSION } from "./classifier.ts";
import { planBookAssessments, safeEvidenceForStorage, selectEffectiveAssessments,
  type EvidencePacket } from "./evidence.ts";
import { applyEnrichmentFailurePolicy, applyPolicy, MODERATION_MODE,
  POLICY_VERSION, reviewCategory, reviewReason, shouldEnrichBook } from "./policy.ts";
import { verifyProviderEvidence } from "./providerEvidence.ts";

import { moderationIdentity, validateRequestBody, type BatchClassificationValidation,
  type Classification, type IncomingBook } from "./schema.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const publicResult = (row: Record<string, unknown>, cached: boolean) => ({
  source: row.source, externalId: row.external_id, status: row.status,
  confidence: row.moderation_confidence ?? row.confidence,
  identityConfidence: row.identity_confidence,
  moderationConfidence: row.moderation_confidence ?? row.confidence,
  knowledgeSource: row.knowledge_source,
  evidenceQuality: row.evidence_quality,
  failureCode: row.status === "error"
    ? (Array.isArray(row.flags) && row.flags[0] ? row.flags[0] : "classifier_unavailable")
    : undefined,
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
  let prior = previous;
  const row = { book_id: packet.bookId || null, source: packet.source,
    external_id: packet.externalId, evidence_quality: packet.evidenceQuality,
    evidence: safeEvidenceForStorage(packet), policy_version: POLICY_VERSION,
    model_version: MODEL_VERSION, updated_at: new Date().toISOString(), ...values };
  let wroteAssessment = false;

  if (prior && !prior.manually_reviewed) {
    const { data, error } = await service.from("book_moderation_assessments").update(row)
      .eq("id", prior.id).eq("manually_reviewed", false).select("id");
    if (error) throw error;
    wroteAssessment = Boolean(data?.length);
  } else {
    const { data, error } = await service.from("book_moderation_assessments").upsert(row,
      { onConflict: "source,external_id,policy_version", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    wroteAssessment = Boolean(data?.length);
  }

  // A concurrent request may have inserted the identity after our cache read.
  // Update only a non-manual winner; never overwrite an admin decision.
  if (!wroteAssessment && !prior) {
    const { data: conflict, error: conflictError } = await service
      .from("book_moderation_assessments")
      .select("id,status,manually_reviewed")
      .eq("source", packet.source).eq("external_id", packet.externalId)
      .eq("policy_version", POLICY_VERSION).single();
    if (conflictError) throw conflictError;
    prior = conflict;
    if (!conflict.manually_reviewed) {
      const { data, error } = await service.from("book_moderation_assessments").update(row)
        .eq("id", conflict.id).eq("manually_reviewed", false).select("id");
      if (error) throw error;
      wroteAssessment = Boolean(data?.length);
    }
  }

  const { data: saved, error: readError } = await service.from("book_moderation_assessments")
    .select("*").eq("source", packet.source).eq("external_id", packet.externalId)
    .eq("policy_version", POLICY_VERSION).single();
  if (readError) throw readError;
  if (eventType && wroteAssessment && !saved.manually_reviewed) {
    const { error: eventError } = await service.from("book_moderation_events").insert({
      assessment_id: saved.id, event_type: eventType,
      previous_status: prior?.status || null, next_status: saved.status,
      details: eventDetails,
    });
    if (eventError) console.error("Could not save book moderation audit event", {
      assessmentId: saved.id, eventType, failureCode: "audit_event_persistence_error",
      message: eventError.message,
    });
  }
  return saved;
}

function riskScores(classification: Classification) {
  return { sexual_content: classification.sexual_content,
    extremism: classification.extremism,
    china_political_sensitivity: classification.china_political_sensitivity };
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
  const { data: authData, error: authError } = await userClient.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ""),
  );
  if (authError) console.warn("Book moderation authentication failed", {
    failureCode: "authentication_failed", message: authError.message,
  });
  if (!authData.user) return json({ error: "Sign in to assess books." }, 401);

  let books: IncomingBook[];
  let cacheOnly = false;
  try {
    const body = await request.json();
    books = validateRequestBody(body);
    cacheOnly = Boolean(body && typeof body === "object"
      && (body as { cacheOnly?: unknown }).cacheOnly === true);
  }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400); }

  const service = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sources = [...new Set(books.map((book) => book.source))];
  const externalIds = [...new Set(books.map((book) => book.externalId))];
  const { data: cachedRows, error: cacheError } = await service.from("book_moderation_assessments")
    .select("*").in("source", sources).in("external_id", externalIds);
  if (cacheError && cacheOnly) return json({ error: "Moderation cache is unavailable." }, 503);
  if (cacheError) console.error("Moderation cache lookup failed; continuing without cache", {
    failureCode: "cache_lookup_failed", message: cacheError.message,
  });
  const cache = cacheError
    ? new Map<string, Record<string, unknown>>()
    : selectEffectiveAssessments(cachedRows || [], POLICY_VERSION);
  const { data: storedRows, error: storedError } = await service.from("books").select(
    "id,title,author,isbn,genre,description,cover_url,language,publisher,publication_year,source,external_id"
  ).in("source", sources).in("external_id", externalIds);
  if (storedError) console.error("Stored book evidence lookup failed", {
    failureCode: "evidence_lookup_failed", message: storedError.message,
  });
  const stored = new Map((storedRows || []).map((row) => [moderationIdentity(row.source, row.external_id), row]));

  const resultByIdentity = new Map<string, Record<string, unknown>>();
  const plan = planBookAssessments(books, cache, stored);
  plan.cached.forEach((assessment, identity) => {
    resultByIdentity.set(identity, publicResult(assessment, true));
  });
  const unknownPackets = plan.unknown;

  if (cacheOnly) {
    unknownPackets.forEach((packet) => resultByIdentity.set(
      moderationIdentity(packet.source, packet.externalId),
      { source: packet.source, externalId: packet.externalId, status: "checking", cached: false,
        policyVersion: POLICY_VERSION },
    ));
    return json({ mode: MODERATION_MODE, policyVersion: POLICY_VERSION, cacheOnly: true,
      cachedCount: plan.cached.size, unknownCount: unknownPackets.length,
      results: books.map((book) => resultByIdentity.get(
        moderationIdentity(book.source, book.externalId),
      )) });
  }

  // Charge the authenticated account before any provider or AI work. Cache-only
  // lookups remain free and technical failures never become content decisions.
  if (unknownPackets.length) {
    const { data: quotaAllowed, error: quotaError } = await service.rpc(
      "consume_book_moderation_quota",
      { p_user_id: authData.user.id, p_book_count: unknownPackets.length },
    );
    if (quotaError || quotaAllowed !== true) {
      const failureCode = quotaError
        ? "moderation_quota_guard_unavailable" : "moderation_rate_limited";
      console.warn("Book moderation quota rejected work", {
        userId: authData.user.id, count: unknownPackets.length, failureCode,
        message: quotaError?.message || "Per-user moderation quota exceeded.",
      });
      unknownPackets.forEach((packet) => resultByIdentity.set(
        moderationIdentity(packet.source, packet.externalId),
        { source: packet.source, externalId: packet.externalId, status: "error",
          confidence: 0, evidenceQuality: packet.evidenceQuality,
          failureCode, policyVersion: POLICY_VERSION, cached: false },
      ));
      return json({ mode: MODERATION_MODE, policyVersion: POLICY_VERSION,
        results: books.map((book) => resultByIdentity.get(
          moderationIdentity(book.source, book.externalId),
        )) });
    }
  }

  // Client metadata is untrusted. Replace it with an exact provider record (or
  // a database-bound community/ISBN.work row) before it can reach DeepSeek or
  // the shared durable moderation cache.
  const verifiedPackets = await Promise.all(unknownPackets.map(async (packet) => {
    const identity = moderationIdentity(packet.source, packet.externalId);
    try {
      return await verifyProviderEvidence(packet);
    } catch (error) {
      console.error("Book provider evidence verification failed", {
        identity, failureCode: "evidence_verification_failed",
        message: error instanceof Error ? error.message : "Provider evidence lookup failed.",
      });
      resultByIdentity.set(identity, {
        source: packet.source, externalId: packet.externalId, status: "error",
        confidence: 0, evidenceQuality: packet.evidenceQuality,
        failureCode: "evidence_verification_failed",
        policyVersion: POLICY_VERSION, cached: false,
      });
      return null;
    }
  }));
  // Sparse verified packets still reach the classifier so reliable prior
  // knowledge can identify exact works.
  const eligible = verifiedPackets.filter((packet): packet is EvidencePacket => Boolean(packet));
  let batch: BatchClassificationValidation = {
    valid: new Map(), errors: new Map(), rejectedIdentities: [],
  };
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

  const enriched = new Map<string, Classification>();
  const enrichmentErrors = new Map<string, string>();
  await Promise.all(eligible.map(async (packet) => {
    const identity = moderationIdentity(packet.source, packet.externalId);
    const initial = batch.valid.get(identity) as Classification | undefined;
    if (!initial || !shouldEnrichBook(initial, packet)) return;
    try {
      enriched.set(identity, await enrichBook(packet, initial));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web enrichment failed.";
      enrichmentErrors.set(identity, message);
      console.error("Book web enrichment failed", { identity, message });
    }
  }));

  for (const packet of eligible) {
    const identity = moderationIdentity(packet.source, packet.externalId);
    const initial = batch.valid.get(identity) as Classification | undefined;
    const classification = enriched.get(identity) || initial;
    try {
      const previous = cache.get(identity);
      const enrichmentFailed = enrichmentErrors.has(identity);
      const decision = classification && initial
        ? (enrichmentFailed
          ? applyEnrichmentFailurePolicy(initial)
          : applyPolicy(classification, packet.evidenceQuality))
        : "error";
      const eventType = previous && ["approved", "review_required", "blocked"].includes(
          String(previous.status || ""),
        ) ? "evidence_updated" : "ai_assessed";
      const saved = classification && initial
        ? await saveAssessment(service, packet, previous, {
          status: decision,
          confidence: classification.moderation_confidence,
          model_version: enriched.has(identity)
            ? `${MODEL_VERSION}+web:${ENRICHMENT_MODEL}` : MODEL_VERSION,
          identity_confidence: classification.identity_confidence,
          moderation_confidence: classification.moderation_confidence,
          knowledge_source: classification.knowledge_source,
          synopsis: classification.synopsis,
          themes: classification.themes,
          risk_scores: riskScores(classification),
          flags: decision === "error"
            ? ["enrichment_failed", ...classification.flags]
            : decision === "review_required"
            ? [...classification.flags, `review_category:${reviewCategory(
              classification, packet.evidenceQuality, enrichmentFailed,
            )}`]
            : classification.flags,
          summary: decision === "error"
            ? "Evidence enrichment hit a technical error and will be retried; this is not a content-review decision."
            : classification.reasoning_summary,
          reason_for_review: decision === "review_required"
            ? reviewReason(classification, packet.evidenceQuality) : "",
        }, eventType, { recommendation: classification.recommendation,
          recognized: classification.recognized, knowledge_source: classification.knowledge_source,
          evidence_source: enriched.has(identity)
            ? "provider_metadata+web_enrichment"
            : classification.knowledge_source === "model_prior_knowledge"
            ? "model_prior_knowledge" : "provider_metadata",
          enrichment_error: enrichmentErrors.get(identity) || null, mode: MODERATION_MODE })
        : await saveAssessment(service, packet, previous, {
          status: "error", confidence: 0, identity_confidence: 0,
          moderation_confidence: 0, knowledge_source: "provider_evidence",
          synopsis: "", themes: [], risk_scores: {},
          flags: [providerFailure ? "classifier_unavailable" : batch.errors.get(identity) || "invalid_classification"],
          summary: "Automated assessment hit a technical error and will be retried; this is not a content-review decision.",
          reason_for_review: "",
        }, eventType, { failure_code: providerFailure
          ? "classifier_unavailable" : batch.errors.get(identity) || "invalid_classification",
          provider_failure_code: providerFailure || null, mode: MODERATION_MODE });
      resultByIdentity.set(identity, publicResult(saved, false));
    } catch (error) {
      console.error("Could not save book assessment", { identity,
        message: error instanceof Error ? error.message : "unknown" });
      resultByIdentity.set(identity, { source: packet.source, externalId: packet.externalId,
        status: "error", confidence: 0, evidenceQuality: packet.evidenceQuality,
        failureCode: "persistence_error", policyVersion: POLICY_VERSION, cached: false });
    }
  }

  return json({ mode: MODERATION_MODE, policyVersion: POLICY_VERSION,
    results: books.map((book) => resultByIdentity.get(moderationIdentity(book.source, book.externalId))) });
});
