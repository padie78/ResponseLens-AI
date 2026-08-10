/**
 * Informe de vida digital de la marca propia (reputación).
 * Offline heuristics + markdown para render en el panel de informe.
 */

import { detectReplyLanguage, buildLocalTriage } from './local-fallback.js';
import { scoreFrustration } from './competitor-opportunity.js';
import { detectThemes } from './theme-rules.js';
import { classifySentiment } from './competitor-scan.js';

/**
 * @param {{
 *   companyName: string,
 *   mentions?: Array<{ text?: string, originalComplaint?: string, sourceUrl?: string, channel?: string, _sentiment?: string }>,
 *   whatTheySell?: string,
 *   brandVoiceNotes?: string | null,
 *   industry?: string,
 *   knownRisks?: string,
 *   aliases?: string[],
 * }} input
 */
export function buildLocalOwnBrandReport(input) {
  const brand = String(input.companyName || 'Tu marca').trim() || 'Tu marca';
  const mentions = (input.mentions || [])
    .map((m) => {
      const text = String(m.text || m.originalComplaint || '').trim();
      return {
        text,
        sourceUrl: m.sourceUrl || '',
        channel: m.channel || m._source || '',
        sentiment: m._sentiment || m.sentiment || (text ? classifySentiment(text) : 'NEUTRAL'),
      };
    })
    .filter((m) => m.text.length > 0)
    .slice(0, 24);

  const corpus = mentions.map((m) => m.text).join('\n') || brand;
  const lang = detectReplyLanguage(corpus);
  const triage = buildLocalTriage(corpus);
  const themes = detectThemes(corpus, lang);
  const avgFrustration =
    mentions.length > 0
      ? mentions.reduce((s, m) => s + scoreFrustration(m.text), 0) / mentions.length
      : 0;

  const sentimentCounts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0 };
  for (const m of mentions) {
    const s = String(m.sentiment || 'NEUTRAL').toUpperCase();
    if (s in sentimentCounts) sentimentCounts[s] += 1;
    else sentimentCounts.NEUTRAL += 1;
  }

  const conclusions = buildOwnConclusions({
    lang,
    brand,
    themes,
    triage,
    avgFrustration,
    mentionCount: mentions.length,
    sentimentCounts,
    industry: input.industry,
    knownRisks: input.knownRisks,
    whatTheySell: input.whatTheySell,
  });

  const actions = buildOwnActions({
    lang,
    brand,
    themes,
    sentimentCounts,
    triage,
    knownRisks: input.knownRisks,
    brandVoiceNotes: input.brandVoiceNotes,
  });

  const reportMarkdown = buildOwnMarkdown({
    lang,
    brand,
    themes,
    conclusions,
    actions,
    mentions,
    triage,
    avgFrustration,
    sentimentCounts,
    industry: input.industry,
    whatTheySell: input.whatTheySell,
    aliases: input.aliases,
  });

  return {
    competitorName: brand,
    _reportKind: 'own_brand',
    language: lang,
    mentionCount: mentions.length,
    avgFrustration: Number(avgFrustration.toFixed(2)),
    riskLevel: mentions.length ? triage.riskLevel : 'LOW',
    themes: mentions.length ? themes : [],
    conclusions,
    opportunities: actions,
    sentimentCounts,
    reportMarkdown,
    model: 'local-own-brand-digital-life',
    generatedAt: new Date().toISOString(),
    sources: mentions.map((m) => m.sourceUrl).filter(Boolean).slice(0, 10),
  };
}

function buildOwnConclusions({
  lang,
  brand,
  themes,
  triage,
  avgFrustration,
  mentionCount,
  sentimentCounts,
  industry,
  knownRisks,
  whatTheySell,
}) {
  const themeLabels = themes.map((t) => t.label).filter(Boolean).join(', ') || (lang === 'en' ? 'general' : 'general');
  const pos = sentimentCounts.POSITIVE || 0;
  const neg = sentimentCounts.NEGATIVE || 0;
  const neu = (sentimentCounts.NEUTRAL || 0) + (sentimentCounts.MIXED || 0);

  if (!mentionCount) {
    if (lang === 'en') {
      return [
        `No live digital mentions of ${brand} in this sample.`,
        `Run Scan brand (HN · Reddit · News · YouTube) or open your channels so the extension can read the page.`,
        knownRisks ? `Watchlist from config: ${knownRisks}` : `Add common risks in Config → My company to sharpen future reports.`,
      ];
    }
    return [
      `Sin menciones live de ${brand} en esta muestra.`,
      `Corré Escanear marca (HN · Reddit · News · YouTube) o abrí tus canales para que el plugin lea la página.`,
      knownRisks
        ? `Riesgos en ficha: ${knownRisks}`
        : `Agregá quejas/riesgos frecuentes en Config → Mi empresa para afilar informes.`,
    ];
  }

  if (lang === 'en') {
    return [
      `How the web talks about ${brand}: ${pos} positive · ${neg} negative · ${neu} neutral/mixed (${mentionCount} mentions).`,
      `Dominant themes: ${themeLabels}. Avg friction ${avgFrustration.toFixed(2)}; risk band ${triage.riskLevel}.`,
      industry ? `Industry lens: ${industry}.` : `Add industry in Config to contextualize the reading.`,
      whatTheySell
        ? `Offer framing in replies: ${whatTheySell}.`
        : `Fill “what you sell” so defense replies stay on-message.`,
      knownRisks ? `Known risk watchlist: ${knownRisks}` : `No stored risk notes — lean on live themes.`,
      triage.escalationFlags?.length
        ? `Escalation flags in corpus: ${triage.escalationFlags.join(', ')}.`
        : `No critical legal/safety flags in the sample.`,
    ];
  }

  return [
    `Cómo se habla de ${brand} en digital: ${pos} positivas · ${neg} negativas · ${neu} neutras/mixtas (${mentionCount} menciones).`,
    `Temas dominantes: ${themeLabels}. Fricción media ${avgFrustration.toFixed(2)}; banda de riesgo ${triage.riskLevel}.`,
    industry ? `Lente de industria: ${industry}.` : `Completá industria en Config para contextualizar la lectura.`,
    whatTheySell
      ? `Marco de oferta en respuestas: ${whatTheySell}.`
      : `Completá “qué vende” para que las respuestas de defensa mantengan el mensaje.`,
    knownRisks ? `Watchlist de riesgos: ${knownRisks}` : `Sin riesgos en ficha — basate en temas live.`,
    triage.escalationFlags?.length
      ? `Banderas de escalamiento: ${triage.escalationFlags.join(', ')}.`
      : `Sin banderas legales/safety críticas en la muestra.`,
  ];
}

function buildOwnActions({ lang, brand, themes, sentimentCounts, triage, knownRisks, brandVoiceNotes }) {
  const theme = themes[0]?.label || (lang === 'en' ? 'service quality' : 'calidad de servicio');
  const neg = sentimentCounts.NEGATIVE || 0;
  const pos = sentimentCounts.POSITIVE || 0;

  if (lang === 'en') {
    return [
      neg > pos
        ? `Prioritize public acknowledgment on ${theme}; move heated threads to DM when the triage says PRIVATE_DM / ESCALATE.`
        : `Amplify positive proof (${theme}) in owned channels; keep a light reply cadence on neutral mentions.`,
      `Use ResponseLens triage + 3 tones before posting; match brand voice${brandVoiceNotes ? `: ${String(brandVoiceNotes).slice(0, 120)}` : ''}.`,
      knownRisks
        ? `Pre-brief support on: ${knownRisks}.`
        : `Document recurring complaints in Config → known risks after each scan.`,
      triage.riskLevel === 'HIGH' || triage.riskLevel === 'CRITICAL'
        ? `Hold public boasting until the high-risk cluster is answered.`
        : `Safe to engage publicly with short, factual replies.`,
      `Re-scan weekly and compare sentiment mix for ${brand}.`,
    ].filter(Boolean);
  }

  return [
    neg > pos
      ? `Priorizá reconocimiento público sobre ${theme}; pasá a DM si el triage pide PRIVATE_DM / ESCALATE.`
      : `Amplificá prueba positiva (${theme}) en canales propios; ritmo liviano en menciones neutras.`,
    `Usá triage + 3 tonos antes de publicar; alineá voz de marca${brandVoiceNotes ? `: ${String(brandVoiceNotes).slice(0, 120)}` : ''}.`,
    knownRisks
      ? `Brief a soporte sobre: ${knownRisks}.`
      : `Documentá quejas recurrentes en Config → riesgos tras cada escaneo.`,
    triage.riskLevel === 'HIGH' || triage.riskLevel === 'CRITICAL'
      ? `Evitá autobombo público hasta cerrar el cluster de alto riesgo.`
      : `Seguro responder en público con respuestas cortas y factuales.`,
    `Re-escaneá semanalmente y compará el mix de sentimiento de ${brand}.`,
  ].filter(Boolean);
}

function buildOwnMarkdown({
  lang,
  brand,
  themes,
  conclusions,
  actions,
  mentions,
  triage,
  avgFrustration,
  sentimentCounts,
  industry,
  whatTheySell,
  aliases,
}) {
  const es = lang !== 'en';
  const lines = [];
  lines.push(es ? `# Vida digital · ${brand}` : `# Digital life · ${brand}`);
  lines.push('');
  if (industry) lines.push(es ? `**Industria:** ${industry}` : `**Industry:** ${industry}`);
  if (whatTheySell) lines.push(es ? `**Oferta:** ${whatTheySell}` : `**Offer:** ${whatTheySell}`);
  if (aliases?.length) {
    lines.push(es ? `**También como:** ${aliases.join(', ')}` : `**Also as:** ${aliases.join(', ')}`);
  }
  lines.push('');
  lines.push(es ? `## Cómo nos ven` : `## How we are seen`);
  lines.push(
    es
      ? `- Menciones: **${mentions.length}** · Riesgo: **${triage.riskLevel}** · Fricción media: **${avgFrustration.toFixed(2)}**`
      : `- Mentions: **${mentions.length}** · Risk: **${triage.riskLevel}** · Avg friction: **${avgFrustration.toFixed(2)}**`,
  );
  lines.push(
    es
      ? `- Sentimiento: +${sentimentCounts.POSITIVE} / −${sentimentCounts.NEGATIVE} / ~${sentimentCounts.NEUTRAL + sentimentCounts.MIXED}`
      : `- Sentiment: +${sentimentCounts.POSITIVE} / −${sentimentCounts.NEGATIVE} / ~${sentimentCounts.NEUTRAL + sentimentCounts.MIXED}`,
  );
  if (themes.length) {
    lines.push('');
    lines.push(es ? `## Temas` : `## Themes`);
    for (const t of themes.slice(0, 6)) lines.push(`- ${t.label || t.id}`);
  }
  lines.push('');
  lines.push(es ? `## Lectura` : `## Reading`);
  for (const c of conclusions) lines.push(`- ${c}`);
  lines.push('');
  lines.push(es ? `## Acciones de reputación` : `## Reputation actions`);
  for (const a of actions) lines.push(`- ${a}`);
  if (mentions.length) {
    lines.push('');
    lines.push(es ? `## Muestra de menciones` : `## Mention sample`);
    for (const m of mentions.slice(0, 8)) {
      const sent = m.sentiment || '';
      const src = m.sourceUrl ? ` · ${m.sourceUrl}` : '';
      lines.push(`- (${sent}) ${m.text.slice(0, 180).replace(/\n/g, ' ')}${src}`);
    }
  }
  lines.push('');
  lines.push(es ? `_Generado localmente por ResponseLens · vida digital propia._` : `_Generated locally by ResponseLens · own digital life._`);
  return lines.join('\n');
}
