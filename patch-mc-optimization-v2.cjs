#!/usr/bin/env node
'use strict';

/**
 * Patch ciblé Mč / Groq pour Social Boost Horizon.
 * - Réduit fortement le prompt envoyé à chaque requête.
 * - Sélectionne uniquement les passages pertinents de la base métier.
 * - Limite l'historique et le catalogue de compatibilité.
 * - Abaisse la limite de génération à 500 tokens.
 * - Place les consignes stables au début pour favoriser le prompt caching Groq.
 * - Ajoute un cache mémoire prudent pour quelques questions générales identiques.
 * - Journalise les compteurs de tokens Groq sans journaliser le texte des utilisateurs.
 *
 * À exécuter depuis la racine du dépôt : node .\patch-mc-optimization-v2.cjs
 * Le script crée une sauvegarde et refuse les sources inattendues / un second passage.
 */

const fs = require('node:fs');
const path = require('node:path');

const relativeFile = path.join('artifacts', 'api-server', 'src', 'routes', 'providers.ts');
const filePath = path.resolve(process.cwd(), relativeFile);

function fail(message) {
  console.error(`\nERREUR : ${message}`);
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  fail(`Fichier introuvable : ${relativeFile}\nLance ce script depuis la racine du dépôt Social Boost Horizon.`);
}

const originalSource = fs.readFileSync(filePath, 'utf8');
// Normalise CRLF before matching; Windows checkouts commonly use CRLF.
const originalLineEnding = originalSource.includes('\r\n') ? '\r\n' : '\n';
let source = originalSource.replace(/\r\n/g, '\n');
if (source.includes('MC_PROMPT_OPT_V2')) {
  fail('Le patch MC_PROMPT_OPT_V2 semble déjà installé. Aucun fichier n’a été modifié.');
}
if (!source.includes('MC_BILLING_V1') || !source.includes('router.post("/mc/chat", requireAuth')) {
  fail('La route Mč avec la facturation serveur attendue est absente. Aucun fichier n’a été modifié.');
}

function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}
function replaceExactlyOnce(haystack, needle, replacement, label) {
  const count = countOf(haystack, needle);
  if (count !== 1) fail(`Ancrage « ${label} » trouvé ${count} fois au lieu d’une seule. Aucun fichier n’a été modifié.`);
  return haystack.replace(needle, replacement);
}

const modelAnchor = 'const GROQ_MODEL = "openai/gpt-oss-120b";';
const modelHelpers = `${modelAnchor}

// MC_PROMPT_OPT_V2 — plafonds de contexte, cache opportuniste et sélection de connaissance.
const MC_CONTEXT_MAX_CHARS = 2200;
const MC_CACHE_TTL_MS = 30 * 60 * 1000;
const MC_CACHE_MAX_ENTRIES = 120;
const mcAnswerCache = new Map<string, { reply: string; expiresAt: number }>();

function normalizeMcCacheText(value: string): string {
  return String(value ?? "")
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
}

function selectRelevantMcKnowledge(question: string, maxChars = MC_CONTEXT_MAX_CHARS): string {
  const source = String(mcKnowledge ?? "");
  const sections = source.split(/(?=^##\\s)/m).map((section) => section.trim()).filter(Boolean);
  if (!sections.length) return source.slice(0, maxChars);

  const stopWords = new Set(["avec", "dans", "pour", "comment", "pourquoi", "quelle", "quelles", "quel", "quels", "estce", "etre", "avoir", "faire", "plus", "moins", "cela", "cette", "celui", "client", "service", "services", "social", "boost", "horizon", "moi", "mon", "mes", "notre", "votre", "vous", "nous", "leurs", "elles", "eux", "sur", "que", "qui", "quoi", "quand", "donc", "alors", "aussi", "tres", "bien", "peut", "peux", "veux", "veut", "sont", "comme", "mais", "sans", "une", "des", "les", "aux", "par", "pas", "est", "son", "ses", "the", "and", "how", "what", "when", "with"]);
  const queryTerms = [...new Set(normalizeMcCacheText(question).split(" ").filter((word) => word.length >= 4 && !stopWords.has(word)))].slice(0, 24);

  const ranked = sections.map((section, index) => {
    const heading = (section.match(/^##+[^\\n]*/m)?.[0] ?? "").toLowerCase();
    const normalizedSection = normalizeMcCacheText(section);
    let score = 0;
    for (const term of queryTerms) {
      if (heading.includes(term)) score += 5;
      const occurrences = normalizedSection.split(term).length - 1;
      score += Math.min(occurrences, 3);
    }
    // Fondations courtes, utiles même si la question emploie peu de mots métier.
    if (/^##\\s*1[. ]/.test(heading)) score += 2;
    if (/^##\\s*3[. ]/.test(heading)) score += 2;
    if (/^##\\s*13[. ]/.test(heading)) score += 1;
    return { section, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen: string[] = [];
  let used = 0;
  for (const item of ranked) {
    if (chosen.length >= 4 || used >= maxChars) break;
    if (chosen.length > 0 && item.score === 0) continue;
    const remaining = maxChars - used;
    if (remaining < 180) break;
    const piece = item.section.length <= remaining ? item.section : item.section.slice(0, remaining).replace(/\\s+\\S*$/, "") + " …";
    if (piece.trim()) {
      chosen.push(piece);
      used += piece.length;
    }
  }
  if (!chosen.length) return source.slice(0, maxChars);
  return chosen.join("\\n\\n[... extrait pertinent ...]\\n\\n").slice(0, maxChars);
}

function getMcCachedAnswer(key: string | null): string | null {
  if (!key) return null;
  const entry = mcAnswerCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    mcAnswerCache.delete(key);
    return null;
  }
  // L'entrée est replacée en fin de Map pour appliquer une éviction LRU simple.
  mcAnswerCache.delete(key);
  mcAnswerCache.set(key, entry);
  return entry.reply;
}

function setMcCachedAnswer(key: string | null, reply: string): void {
  if (!key || !reply.trim()) return;
  mcAnswerCache.set(key, { reply, expiresAt: Date.now() + MC_CACHE_TTL_MS });
  while (mcAnswerCache.size > MC_CACHE_MAX_ENTRIES) {
    const oldestKey = mcAnswerCache.keys().next().value;
    if (oldestKey === undefined) break;
    mcAnswerCache.delete(oldestKey);
  }
}

function makeMcCacheKey(question: string): string | null {
  const normalized = normalizeMcCacheText(question);
  if (normalized.length < 12 || normalized.length > 220) return null;
  return "mc-prompt-opt-v2:" + normalized;
}`;

source = replaceExactlyOnce(source, modelAnchor, modelHelpers, 'déclaration du modèle Groq');

const messagesPattern = /const messages = rawMessages\s*\.filter\(\(m: any\) => m && \(m\.role === "user" \|\| m\.role === "assistant"\) && typeof m\.content === "string"\)\s*\.slice\(-\d+\)\s*\.map\(\(m: any\) => \(\{ role: m\.role as "user" \| "assistant", content: String\(m\.content\)\.trim\(\)\.slice\(0, \d+\) \}\)\)\s*\.filter\(\(m: \{ role: string; content: string \}\) => m\.content\.length > 0\);/;
const newMessages = `const messages = rawMessages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-4)
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content).trim().slice(0, 900) }))
      .filter((m: { role: string; content: string }) => m.content.length > 0);`;
const messageMatches = source.match(messagesPattern);
if (!messageMatches || messageMatches.length !== 1) {
  fail('Bloc de préparation de l’historique introuvable ou structure différente. Aucun fichier n’a été modifié.');
}
source = source.replace(messagesPattern, newMessages);

source = replaceExactlyOnce(
  source,
  'const legacyCatalog = typeof body.catalogSummary === "string" ? hideMcSupplierNames(body.catalogSummary.slice(0, 9000)) : "";',
  'const legacyCatalog = typeof body.catalogSummary === "string" ? hideMcSupplierNames(body.catalogSummary.slice(0, 2200)) : "";',
  'limitation du catalogue de compatibilité'
);

const promptStart = source.indexOf('    const systemPrompt = `');
const promptEndNeedle = '`;\n\n\n    // Identité et quota contrôlés exclusivement côté serveur.';
const promptEnd = source.indexOf(promptEndNeedle, promptStart);
if (promptStart < 0 || promptEnd < 0) {
  fail('Bloc systemPrompt introuvable ou structure différente. Aucun fichier n’a été modifié.');
}
const newPromptBlock = `    // Ce message reste strictement stable : Groq peut réutiliser son préfixe via le prompt caching automatique.
    const systemPrompt = \`Tu es Mč, l’assistant de Social Boost Horizon (SBH). Réponds en français naturel, directement à la personne en la tutoyant. Tu es un conseiller compétent, humain, calme et précis, jamais un rapport technique. Réponds d’abord à la question réelle. Fais des paragraphes courts ; généralement 2 à 5 suffisent. Ne salue pas à chaque tour, ne répète pas le prénom et ne termine pas systématiquement par une question.

PÉRIMÈTRE ET FIABILITÉ
Tu aides à comprendre les services, les prix, les conditions, les commandes et les problèmes liés à Social Boost Horizon. Si une question sort du périmètre, précise brièvement ta spécialité mais aide quand même si une explication générale est utile et sûre. N’invente jamais de prix, de délai, de garantie, de qualité certifiée, de compatibilité ou de résultat. Une baisse d’interactions peut dépendre de la plateforme ; ne garantis jamais l’absence de baisse. Un badge de réapprovisionnement indique une possibilité soumise aux conditions et à la période prévues, pas une garantie absolue.

SERVICES ET RECOMMANDATIONS
Les fiches de services dans le contexte sont prioritaires sur tes connaissances générales. Lorsqu’un service est sélectionné, explique celui-là directement sans demander son nom ou son identifiant. Lorsqu’exactement deux offres sont fournies pour comparaison, compare uniquement ces deux offres dans l’ordre A puis B, explique la différence pratique et donne un conseil concret. Les références candidate_1, candidate_2, les identifiants numériques et toutes les clés techniques sont strictement internes : ne les affiche jamais. Ne montre une carte de service que si une offre est recherchée, recommandée ou réellement utile. Une demande d’explication, de définition, de dépannage ou de conseil ne déclenche pas automatiquement une liste d’offres. N’invente pas de ratio universel entre vues, likes et commentaires.

CONFIDENTIALITÉ COMMERCIALE
Ne révèle jamais les noms, abréviations, identifiants ni systèmes internes des fournisseurs. Parle uniquement des offres SBH. Traduis les termes de catalogue en conséquences simples pour le client ; signale une interprétation comme telle si le nom seul ne permet pas de l’affirmer.

FORMAT TECHNIQUE OBLIGATOIRE
À la fin, écris RECOMMENDATION_KEYS_JSON avec un tableau JSON de références candidate exactes, ou [] si aucune recommandation ne se justifie. Si seuls des éléments de catalogue hérités sont fournis sans candidats structurés, utilise RECOMMENDATIONS: [identifiants numériques exacts] uniquement lorsqu’une recommandation est réellement demandée. Écris également SUGGESTIONS_JSON avec 0 à 4 choix courts et utiles ; sinon []. Ces lignes sont internes et ne doivent jamais être présentées comme du texte visible. N’ajoute aucun commentaire après ces lignes.\`;

    // Toutes les données variables sont après les consignes stables pour favoriser les préfixes de cache.
    const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const selectedKnowledge = selectRelevantMcKnowledge(latestQuestion, MC_CONTEXT_MAX_CHARS);
    const dynamicPromptContext = \`CONTEXTE VARIABLE POUR CETTE DEMANDE
PERSONNE À AIDER
\u0024{displayName ? "Prénom affiché : " + displayName + ". Utilise-le seulement si cela rend la réponse naturelle." : "Aucun prénom fourni."}

SERVICE EXPLICITEMENT SÉLECTIONNÉ
\u0024{serviceContextJson}

LES DEUX OFFRES À COMPARER
\u0024{comparisonJson}

CANDIDATS STRUCTURÉS DU CATALOGUE
Les clés candidate_1, candidate_2, etc. sont uniquement des références internes.
\u0024{candidateJson}

ANCIEN RÉSUMÉ DE CATALOGUE (compatibilité uniquement)
\u0024{legacyCatalog || "Aucun résumé transmis."}
N’utilise ce résumé que s’il apporte des éléments absents des candidats structurés, sans mélanger leurs identifiants.

EXTRAIT PERTINENT DE LA BASE MÉTIER SBH
\u0024{selectedKnowledge}\`;
`;
source = source.slice(0, promptStart) + newPromptBlock + source.slice(promptEnd + 2);

const oldGroqBlock = `    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \u0024{apiKey}\`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.25,
        max_tokens: 850,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "");
      console.error("[mc/chat] Groq error:", groqRes.status, errText.slice(0, 500));
      throw new Error("Mč est temporairement indisponible.");
    }

    const groqData = await groqRes.json() as any;
    const rawReply = String(groqData?.choices?.[0]?.message?.content ?? "").trim();`;

const newGroqBlock = `    // Cache de réponse très prudent : uniquement question isolée, sans service/catalogue/personnalisation.
    // Il est opportuniste (mémoire du processus) ; le prompt caching Groq reste automatique côté fournisseur.
    const cacheAllowed = messages.length === 1 && !displayName && !serviceContext && safeCandidates.length === 0
      && !legacyCatalog && requestedComparisonRefs.length === 0 && latestQuestion.length <= 220;
    const answerCacheKey = cacheAllowed ? makeMcCacheKey(latestQuestion) : null;
    const cachedReply = getMcCachedAnswer(answerCacheKey);
    let rawReply = "";
    let groqData: any = null;

    if (cachedReply) {
      rawReply = cachedReply;
      console.info("[mc/chat] Réponse servie depuis le cache mémoire.");
    } else {
      const groqMessages = [
        { role: "system" as const, content: systemPrompt },
        { role: "system" as const, content: dynamicPromptContext },
        ...messages,
      ];
      const groqPayload = {
        model: GROQ_MODEL,
        messages: groqMessages,
        temperature: 0.25,
        reasoning_effort: "low",
        include_reasoning: false,
        max_tokens: 500,
      };
      const serializedPayload = JSON.stringify(groqPayload);
      const payloadBytes = Buffer.byteLength(serializedPayload, "utf8");
      console.info("[mc/chat] prompt-size", JSON.stringify({ payloadBytes, contextChars: dynamicPromptContext.length, historyMessages: messages.length, maxOutputTokens: 500 }));
      if (payloadBytes > 28000) {
        throw new Error("Le contexte de Mč dépasse la taille de sécurité. Réduisez les données de catalogue envoyées.");
      }

      const groqRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: \`Bearer \u0024{apiKey}\`,
        },
        body: serializedPayload,
        signal: AbortSignal.timeout(20000),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text().catch(() => "");
        console.error("[mc/chat] Groq error:", groqRes.status, errText.slice(0, 500));
        if (groqRes.status === 413) throw new Error("La demande envoyée à Mč est trop volumineuse. Elle a été annulée sans frais ; réessaie avec une question plus courte.");
        if (groqRes.status === 429) throw new Error("Le service d’intelligence artificielle est temporairement très sollicité. Réessaie dans quelques instants.");
        throw new Error("Mč est temporairement indisponible.");
      }

      groqData = await groqRes.json() as any;
      rawReply = String(groqData?.choices?.[0]?.message?.content ?? "").trim();
      const usage = groqData?.usage;
      console.info("[mc/chat] token-usage", JSON.stringify({
        model: GROQ_MODEL,
        promptTokens: Number(usage?.prompt_tokens) || 0,
        cachedPromptTokens: Number(usage?.prompt_tokens_details?.cached_tokens) || 0,
        completionTokens: Number(usage?.completion_tokens) || 0,
        totalTokens: Number(usage?.total_tokens) || 0,
        payloadBytes,
      }));
      if (answerCacheKey && rawReply) setMcCachedAnswer(answerCacheKey, rawReply);
    }`;

source = replaceExactlyOnce(source, oldGroqBlock, newGroqBlock, 'appel Groq et plafonds de génération');

const oldOuterCatch = `  } catch (e: any) {
    if (mcBillingReservation?.active) {
      try { await rollbackMcReservation(mcBillingReservation); }
      catch (refundError) { console.error("[mc/chat] Remboursement de sécurité impossible:", refundError); }
    }
    console.error("[mc/chat] Erreur:", e?.message);
    const wasReserved = Boolean(mcBillingReservation);
    res.status(wasReserved ? 502 : 500).json({
      success: false,
      error: wasReserved
        ? "Mč est temporairement indisponible. La réservation a été annulée lorsque cela a été possible; vérifie ton solde avant de réessayer."
        : "Une erreur est survenue pendant la préparation de la demande Mč.",
    });
  }`;
const newOuterCatch = `  } catch (e: any) {
    if (mcBillingReservation?.active) {
      try { await rollbackMcReservation(mcBillingReservation); }
      catch (refundError) { console.error("[mc/chat] Remboursement de sécurité impossible:", refundError); }
    }
    console.error("[mc/chat] Erreur:", e?.message);
    const wasReserved = Boolean(mcBillingReservation);
    const errorText = String(e?.message ?? "");
    const isPayloadError = /trop volumineuse|taille de sécurité/i.test(errorText);
    const isRateLimitError = /temporairement très sollicité/i.test(errorText);
    const statusCode = wasReserved ? (isPayloadError ? 413 : isRateLimitError ? 429 : 502) : 500;
    res.status(statusCode).json({
      success: false,
      error: wasReserved && (isPayloadError || isRateLimitError)
        ? errorText + " Aucun frais n’est conservé pour cette tentative."
        : wasReserved
          ? "Mč est temporairement indisponible. La réservation a été annulée lorsque cela a été possible; vérifie ton solde avant de réessayer."
          : "Une erreur est survenue pendant la préparation de la demande Mč.",
    });
  }`;
source = replaceExactlyOnce(source, oldOuterCatch, newOuterCatch, 'remboursement et message d’erreur de la route');

// Sauvegarde uniquement après validation complète de tous les ancrages.
const backupDir = path.resolve(process.cwd(), `.backup-mc-prompt-opt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(filePath, path.join(backupDir, 'providers.ts'));
fs.writeFileSync(filePath, originalLineEnding === '\r\n' ? source.replace(/\n/g, '\r\n') : source, 'utf8');

console.log('\nPatch MC_PROMPT_OPT_V2 appliqué.');
console.log(`Fichier modifié : ${relativeFile}`);
console.log(`Sauvegarde      : ${path.relative(process.cwd(), path.join(backupDir, 'providers.ts'))}`);
console.log('\nModifications :');
console.log(' - Base métier réduite aux extraits les plus pertinents (maximum 2 200 caractères).');
console.log(' - Historique : 4 messages maximum, 900 caractères par message.');
console.log(' - Catalogue hérité : 2 200 caractères maximum.');
console.log(' - Sortie Groq : raisonnement faible, raisonnement non exposé, maximum 500 tokens de sortie.');
console.log(' - Consignes statiques placées avant le contexte variable pour favoriser le prompt caching Groq.');
console.log(' - Petit cache mémoire TTL 30 minutes pour les rares questions générales strictement identiques et sans contexte catalogue.');
console.log(' - Journalisation de la taille de la requête et des compteurs de tokens Groq.');
console.log('\nVérifie ensuite le build et les types du serveur avant le déploiement.');
