/**
 * Informe IA del rival (offline + shape para AppSync analyzeRivalReport).
 * Agrega menciones de página / alertas / escaneo y produce conclusiones + markdown.
 */

import { detectReplyLanguage, buildLocalTriage } from './local-fallback.js';
import { lookupCompetitorProfile, scoreFrustration } from './competitor-opportunity.js';
import { detectThemes } from './theme-rules.js';

/**
 * @param {{
 *   competitorName: string,
 *   mentions?: Array<{ text?: string, sourceUrl?: string, channel?: string }>,
 *   companyName?: string,
 *   whatTheySell?: string,
 *   competitorProfile?: object | null,
 *   competitors?: object[],
 * }} input
 */
export function buildLocalRivalReport(input) {
  const rival = String(input.competitorName || 'Rival').trim() || 'Rival';
  const mentions = (input.mentions || [])
    .map((m) => ({
      text: String(m.text || m.originalComplaint || '').trim(),
      sourceUrl: m.sourceUrl || '',
      channel: m.channel || '',
    }))
    .filter((m) => m.text.length > 0)
    .slice(0, 12);

  const corpus = mentions.map((m) => m.text).join('\n') || rival;
  const lang = detectReplyLanguage(corpus);
  const triage = buildLocalTriage(corpus);
  const profile =
    input.competitorProfile ||
    lookupCompetitorProfile(rival, input.competitors || []) ||
    null;

  const themes = detectThemes(corpus, lang);
  const avgFrustration =
    mentions.length > 0
      ? mentions.reduce((s, m) => s + scoreFrustration(m.text), 0) / mentions.length
      : 0;

  const conclusions = buildConclusions({
    lang,
    rival,
    themes,
    triage,
    avgFrustration,
    mentionCount: mentions.length,
    profile,
    companyName: input.companyName,
    whatTheySell: input.whatTheySell,
  });

  const opportunities = buildOpportunities({
    lang,
    rival,
    themes,
    companyName: input.companyName || (lang === 'en' ? 'your brand' : 'tu marca'),
    whatTheySell: input.whatTheySell,
    profile,
  });

  const reportMarkdown = buildMarkdown({
    lang,
    rival,
    profile,
    themes,
    conclusions,
    opportunities,
    mentions,
    triage,
    avgFrustration,
    companyName: input.companyName,
  });

  return {
    competitorName: rival,
    language: lang,
    mentionCount: mentions.length,
    avgFrustration: Number(avgFrustration.toFixed(2)),
    riskLevel: mentions.length ? triage.riskLevel : 'LOW',
    themes: mentions.length ? themes : [],
    conclusions,
    opportunities,
    reportMarkdown,
    model: 'local-rival-heuristics',
    generatedAt: new Date().toISOString(),
    sources: mentions.map((m) => m.sourceUrl).filter(Boolean).slice(0, 8),
  };
}

function buildConclusions({
  lang,
  rival,
  themes,
  triage,
  avgFrustration,
  mentionCount,
  profile,
  companyName,
  whatTheySell,
}) {
  const brand = companyName || (lang === 'en' ? 'your brand' : 'tu marca');
  const offer = whatTheySell || (lang === 'en' ? 'a more stable alternative' : 'una alternativa más estable');
  const themeLabels = themes.map((t) => t.label).join(', ');
  const weak = profile?.weaknessNotes || '';

  if (!mentionCount) {
    if (lang === 'en') {
      return [
        `No live negative mentions found for ${rival} in this run.`,
        `Scan again with Reddit OAuth / NewsAPI, or open the rival’s public threads and use captar.`,
        weak ? `Stored profile weakness (not live): ${weak}` : `Add weakness notes in Config to prep playbooks.`,
      ];
    }
    return [
      `Sin menciones negativas live de ${rival} en esta pasada.`,
      `Re-escaneá con Reddit OAuth / NewsAPI, o abrí hilos públicos del rival y usá captar.`,
      weak ? `Debilidad en ficha (no live): ${weak}` : `Agregá notas de debilidad en Config para preparar playbooks.`,
    ];
  }

  if (lang === 'en') {
    return [
      `${rival} shows public friction around: ${themeLabels}.`,
      `Signal strength: ${mentionCount} mention(s), avg frustration ${avgFrustration.toFixed(2)}, risk ${triage.riskLevel}.`,
      weak
        ? `Known weakness in profile: ${weak}`
        : `No stored weakness notes — lean on the live complaint themes.`,
      `Window for ${brand}: position ${offer} against those exact pains without attacking ${rival} personally.`,
      triage.escalationFlags?.length
        ? `Watch flags in the corpus: ${triage.escalationFlags.join(', ')}.`
        : `No critical legal/safety flags in the sample — safe for careful public outreach.`,
    ];
  }

  return [
    `${rival} muestra fricción pública en: ${themeLabels}.`,
    `Fuerza de señal: ${mentionCount} mención(es), frustración media ${avgFrustration.toFixed(2)}, riesgo ${triage.riskLevel}.`,
    weak
      ? `Debilidad en ficha: ${weak}`
      : `Sin notas de debilidad guardadas — basate en los temas de las quejas live.`,
    `Oportunidad para ${brand}: posicionar ${offer} contra esos dolores, sin atacar personalmente a ${rival}.`,
    triage.escalationFlags?.length
      ? `Banderas en el corpus: ${triage.escalationFlags.join(', ')}.`
      : `Sin banderas legales/safety críticas en la muestra — apto para outreach cuidadoso.`,
  ];
}

function buildOpportunities({ lang, rival, themes, companyName, whatTheySell, profile }) {
  const brand = companyName;
  const theme = themes[0]?.label || (lang === 'en' ? 'reliability' : 'confiabilidad');
  const industry = profile?.industry || '';
  const mentionThemes = themes.filter((t) => t.id !== 'general');

  if (!mentionThemes.length && themes[0]?.id === 'general') {
    if (lang === 'en') {
      return [
        `No live angles yet — run Escanear or open ${rival} threads and captar real complaints.`,
        whatTheySell
          ? `When signal appears, map "${whatTheySell}" to the top complaint theme.`
          : `Fill “what you sell” in Config so pitches sharpen automatically.`,
      ];
    }
    return [
      `Sin ángulos live aún — corré Escanear o abrí hilos de ${rival} y captá quejas reales.`,
      whatTheySell
        ? `Cuando haya señal, mapeá "${whatTheySell}" al tema dominante de la queja.`
        : `Completá “qué vende” en Config para afilar pitches automáticamente.`,
    ];
  }

  if (lang === 'en') {
    return [
      `Lead with empathy on ${theme}, then offer a low-friction switch to ${brand}.`,
      `Use a soft public reply + DM for details; avoid sounding like spam under ${rival} threads.`,
      whatTheySell
        ? `Proof point: map "${whatTheySell}" to the complaint theme in one sentence.`
        : `Add what you sell in Config to sharpen the pitch.`,
      industry ? `Industry context (${industry}) helps tailor the technical vs soft tone.` : null,
    ].filter(Boolean);
  }

  return [
    `Abrí con empatía sobre ${theme} y ofrecé migración de baja fricción a ${brand}.`,
    `Respuesta pública suave + DM para detalle; evitá tono spam bajo hilos de ${rival}.`,
    whatTheySell
      ? `Proof: conectá "${whatTheySell}" con el tema de la queja en una frase.`
      : `Completá “qué vende” en Config para afinar el pitch.`,
    industry ? `Contexto de industria (${industry}) ayuda a elegir tono técnico vs suave.` : null,
  ].filter(Boolean);
}

function buildMarkdown({
  lang,
  rival,
  profile,
  themes,
  conclusions,
  opportunities,
  mentions,
  triage,
  avgFrustration,
  companyName,
}) {
  const title =
    lang === 'en' ? `Rival intelligence report — ${rival}` : `Informe de inteligencia — ${rival}`;
  const lines = [
    `# ${title}`,
    '',
    lang === 'en' ? `**Generated for:** ${companyName || 'your brand'}` : `**Para:** ${companyName || 'tu marca'}`,
    lang === 'en'
      ? `**Risk:** ${triage.riskLevel} · **Frustration:** ${avgFrustration.toFixed(2)} · **Mentions:** ${mentions.length}`
      : `**Riesgo:** ${triage.riskLevel} · **Frustración:** ${avgFrustration.toFixed(2)} · **Menciones:** ${mentions.length}`,
    '',
  ];

  if (profile?.description || profile?.industry || profile?.weaknessNotes) {
    lines.push(lang === 'en' ? '## Profile snapshot' : '## Ficha del rival');
    if (profile.industry) lines.push(`- **Industry:** ${profile.industry}`);
    if (profile.description) lines.push(`- ${profile.description}`);
    if (profile.weaknessNotes) {
      lines.push(
        lang === 'en'
          ? `- **Known weakness:** ${profile.weaknessNotes}`
          : `- **Debilidad conocida:** ${profile.weaknessNotes}`,
      );
    }
    lines.push('');
  }

  lines.push(lang === 'en' ? '## Themes' : '## Temas');
  for (const t of themes) lines.push(`- ${t.label}`);
  lines.push('');

  lines.push(lang === 'en' ? '## Conclusions' : '## Conclusiones');
  for (const c of conclusions) lines.push(`- ${c}`);
  lines.push('');

  lines.push(lang === 'en' ? '## Capture angles' : '## Ángulos de captación');
  for (const o of opportunities) lines.push(`- ${o}`);
  lines.push('');

  if (mentions.length) {
    lines.push(lang === 'en' ? '## Sample mentions' : '## Menciones de muestra');
    mentions.slice(0, 5).forEach((m, i) => {
      const snip = m.text.slice(0, 180).replace(/\s+/g, ' ');
      lines.push(`${i + 1}. “${snip}${m.text.length > 180 ? '…' : ''}”`);
      if (m.sourceUrl) lines.push(`   - ${m.sourceUrl}`);
    });
    lines.push('');
  }

  lines.push(
    lang === 'en'
      ? '_Offline heuristic report. Redeploy AppSync `analyzeRivalReport` for full LLM research._'
      : '_Informe heurístico offline. Redesplegá AppSync `analyzeRivalReport` para investigación LLM completa._',
  );

  return lines.join('\n');
}

/**
 * Normaliza respuesta cloud al mismo shape.
 * @param {Record<string, unknown>} raw
 */
export function normalizeRivalReport(raw, fallbackName = 'Rival') {
  if (!raw || typeof raw !== 'object') return null;
  return {
    competitorName: String(raw.competitorName || fallbackName),
    language: raw.language || 'es',
    mentionCount: Number(raw.mentionCount) || 0,
    avgFrustration: Number(raw.avgFrustration) || 0,
    riskLevel: raw.riskLevel || 'MEDIUM',
    themes: Array.isArray(raw.themes)
      ? raw.themes.map((t) =>
          typeof t === 'string' ? { id: t, label: t } : { id: t.id || t.label, label: t.label || t.id },
        )
      : [],
    conclusions: Array.isArray(raw.conclusions) ? raw.conclusions.map(String) : [],
    opportunities: Array.isArray(raw.opportunities) ? raw.opportunities.map(String) : [],
    reportMarkdown: String(raw.reportMarkdown || ''),
    model: String(raw.model || 'cloud'),
    generatedAt: String(raw.generatedAt || new Date().toISOString()),
    sources: Array.isArray(raw.sources) ? raw.sources.map(String) : [],
  };
}
