#!/usr/bin/env node
/**
 * Mč — mise à niveau conversationnelle v3
 * À lancer depuis la racine du dépôt Social Boost Horizon :
 *   node .\patch-mc-conversation-v3.cjs
 *
 * Le script prépare tous les changements en mémoire, contrôle les repères,
 * sauvegarde les fichiers d'origine, puis écrit les fichiers modifiés.
 * Aucun paquet, module natif, app.json ou paramètre Expo n'est modifié.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = process.cwd();
const backupDir = path.join(os.tmpdir(), `sbh-mc-chat-v3-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const files = {
  mc: 'artifacts/mobile/components/McSearch.tsx',
  order: 'artifacts/mobile/app/(tabs)/new-order.tsx',
  api: 'artifacts/api-server/src/routes/providers.ts',
  knowledge: 'artifacts/api-server/src/knowledge/mc-knowledge.fr.md',
};
const eols = new Map();

function read(p) {
  const abs = path.join(root, p);
  if (!fs.existsSync(abs)) throw new Error(`Fichier introuvable : ${p}. Lance ce script depuis la racine du dépôt.`);
  const raw = fs.readFileSync(abs, 'utf8');
  eols.set(p, raw.includes('\r\n') ? '\r\n' : '\n');
  return raw.replace(/\r\n/g, '\n');
}
function write(p, content) {
  const eol = eols.get(p) || '\n';
  fs.writeFileSync(path.join(root, p), eol === '\n' ? content : content.replace(/\n/g, eol), 'utf8');
}
function once(source, oldText, newText, label) {
  if (source.includes(newText)) return source; // rend le script relançable après une exécution réussie
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`Repère introuvable pour « ${label} ». Aucun fichier n'a encore été écrit.`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`Repère ambigu pour « ${label} ». Aucun fichier n'a encore été écrit.`);
  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}
function replaceRegion(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Début de section introuvable pour « ${label} ». Aucun fichier n'a encore été écrit.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0 || end <= start) throw new Error(`Fin de section introuvable pour « ${label} ». Aucun fichier n'a encore été écrit.`);
  return source.slice(0, start) + replacement + source.slice(end);
}
function insertBefore(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  const i = source.indexOf(marker);
  if (i < 0) throw new Error(`Point d'insertion introuvable pour « ${label} ». Aucun fichier n'a encore été écrit.`);
  return source.slice(0, i) + addition + source.slice(i);
}

let mc = read(files.mc);
let order = read(files.order);
let api = read(files.api);
let knowledge = read(files.knowledge);

// ---------------------------------------------------------------------------
// 1. Mobile Mč : préserver les paragraphes, recommandations pertinentes,
//    options cliquables, contexte visible, animations d'attente et scroll.
// ---------------------------------------------------------------------------

// Conserve les retours à la ligne au lieu de réduire toute la réponse à un bloc.
{
  const start = mc.indexOf('function mcPublicText(value: unknown): string {');
  if (start < 0) throw new Error('Fonction mcPublicText introuvable dans McSearch.tsx. Aucun fichier n’a encore été écrit.');
  const end = mc.indexOf('\n}', start);
  if (end < 0) throw new Error('Fin de mcPublicText introuvable. Aucun fichier n’a encore été écrit.');
  const oldFn = mc.slice(start, end + 2);
  const newFn = String.raw`function mcPublicText(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(?:smm\s*wiz|smmwiz|mtp|exo|afrique\s*boost|afriqueboost|africa\s*boost|africaboost)\b/gi, "")
    .replace(/[|·:—–-]{2,}/g, " ")
    .replace(/^\s*[|·:—–-]+|\s*[|·:—–-]+\s*$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

function formatMcReply(value: unknown): string {
  return mcPublicText(value)
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "• ")
    .replace(/^[ \t]*[|]{1,}[ \t]*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}`;
  if (oldFn !== newFn) mc = mc.slice(0, start) + newFn + mc.slice(end + 2);
  if (!mc.includes('function formatMcReply(value: unknown): string')) {
    throw new Error('La fonction de mise en forme de réponse n’a pas été intégrée. Aucun fichier n’a encore été écrit.');
  }
}

// Permet d'afficher les choix de clarification sous forme de boutons cliquables.
mc = once(mc,
  '  recommendations?: any[];\n  isGreeting?: boolean;\n}',
  '  recommendations?: any[];\n  suggestions?: string[];\n  isGreeting?: boolean;\n}',
  'champ suggestions de McMessage');

// Affiche une progression lisible pendant que Mč travaille.
if (!mc.includes('const MC_LOADING_STAGES = [')) {
  mc = once(mc,
    '// ═══════════════════════════════════════════════════════════════\n//  Types\n// ═══════════════════════════════════════════════════════════════',
    'const MC_LOADING_STAGES = [\n  "Je comprends ta demande…",\n  "Je vérifie les informations utiles…",\n  "Je compare les éléments pertinents…",\n  "Je prépare une réponse claire…",\n];\n\n// ═══════════════════════════════════════════════════════════════\n//  Types\n// ═══════════════════════════════════════════════════════════════',
    'étapes d’attente animées de Mč');
}
mc = once(mc,
  '  const [loading, setLoading] = useState(false);\n  const [searchMode, setSearchMode] = useState<"ia" | "text">("ia");',
  '  const [loading, setLoading] = useState(false);\n  const [loadingStage, setLoadingStage] = useState(0);\n  const [searchMode, setSearchMode] = useState<"ia" | "text">("ia");',
  'état de progression de Mč');
if (!mc.includes('const loadingStageTimer = setInterval')) {
  mc = once(mc,
    '  const firstName = (userName || "").split(" ")[0] || "";\n',
    '  const firstName = (userName || "").split(" ")[0] || "";\n\n  useEffect(() => {\n    if (!loading) { setLoadingStage(0); return; }\n    const loadingStageTimer = setInterval(() => {\n      setLoadingStage((current) => (current + 1) % MC_LOADING_STAGES.length);\n    }, 1450);\n    return () => clearInterval(loadingStageTimer);\n  }, [loading]);\n',
    'animation cyclique des étapes de réponse');
}

// Corrige la transmission de l'identité exacte d'une offre et du prénom affiché.
mc = once(mc,
  '            messages: userMessages.slice(-8).map((m) => ({ role: m.role, content: mcPublicText(m.content).slice(0, 1500) })),\n            candidateServices,',
  '            messages: userMessages.slice(-8).map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 1500) })),\n            displayName: firstName,\n            candidateServices,',
  'envoi de l’historique exact et du prénom à l’API');
mc = once(mc,
  'async (userMessages: McMessage[], lastUserQuery: string): Promise<{ reply: string; recommendations: any[] }> => {',
  'async (userMessages: McMessage[], lastUserQuery: string): Promise<{ reply: string; recommendations: any[]; suggestions?: string[] }> => {',
  'type de retour des suggestions de clarification');

// Les sujets de conseil doivent passer par l'IA, pas être traités comme une simple recherche.
mc = once(mc,
  '      const asksForExplanation = /\\b(explique|expliquer|information|informations|details|detail|fonctionne|fonctionnement|condition|conditions|limite|limites|garantie|garanties|qualite|difference|differences|avantage|avantages|risque|risques|comment|pourquoi|signifie|sert|utiliser|utilisation|definition|signification|explique|explique|parle|cest|quoi|pourrait)\\b/i.test(normalizedQuery);',
  '      const asksForExplanation = /\\b(explique|expliquer|information|informations|details|detail|fonctionne|fonctionnement|condition|conditions|limite|limites|garantie|garanties|qualite|difference|differences|avantage|avantages|risque|risques|comment|pourquoi|signifie|sert|utiliser|utilisation|definition|signification|parle|cest|quoi|pourrait|astuce|astuces|conseil|conseils|baisse|baisses|chute|chutes|perdu|perte|retention|drop|refill|recharge|organique|ratio|equilibre|engagement|vote|votes|sondage|option|ameliore|ameliorer|amelioration|pourquoi|bug|disparait|disparaisse)\\b/i.test(normalizedQuery);',
  'détection des demandes de conseil et d’explication');

// Lire les suggestions structurées renvoyées par le serveur et n'afficher que des options courtes.
if (!mc.includes('const responseSuggestions: string[] =')) {
  mc = once(mc,
    '        const data = await res.json();\n        if (!data.success) throw new Error(data.error ?? "AI error");',
    '        const data = await res.json();\n        if (!data.success) throw new Error(data.error ?? "AI error");\n        const responseSuggestions: string[] = Array.isArray(data.suggestions)\n          ? data.suggestions\n              .filter((value: unknown): value is string => typeof value === "string")\n              .map((value: string) => formatMcReply(value).slice(0, 90))\n              .filter((value: string) => value.length > 0)\n              .slice(0, 4)\n          : [];',
    'lecture des options cliquables envoyées par l’API');
}
mc = once(mc,
  '          reply: mcPublicText(data.reply || "Voici ce que les informations disponibles permettent de confirmer."),\n          recommendations,',
  '          reply: formatMcReply(data.reply || "Voici ce que les informations disponibles permettent de confirmer."),\n          recommendations,\n          suggestions: responseSuggestions,',
  'retour des suggestions à l’interface');
mc = once(mc,
  '      const { reply, recommendations } = await callAI(nextMessages, text);\n      const publicReply = mcPublicText(reply);\n      setMessages(prev => [...prev, { role: "assistant", content: publicReply, recommendations }]);',
  '      const { reply, recommendations, suggestions } = await callAI(nextMessages, text);\n      const publicReply = formatMcReply(reply);\n      setMessages(prev => [...prev, { role: "assistant", content: publicReply, recommendations, suggestions }]);',
  'affichage aéré des réponses et des options');

// Normalise aussi le rendu du mode de recherche locale.
mc = once(mc,
  '    const reply = buildLocalResponse(text, localResult, userName);',
  '    const reply = formatMcReply(buildLocalResponse(text, localResult, userName));',
  'mise en forme des réponses locales');

// La fonction de rendu garde les sauts de ligne, transforme les titres Markdown
// techniques en texte simple et conserve le gras léger déjà supporté.
mc = once(mc,
  '  const renderMessageContent = (content: string, isUser: boolean) => {\n    const textColor = isUser',
  '  const renderMessageContent = (content: string, isUser: boolean) => {\n    const cleanContent = formatMcReply(content);\n    const textColor = isUser',
  'normalisation du texte affiché');
mc = once(mc,
  '    while ((match = regex.exec(content)) !== null) {\n      if (match.index > lastIndex) {\n        parts.push({ type: "text", value: content.slice(lastIndex, match.index) });',
  '    while ((match = regex.exec(cleanContent)) !== null) {\n      if (match.index > lastIndex) {\n        parts.push({ type: "text", value: cleanContent.slice(lastIndex, match.index) });',
  'parseur de mise en forme des paragraphes');
mc = once(mc,
  '    if (lastIndex < content.length) {\n      parts.push({ type: "text", value: content.slice(lastIndex) });',
  '    if (lastIndex < cleanContent.length) {\n      parts.push({ type: "text", value: cleanContent.slice(lastIndex) });',
  'fin du parseur de mise en forme');

// Options de clarification cliquables sous la bulle de Mč.
if (!mc.includes('{msg.suggestions && msg.suggestions.length > 0')) {
  mc = once(mc,
    '        {msg.recommendations && msg.recommendations.length > 0 && (\n          <View style={{ width: "100%", marginTop: 10 }}>\n            {msg.recommendations.map((svc: any, i: number) => renderServiceCard(svc, i))}\n          </View>\n        )}\n      </View>',
    '        {msg.recommendations && msg.recommendations.length > 0 && (\n          <View style={{ width: "100%", marginTop: 10 }}>\n            {msg.recommendations.map((svc: any, i: number) => renderServiceCard(svc, i))}\n          </View>\n        )}\n        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (\n          <View style={{ width: "100%", marginTop: 8, gap: 7 }}>\n            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(10,28,58,0.55)" }}>Tu peux choisir une option :</Text>\n            {msg.suggestions.map((suggestion, suggestionIndex) => (\n              <Pressable\n                key={`${idx}-suggestion-${suggestionIndex}`}\n                onPress={() => handleSend(suggestion)}\n                disabled={loading}\n                style={({ pressed }) => ({\n                  alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8,\n                  paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1,\n                  borderColor: isDark ? "rgba(212,175,55,0.35)" : "rgba(10,28,58,0.12)",\n                  backgroundColor: isDark ? "rgba(212,175,55,0.08)" : "rgba(10,28,58,0.035)",\n                  opacity: pressed ? 0.78 : 1,\n                })}\n              >\n                <Feather name="arrow-up-right" size={13} color={GOLD} />\n                <Text style={{ flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, color: isDark ? "#F8F9FA" : "#1A202C" }}>{suggestion}</Text>\n              </Pressable>\n            ))}\n          </View>\n        )}\n      </View>',
    'affichage des options de clarification cliquables');
}

// Affiche les offres exactes déjà passées à Mč pour que la personne sache de quoi on parle.
if (!mc.includes('SERVICE SÉLECTIONNÉ')) {
  mc = once(mc,
    '            {/* ─── Contenu ─── */}\n            <ScrollView',
    '            {(initialService || (initialServices && initialServices.length > 0)) && (\n              <View style={{ paddingHorizontal: 14, paddingTop: 9 }}>\n                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>\n                  {initialServices && initialServices.length > 1 ? "OFFRES SÉLECTIONNÉES" : "SERVICE SÉLECTIONNÉ"}\n                </Text>\n                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>\n                  {(initialServices && initialServices.length > 0 ? initialServices.slice(0, 2) : [initialService]).filter(Boolean).map((svc: any, svcIndex: number) => (\n                    <View key={`${svc?._platformKey ?? "service"}-${svc?.id ?? svcIndex}-${svcIndex}`} style={{ maxWidth: "100%", borderRadius: 12, borderWidth: 1, borderColor: C.accent + "55", backgroundColor: C.accent + "0D", paddingHorizontal: 10, paddingVertical: 7 }}>\n                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: C.accent, marginBottom: 2 }}>{initialServices && initialServices.length > 1 ? (svcIndex === 0 ? "OFFRE A" : "OFFRE B") : "À EXPLIQUER"}</Text>\n                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11.5, lineHeight: 16, color: C.text }} numberOfLines={2}>{mcPublicText(svc?.name) || "Service sélectionné"}</Text>\n                    </View>\n                  ))}\n                </View>\n              </View>\n            )}\n\n            {/* ─── Contenu ─── */}\n            <ScrollView',
    'étiquettes contextuelles des services sélectionnés');
}

// Animation d'état plus utile que le seul « Mč cherche ».
mc = once(mc,
  '                  <ActivityIndicator color={GOLD} size="small" />\n                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)" }}>\n                    Mč cherche pour toi…\n                  </Text>',
  '                  <ActivityIndicator color={GOLD} size="small" />\n                  <View style={{ flex: 1, gap: 6 }}>\n                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: isDark ? "rgba(255,255,255,0.78)" : "rgba(10,28,58,0.75)" }}>\n                      {MC_LOADING_STAGES[loadingStage]}\n                    </Text>\n                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>\n                      {MC_LOADING_STAGES.map((_, stageIndex) => (\n                        <View key={stageIndex} style={{ width: stageIndex === loadingStage ? 22 : 8, height: 4, borderRadius: 3, backgroundColor: stageIndex <= loadingStage ? GOLD : (isDark ? "rgba(255,255,255,0.14)" : "rgba(10,28,58,0.12)") }} />\n                      ))}\n                    </View>\n                  </View>',
  'progression visuelle de l’assistant');

// Corrige le conflit de responder qui pouvait empêcher le ScrollView de prendre les gestes.
if (mc.includes('<Pressable style={styles.backdrop} onPress={onClose}>')) {
  mc = once(mc,
    '<Pressable style={styles.backdrop} onPress={onClose}>\n          <Animated.View',
    '<View style={styles.backdrop}>\n          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />\n          <Animated.View',
    'fond non bloquant pour le défilement');
  mc = mc.replace('            onStartShouldSetResponder={() => true}\n', '');
  mc = once(mc,
    '          </Animated.View>\n        </Pressable>\n      </KeyboardAvoidingView>',
    '          </Animated.View>\n        </View>\n      </KeyboardAvoidingView>',
    'fin du conteneur scrollable de Mč');
} else if (mc.includes('<View style={styles.backdrop}>') && mc.includes('StyleSheet.absoluteFillObject')) {
  // Le correctif du conteneur est déjà présent.
} else {
  throw new Error('Structure du Modal Mč inconnue : impossible de corriger le scroll en sécurité. Aucun fichier n’a encore été écrit.');
}

// ---------------------------------------------------------------------------
// 2. Backend : ton humain, réponses aérées, contexte explicite de service,
//    suggestions cliquables et interdiction des fuites d'approvisionnement.
// ---------------------------------------------------------------------------

// Le filtre commercial doit préserver les paragraphes au lieu de les écraser.
{
  const startMarker = '    const hideMcSupplierNames = (value: string): string => value';
  const endMarker = '\n\n    const sanitizeService =';
  if (api.includes(startMarker)) {
    const replacement = String.raw`    const hideMcSupplierNames = (value: string): string => value
      .replace(/\b(?:smm\s*wiz|smmwiz|mtp|exo|afrique\s*boost|afriqueboost|africa\s*boost|africaboost)\b/gi, "")
      .replace(/[|·:—–-]{2,}/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .trim();`;
    api = replaceRegion(api, startMarker, endMarker, replacement, 'préservation des paragraphes côté API');
  } else if (!api.includes('.replace(/[ \t]*\\n[ \t]*/g, "\\n")')) {
    throw new Error('Filtre hideMcSupplierNames introuvable. Aucun fichier n’a encore été écrit.');
  }
}

// Transmet seulement le prénom public, pas le profil complet.
if (!api.includes('const displayName = typeof body.displayName')) {
  api = once(api,
    '    const body = (req.body ?? {}) as Record<string, unknown>;\n    const rawMessages = body.messages;',
    '    const body = (req.body ?? {}) as Record<string, unknown>;\n    const displayName = typeof body.displayName === "string" ? body.displayName.trim().split(/\\s+/)[0].slice(0, 40) : "";\n    const rawMessages = body.messages;',
    'lecture du prénom de conversation');
}

// Injection explicite du contexte service dans le prompt système. Avant ce patch,
// le serveur recevait serviceContext mais ne le mettait pas en section dédiée du prompt.
if (!api.includes('const serviceContextJson = serviceContext ? JSON.stringify')) {
  api = once(api,
    '    const comparisonJson = comparisonCandidates.length === 2\n      ? JSON.stringify(comparisonCandidates)\n      : "Aucune comparaison explicite de deux offres.";',
    '    const comparisonJson = comparisonCandidates.length === 2\n      ? JSON.stringify(comparisonCandidates)\n      : "Aucune comparaison explicite de deux offres.";\n    const serviceContextJson = serviceContext ? JSON.stringify({\n      key: serviceContext.key, id: serviceContext.id, name: serviceContext.name,\n      platform: serviceContext.platform, category: serviceContext.category, type: serviceContext.type,\n      priceXAF: serviceContext.priceXAF, min: serviceContext.min, max: serviceContext.max,\n      refill: serviceContext.refill, cancel: serviceContext.cancel, isPackage: serviceContext.isPackage,\n      isPerOne: serviceContext.isPerOne, averageTime: serviceContext.averageTime, description: serviceContext.description,\n    }) : "Aucun service unique n’a été explicitement sélectionné.";',
    'objet JSON explicite du service sélectionné');
}

const newSystemPrompt = String.raw`    const systemPrompt = \`Tu es Mč, l’assistant d’accompagnement client de Social Boost Horizon (SBH).

PERSONNE À AIDER
\${displayName ? "Le prénom affiché est " + displayName + ". Utilise-le seulement si cela rend la réponse naturelle, pas à chaque message." : "Aucun prénom n’est fourni."}

TON ET CONVERSATION
- Parle directement à la personne en utilisant « tu » et « ton/ta ». Ne dis jamais « l’utilisateur doit », « le client doit » ou « selon les données disponibles » comme dans un compte rendu technique.
- Réponds comme un conseiller compétent et humain : chaleureux, calme, naturel et précis. Ne joue pas au meilleur ami et n’abuse pas des familiarités.
- Ne salue pas à chaque réponse. Salue seulement si la personne vient de saluer ou au début réel d’une nouvelle conversation. Ne répète pas son prénom pour rien.
- Commence par la réponse utile. Explique les choses à la place de la personne au lieu de lui réciter les champs d’une fiche.
- Utilise des paragraphes courts séparés par une ligne vide. En général, 2 à 5 petits paragraphes suffisent. Les puces sont réservées aux listes qui aident réellement. Pas de titres Markdown avec dièses, pas de longues listes mécaniques, pas d’étoiles décoratives, pas de jargon interne. Un ou deux emojis peuvent aider, mais n’en ajoute pas partout.
- Ne termine pas automatiquement chaque réponse par une question. Propose la prochaine étape seulement quand cela aide vraiment.

LE CONTEXTE EXACT DU SERVICE SÉLECTIONNÉ
\${serviceContextJson}
Si ce contexte contient un service, c’est le sujet principal de la demande. N’oblige jamais la personne à retaper son nom ou à renvoyer son identifiant. Explique directement cette offre en utilisant son nom, sa plateforme et les éléments qu’elle contient.

LES DEUX OFFRES À COMPARER
\${comparisonJson}
Si deux offres sont listées ci-dessus, compare exclusivement celles-là et garde l’ordre Offre A / Offre B. Ne remplace aucune des deux par un autre service. Ne renvoie pas un rapport d’audit. Explique naturellement ce que la différence signifie pour la personne, et finis par un conseil concret adapté à son objectif.

CANDIDATS DU CATALOGUE
Les références candidate_1, candidate_2, etc. sont des clés techniques qui ne doivent jamais être vues par la personne. Elles servent uniquement à relier une recommandation à une fiche précise.
\${candidateJson}

ANCIEN RÉSUMÉ DE CATALOGUE (compatibilité avec les anciennes versions mobiles)
\${legacyCatalog || "Aucun résumé transmis par une version antérieure."}
Si aucun candidat structuré n’est fourni mais que ce résumé contient des offres, tu peux en utiliser les identifiants numériques uniquement pour une recommandation réellement demandée. Ne mélange jamais ces identifiants avec les références candidate_1.

BASE MÉTIER
\${mcKnowledge}

RÈGLES DE FOND
1. Réponds à la vraie question. Une explication générale, une demande de conseil ou une question sur les baisses ne doit pas déclencher une liste d’offres aléatoires.
2. Ne donne une carte de service que si la personne cherche une offre, demande une recommandation ou si montrer l’offre est réellement utile. Ne ramène pas toutes les questions à Instagram.
3. Utilise le nom du service pour en comprendre le sens, y compris lorsqu’il est en anglais. Explique simplement les mots comme « medium quality », « high quality », « refill », « non-drop », « vote option A », « live viewers », « members » ou les autres termes lisibles dans l’intitulé. Présente une interprétation comme telle lorsque le nom seul ne suffit pas à en faire une garantie.
4. Pour un vote « Option A » ou « Option B », explique que le service semble viser le choix portant ce nom dans le sondage. Il faut que l’option de la commande corresponde bien à l’option affichée dans le sondage. Ne présente pas cela comme un identifiant magique indépendant des options réelles.
5. Si une offre porte un badge de réapprovisionnement (« refill »), explique simplement que ce mécanisme peut permettre de demander le réapprovisionnement des interactions perdues via l’historique des commandes, pendant la période prévue pour l’offre. Précise que ce n’est pas une promesse qu’aucune baisse n’arrivera et n’invente pas la durée si elle n’est pas indiquée.
6. En cas de baisse, explique calmement qu’une plateforme peut retirer des interactions et que le maintien n’est pas identique sur toutes les offres. Conseille de vérifier l’état et la période de l’offre, puis d’utiliser l’option de réapprovisionnement si elle est disponible. Ne garantis jamais un résultat.
7. Pour des conseils de cohérence, suggère des quantités proportionnées entre vues, mentions J’aime et commentaires, sans annoncer de ratio universel. Les vues sont généralement plus nombreuses que les likes, mais cela dépend du contenu et de la plateforme. Une proportion cohérente ne garantit ni authenticité ni absence de baisse.
8. Ne révèle jamais le nom d’un fournisseur, ni ses abréviations, ni son système interne, ni une référence d’approvisionnement. Parle uniquement des offres du catalogue Social Boost Horizon. N’affiche jamais les ID numériques ou refs candidate_1.
9. N’invente jamais un délai, une garantie, une qualité certifiée, une origine de trafic, un effet algorithmique, une compatibilité ou une promesse commerciale. Si la fiche est incomplète, réfléchis d’abord à ce que le nom permet raisonnablement de comprendre. Ne dis pas froidement « description absente » ou « champ non renseigné » : explique ce qu’on peut en déduire simplement, et indique discrètement la limite seulement si elle change la décision.
10. En comparaison, commence par le résultat compréhensible : « La différence principale, c’est… ». Traduis les étiquettes en conséquences pratiques. N’énumère prix, minimum, maximum et cases internes que si cela aide réellement. Si les deux noms disent « qualité moyenne » et « haute qualité », explique la nuance sans prétendre qu’elle est certifiée. Si l’écart est minime, dis-le clairement.
11. Pose au maximum une question de clarification, seulement si tu ne peux pas aider correctement sans elle. Lorsque tu poses une question de choix, produis aussi 2 à 4 choix courts et directement sélectionnables dans SUGGESTIONS_JSON.
12. Si la demande est hors du périmètre SBH, dis avec tact que tu es spécialisé dans l’aide sur SBH, puis donne l’explication générale utile si elle est sûre et pertinente.
13. La demande d’information ne constitue pas une demande de recherche. Les demandes de comparaison, d’explication, de conseils, de définition, de conditions ou de dépannage ne doivent pas forcer des recommandations.
14. Ne demande pas au client de fournir un nom/identifiant de service quand les fiches ci-dessus l’identifient déjà.

SORTIE TECHNIQUE (NE JAMAIS L’AFFICHER DANS LA RÉPONSE VISIBLE)
À la toute fin, si des candidats structurés sont fournis, écris une ligne RECOMMENDATION_KEYS_JSON contenant un tableau JSON de références candidate exactes. Mets [] si aucune carte de service ne se justifie. Si aucun candidat structuré n’est fourni mais que l’ancien résumé contient des offres, utilise à la place la ligne héritée RECOMMENDATIONS: [identifiants numériques exacts] uniquement si une recommandation est réellement demandée.
Écris aussi une ligne SUGGESTIONS_JSON contenant un tableau JSON de 0 à 4 réponses courtes à cliquer, uniquement si elles aident à préciser le choix ou à poursuivre. Ne mets pas de question à cliquer qui demande de recopier la même question. Dans les autres cas, mets [].
Exemples de lignes techniques :
RECOMMENDATION_KEYS_JSON: ["candidate_1"]
SUGGESTIONS_JSON: ["Je veux connaître les conditions", "Je veux comparer les prix"]
Ces lignes ne font pas partie du texte destiné à la personne.\`;
`;
const finalizedPrompt = newSystemPrompt
  .replaceAll('\\${', '${')
  .replaceAll('\\`', '`');
if (!api.includes('Tu es Mč, l’assistant d’accompagnement client de Social Boost Horizon')) {
  api = replaceRegion(api,
    '    const systemPrompt = `Tu es Mč, l\'assistant spécialisé de Social Boost Horizon.',
    '\n\n    const groqRes = await fetch',
    finalizedPrompt,
    'prompt conversationnel complet de Mč');
}

// Parse les options pour l'interface. Elles ne doivent jamais être visibles dans le texte.
if (!api.includes('const suggestionsMatch = rawReply.match(/SUGGESTIONS_JSON:')) {
  api = insertBefore(api,
    '    const cleanReply = hideMcSupplierNames(rawReply',
    `    const suggestionsMatch = rawReply.match(/SUGGESTIONS_JSON:\\s*(\\[[\\s\\S]*?\\])/i);\n    let suggestions: string[] = [];\n    if (suggestionsMatch) {\n      try {\n        const parsedSuggestions = JSON.parse(suggestionsMatch[1]);\n        if (Array.isArray(parsedSuggestions)) {\n          suggestions = [...new Set(parsedSuggestions\n            .filter((value: unknown): value is string => typeof value === "string")\n            .map((value: string) => hideMcSupplierNames(value).slice(0, 90))\n            .filter((value: string) => value.length > 0))].slice(0, 4);\n        }\n      } catch { suggestions = []; }\n    }\n\n`,
    'lecture des suggestions JSON côté API');
}
// Supprime les métadonnées de recommandation ET de suggestions du texte visible.
if (!api.includes('.replace(/SUGGESTIONS_JSON:')) {
  api = once(api,
    '      .replace(/RECOMMENDATIONS:\\s*\\[[^\\]]*\\]/gi, "")\n      .trim());',
    '      .replace(/RECOMMENDATIONS:\\s*\\[[^\\]]*\\]/gi, "")\n      .replace(/SUGGESTIONS_JSON:\\s*\\[[\\s\\S]*?\\]/gi, "")\n      .trim());',
    'suppression des suggestions techniques du texte');
}
if (!api.includes('      suggestions,\n      // Champ numérique conservé')) {
  api = once(api,
    '      recommendationRefs: typeof recommendationRefs !== "undefined" ? recommendationRefs : [],\n      // Champ numérique conservé pour ne pas casser les anciennes versions mobiles.',
    '      recommendationRefs: typeof recommendationRefs !== "undefined" ? recommendationRefs : [],\n      suggestions,\n      // Champ numérique conservé pour ne pas casser les anciennes versions mobiles.',
    'retour des suggestions structurées');
}

// Ajoute les conseils validés à la base de connaissances déjà créée par l'utilisateur.
const kbMarker = '## 18. CONVERSATION NATURELLE, CONSEILS ET INTERPRÉTATION DES OFFRES';
if (!knowledge.includes(kbMarker)) {
  knowledge += `\n\n${kbMarker}\n\n### Parler à une personne, pas rédiger un compte rendu\n\nMč répond directement à la personne, avec « tu ». Il explique ce que cela signifie concrètement dans sa situation. Il ne dit jamais « l'utilisateur doit », « la fiche indique », « aucune description n'est disponible » ou « les données disponibles ne permettent pas de confirmer » lorsque le nom de l'offre permet déjà de donner une explication utile. Il ne révèle pas les champs ou les mécanismes internes de l'application. Les limites doivent être formulées simplement et seulement lorsqu'elles influencent la décision.\n\nLes réponses sont aérées : de courts paragraphes séparés par une ligne vide. Pas de rapport d'audit, pas de jargon, pas de gros bloc de texte, pas de titre avec des dièses. Une ou deux émoticônes peuvent humaniser la réponse sans devenir décoratives. Le prénom fourni par l'application est utilisé avec parcimonie. Une salutation n'est nécessaire qu'au début de l'échange ou si le client salue.\n\n### Lire les noms de services avec intelligence\n\nLes noms peuvent contenir des termes anglais, des codes ou une précision de ciblage. Mč doit les traduire et expliquer leur conséquence probable dans des mots simples, plutôt que recopier le nom sans l'expliquer. Exemples :\n\n- « Members » signifie généralement membres d'un groupe, d'une chaîne ou d'une communauté selon la plateforme.\n- « Medium quality » ou « qualité moyenne » désigne habituellement un niveau intermédiaire tel qu'il est étiqueté dans le catalogue. Ce libellé n'est pas une certification indépendante ni une garantie de rétention.\n- « High quality » ou « haute qualité » est un niveau annoncé par le nom de l'offre ; ne prétends pas qu'il a été testé ou certifié par SBH si ce n'est pas documenté.\n- « Non-drop » signifie que l'offre est présentée comme visant à limiter les baisses. Cela ne garantit pas qu'aucune interaction ne disparaîtra.\n- « Refill » désigne une possibilité de réapprovisionnement. Explique qu'elle peut permettre de récupérer le volume perdu via l'option prévue dans l'historique des commandes, pendant la période applicable. Ne promets pas une période précise sans donnée réelle.\n- « Live viewers » désigne généralement des spectateurs associés à une diffusion en direct. Les conditions d'activation et le lien attendu doivent suivre les informations de l'offre.\n- « Vote Option A », « Option B », « Option 1 » ou équivalent indique généralement la réponse ciblée dans un sondage. Pour WhatsApp, l'option de l'offre doit correspondre au choix réellement affiché dans le sondage. Si l'ordre des choix a changé ou si l'intitulé est ambigu, invite la personne à vérifier ce point avant de commander. Ne prétends pas que les votes vont automatiquement vers une option simplement parce que la commande est passée : l'offre choisie doit cibler la bonne option.\n\n### Conseils pratiques sur les baisses et le réapprovisionnement\n\nDes interactions peuvent diminuer après une commande. Selon la plateforme et le type de service, cela peut venir de contrôles ou de suppressions par la plateforme, ou des conditions particulières de l'offre. Mč ne doit pas faire croire qu'une baisse est toujours normale, ni promettre qu'elle n'arrivera pas. Conseille d'abord de vérifier l'état de la commande et le délai réellement annoncé.\n\nSi l'offre dispose d'un badge/option de réapprovisionnement, explique à la personne de consulter l'historique des commandes et d'utiliser l'action de réapprovisionnement lorsqu'elle est disponible et que les conditions de cette offre sont encore valides. Le réapprovisionnement vise à compenser une baisse admissible ; il ne signifie pas que le compteur restera définitivement fixe. S'il n'y a pas de cette option, n'invente aucune garantie.\n\nAvant de commander, aide la personne à vérifier le lien exact, le compte ou contenu ciblé, les limites et les conditions indiquées. Pour limiter les surprises, les offres avec réapprovisionnement peuvent être préférables lorsque le maintien des quantités compte beaucoup, même si elles coûtent parfois davantage. Présente cela comme un critère de choix, pas comme une promesse de résultat.\n\n### Conseils de cohérence des interactions\n\nQuand quelqu'un demande comment améliorer la cohérence de sa présence, explique que les vues, likes et commentaires doivent rester raisonnablement proportionnés à la taille du contenu et à son audience. Les vues sont souvent plus nombreuses que les likes ; les commentaires sont généralement moins nombreux que les vues, mais il n'existe pas de ratio unique valable sur toutes les plateformes. Évite de présenter les likes comme une preuve d'audience réelle ou d'affirmer qu'un ratio précis empêchera les baisses.\n\nConseils simples : commencer par une quantité adaptée, éviter des quantités incohérentes entre les indicateurs, utiliser le bon lien, vérifier les conditions du service et préférer une offre avec réapprovisionnement quand une protection contre les baisses est importante. Ces précautions ne garantissent pas une diffusion organique, des ventes, une meilleure portée algorithmique ou une absence de suppression.\n\n### Comment comparer sans afficher un rapport technique\n\nCommence par nommer la différence qui compte dans les mots de la personne : plateforme, action visée, option de sondage, niveau annoncé, prix par unité ou possibilité de réapprovisionnement. Puis explique ce que cela change dans le choix. N'énumère pas les champs absents. Si aucun détail supplémentaire ne différencie réellement les offres, dis simplement que les éléments les plus utiles à comparer sont le sens du nom, le prix et les conditions pratiques. Ne dis jamais froidement « la seule différence visible est le libellé » sans avoir d'abord traduit ce libellé.\n\n### Clarifications interactives\n\nSi une question indispensable reste à éclaircir, pose une question courte puis propose de deux à quatre choix formulés comme des réponses naturelles cliquables. Les choix ne doivent pas demander au client de recopier une phrase. Si tu as déjà les deux offres choisies ou la fiche précise du service, ne demande jamais le nom du service une deuxième fois.\n\n### Discrétion commerciale\n\nLes identifiants numériques internes, les clés de comparaison et les noms/abréviations des sources d'approvisionnement ne sont pas destinés aux clients. Mč ne les affiche ni dans ses réponses, ni dans les exemples, ni dans les recommandations. Il parle de l'offre du catalogue Social Boost Horizon.\n`;
}

// Vérifications finales avant toute écriture.
const finalChecks = [
  [files.mc, mc, 'function formatMcReply(value: unknown): string'],
  [files.mc, mc, 'suggestions: responseSuggestions'],
  [files.mc, mc, 'SERVICE SÉLECTIONNÉ'],
  [files.mc, mc, 'MC_LOADING_STAGES[loadingStage]'],
  [files.mc, mc, 'StyleSheet.absoluteFillObject'],
  [files.api, api, 'serviceContextJson = serviceContext ? JSON.stringify'],
  [files.api, api, 'SUGGESTIONS_JSON:'],
  [files.api, api, 'Parle directement à la personne'],
  [files.api, api, '      suggestions,\n      // Champ numérique conservé'],
  [files.knowledge, knowledge, kbMarker],
];
for (const [file, content, marker] of finalChecks) {
  if (!content.includes(marker)) throw new Error(`Vérification finale échouée dans ${file} : « ${marker} ». Aucun fichier n'a encore été écrit.`);
}

// Ne sauvegarde et n'écrit qu'après avoir fini toutes les transformations.
fs.mkdirSync(backupDir, { recursive: true });
for (const p of [files.mc, files.order, files.api, files.knowledge]) {
  fs.copyFileSync(path.join(root, p), path.join(backupDir, p.replace(/[\\/]/g, '__') + '.bak'));
}
write(files.mc, mc);
write(files.api, api);
write(files.knowledge, knowledge);
// new-order.tsx est lu pour vérifier que le comparateur et les contextes créés avant existent,
// mais cette version ne le réécrit pas : l'intégration précédente reste inchangée.

console.log('\n✅ Mise à niveau conversationnelle de Mč appliquée.');
console.log('Fichiers mis à jour :');
console.log(`  - ${files.mc}`);
console.log(`  - ${files.api}`);
console.log(`  - ${files.knowledge}`);
console.log(`Sauvegardes : ${backupDir}`);
console.log('\nVérifie maintenant (aucun build APK) :');
console.log('  cd artifacts/api-server');
console.log('  pnpm run typecheck');
console.log('  pnpm run build');
console.log('  cd ..\\mobile');
console.log('  pnpm run typecheck');
console.log('\nDéploie le backend en premier, puis publie ton OTA EAS Update habituel.');
