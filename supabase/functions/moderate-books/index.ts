import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyBooks, enrichBook, ENRICHMENT_MODEL, MODEL_VERSION } from "./classifier.ts";
import { planBookAssessments, safeEvidenceForStorage, type EvidencePacket } from "./evidence.ts";
import { applyEnrichmentFailurePolicy, applyPolicy, MODERATION_MODE,
  POLICY_VERSION, reviewReason, shouldEnrichBook } from "./policy.ts";

import { moderationIdentity, validateRequestBody, type Classification } from "./schema.ts";

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
    "id,title,author,isbn,genre,description,cover_url,language,publisher,publication_year,source,external_id"
  ).in("source", sources).in("external_id", externalIds);
  const stored = new Map((storedRows || []).map((row) => [moderationIdentity(row.source, row.external_id), row]));

  const resultByIdentity = new Map<string, Record<string, unknown>>();
  const plan = planBookAssessments(books, cache, stored);
  plan.cached.forEach((assessment, identity) => {
    resultByIdentity.set(identity, publicResult(assessment, true));
  });
  const unknownPackets = plan.unknown;

  // Sparse packets still reach the classifier so reliable prior knowledge can identify exact works.
  const eligible = unknownPackets;
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
      const saved = classification && initial
        ? await saveAssessment(service, packet, cache.get(identity), {
          status: enrichmentErrors.has(identity)
            ? applyEnrichmentFailurePolicy(initial) : applyPolicy(classification),
          confidence: classification.moderation_confidence,
          model_version: enriched.has(identity)
            ? `${MODEL_VERSION}+web:${ENRICHMENT_MODEL}` : MODEL_VERSION,
          identity_confidence: classification.identity_confidence,
          moderation_confidence: classification.moderation_confidence,
          knowledge_source: classification.knowledge_source,
          synopsis: classification.synopsis,
          themes: classification.themes,
          risk_scores: riskScores(classification), flags: classification.flags,
          summary: classification.reasoning_summary,
          reason_for_review: (enrichmentErrors.has(identity)
            ? applyEnrichmentFailurePolicy(initial) : applyPolicy(classification)) === "review_required"
            ? reviewReason(classification) : "",
        }, "ai_assessed", { recommendation: classification.recommendation,
          recognized: classification.recognized, knowledge_source: classification.knowledge_source,
          evidence_source: enriched.has(identity) ? "provider_metadata+web_enrichment" : "provider_metadata",
          enrichment_error: enrichmentErrors.get(identity) || null, mode: MODERATION_MODE })
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
