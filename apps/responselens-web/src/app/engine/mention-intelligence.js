import { scoreFrustration } from './competitor-opportunity.js';
import { analyzeConquestMention } from './conquest-nlp.js';
import {
  contentKindLabel,
  isReplyableContent,
  normalizeContentKind,
} from './content-kind.js';

/**
 * Motor de inteligencia de menciones (reputación / captación).
 * Analiza texto localmente (rápido, sin secrets) — NO llama APIs externas.
 * Las credenciales y HTTP viven en socialcrawl-client / scan / Lambda.
 */

const LEGAL_RE = /\b(abogad|demanda|legal|lawsuit|attorney|sue|litigio)\b/i;
const SAFETY_RE = /\b(amenaza|suicid|violencia|harm|danger|kill|matar)\b/i;
const INSULT_RE =
  /\b(hijo\s+de|mierda|basura|estupido|estúpido|idiot|asshole|fuck\s+you|vete\s+a)\b/i;
const POS_RE =
  /\b(gracias|excelente|genial|love|amazing|awesome|great|recomend|recommend|fantastic|mejor\s+servicio|impresionante|útil|util|helpful|éxito|exito|launch|win|felicit|proud|incre[ií]ble)\b/i;
const NEG_RE =
  /\b(estafa|horrible|pésim|pesim|terrible|awful|scam|refund|no\s+funciona|basura|fraude|decepcion|odio|hate|sucks|worst|broken|outage|falla|caro|expensive|slow|unreliable|queja|complaint|problema|issue|bug|crash)\b/i;
const EVENT_RE =
  /\b(conferencia|conference|evento|event|keynote|summit|webinar|meetup|vlog|entrevista|interview|podcast|lanzamiento|announces?|anuncia)\b/i;
const CHURN_RE =
  /\b(cancel|cancelar|churn|migr|switch|alternativa|competidor|cambiar\s+de|leaving|me\s+voy)\b/i;
const VIRAL_RE =
  /\b(viral|trending|hilo|thread|everyone|todo\s+el\s+mundo|rt\b|retweet)\b/i;

const FORMAL_PLATFORMS = new Set([
  'linkedin',
  'glassdoor',
  'g2',
  'capterra',
  'indeed',
  'news',
  'hackernews',
]);
const CASUAL_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'threads',
  'x',
  'twitter',
  'facebook',
  'youtube',
  'reddit',
]);

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeSystemContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k == null || String(k).trim() === '') continue;
    out[String(k)] = v;
  }
  return out;
}

/**
 * @param {string} block
 */
export function parseContextSystemBlock(block) {
  /** @type {Record<string, string>} */
  const out = {};
  const lines = String(block || '').split(/\n+/);
  for (const line of lines) {
    const m = line.match(/^\s*([^:]{1,80})\s*:\s*(.+)\s*$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!key) continue;
    if (/api[_-]?key|secret|token|password|authorization/i.test(key)) continue;
    out[key] = val;
  }
  return out;
}

function detectPlatform(channel, sourceUrl = '') {
  const ch = String(channel || '').toLowerCase();
  const url = String(sourceUrl || '').toLowerCase();
  if (ch) {
    if (ch.includes('linkedin')) return 'linkedin';
    if (ch.includes('glassdoor')) return 'glassdoor';
    if (ch.includes('instagram')) return 'instagram';
    if (ch.includes('tiktok')) return 'tiktok';
    if (ch.includes('thread')) return 'threads';
    if (ch === 'x' || ch.includes('twitter')) return 'x';
    if (ch.includes('facebook') || ch === 'fb') return 'facebook';
    if (ch.includes('youtube')) return 'youtube';
    if (ch.includes('reddit')) return 'reddit';
    if (ch.includes('hacker') || ch === 'hn') return 'hackernews';
    if (ch.includes('news')) return 'news';
    if (ch.includes('amazon')) return 'amazon';
    return ch.slice(0, 32);
  }
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('glassdoor.com')) return 'glassdoor';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('threads.net') || url.includes('threads.com')) return 'threads';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'x';
  if (url.includes('facebook.com')) return 'facebook';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('reddit.com')) return 'reddit';
  if (url.includes('ycombinator') || url.includes('news.ycombinator')) return 'hackernews';
  if (url.includes('news.google') || url.includes('/rss/')) return 'news';
  return null;
}

/** @returns {'positivo'|'negativo'|'neutral'|'critico'} */
function classifySentiment(text) {
  const t = String(text || '');
  if (INSULT_RE.test(t) || SAFETY_RE.test(t) || LEGAL_RE.test(t)) return 'critico';
  const pos = (t.match(POS_RE) || []).length;
  const neg = (t.match(NEG_RE) || []).length;
  if (neg >= 2 && neg > pos) return 'negativo';
  if (pos >= 2 && pos > neg) return 'positivo';
  if (neg > pos) return 'negativo';
  if (pos > neg) return 'positivo';
  // Eventos / cobertura mediática sin carga emocional clara → neutro
  if (EVENT_RE.test(t) && neg === 0) return 'neutral';
  return 'neutral';
}

function categoryFromText(text, sentiment) {
  const t = String(text || '');
  if (EVENT_RE.test(t)) return 'Evento / cobertura';
  if (/\b(precio|caro|billing|cobr|refund|reembolso|charge|fee|tarifa)\b/i.test(t)) {
    return 'Precio / facturación';
  }
  if (/\b(soporte|support|ticket|no\s+responde|ghost)\b/i.test(t)) return 'Soporte';
  if (/\b(outage|ca[ií]da|falla|bug|crash|timeout|api)\b/i.test(t)) {
    return 'Confiabilidad / producto';
  }
  if (/\b(estafa|fraude|scam|trust|engaño)\b/i.test(t)) return 'Confianza';
  if (/\b(hiring|who\s+is\s+hiring|empleo|job|career)\b/i.test(t)) return 'Talento / empleo';
  if (sentiment === 'positivo') return 'Elogio';
  if (sentiment === 'negativo' || sentiment === 'critico') return 'Queja / fricción';
  return 'Mención general';
}

/**
 * Mini-análisis estructurado (legible para humanos).
 * No repite el sentimiento: eso ya va en el badge superior de la card.
 * @returns {{
 *   tipo: string,
 *   lectura: string,
 *   accion: string,
 *   tip: string,
 *   text: string,
 * }}
 */
function buildAnalysisSummary({
  text,
  brand,
  sentimiento,
  categoria,
  plataforma,
  mentionKind,
  esCompetencia,
  hasComments = false,
}) {
  const plat = plataforma || 'web';
  const lectura = angleFromText(text);
  /** @type {{ tipo: string, lectura: string, accion: string, tip: string }} */
  let parts;

  if (esCompetencia) {
    parts = {
      tipo: `Oportunidad en ${plat}`,
      lectura: `Hay fricción atribuible a ${brand}, con foco en «${categoria}». ${lectura}`,
      accion:
        'Contrastá el dolor del usuario con tu propuesta de valor. No finjas ser el rival en el hilo.',
      tip: '',
    };
  } else if (mentionKind === 'video') {
    parts = {
      tipo: `Video en ${plat}`,
      lectura: `Pieza audiovisual sobre ${brand}. ${lectura}`,
      accion: hasComments
        ? 'Revisá comentarios destacados y respondé en el hilo del video si hay queja accionable.'
        : 'Seguí alcance y comentarios. No es un post de texto: el riesgo está en la narrativa del video.',
      tip: '',
    };
  } else if (mentionKind === 'news') {
    parts = {
      tipo: `Noticia en ${plat}`,
      lectura: `Cobertura periodística o síntesis web sobre ${brand}. ${lectura}`,
      accion: 'Registrá en reputación. Un statement público solo si el tema escala.',
      tip: '',
    };
  } else if (mentionKind === 'issue') {
    parts = {
      tipo: `Issue en ${plat}`,
      lectura,
      accion: 'Respondé en el ticket con contexto técnico. No uses tono de community manager.',
      tip: '',
    };
  } else if (mentionKind === 'market') {
    parts = {
      tipo: `Señal de mercado`,
      lectura: `Contrato o predicción que menciona a ${brand}. ${lectura}`,
      accion: 'Monitoreo. No hay hilo de cliente para responder.',
      tip: '',
    };
  } else if (mentionKind === 'pin' || mentionKind === 'professional' || mentionKind === 'web') {
    parts = {
      tipo: `${contentKindLabel(mentionKind)} en ${plat}`,
      lectura: `Pieza sobre ${brand}. ${lectura}`,
      accion: 'Seguí la pieza y comentarios si aparecen. La respuesta en hilo no siempre está disponible.',
      tip: '',
    };
  } else if (mentionKind === 'media') {
    if (sentimiento === 'positivo') {
      parts = {
        tipo: `Cobertura favorable en ${plat}`,
        lectura: `Contenido audiovisual o noticia sobre ${brand}. ${lectura}`,
        accion:
          'Registrá alcance y compartí internamente si suma. No hace falta responder en el hilo.',
        tip: 'Actuá solo si el video deriva en crisis en comentarios.',
      };
    } else if (sentimiento === 'negativo' || sentimiento === 'critico') {
      parts = {
        tipo: `Cobertura crítica en ${plat}`,
        lectura: `Pieza media sobre ${brand}. ${lectura}`,
        accion:
          sentimiento === 'critico'
            ? 'Escala a reputación/legal si hay acusaciones graves y prepará postura pública.'
            : 'Seguí la pieza, revisá comentarios destacados y decidí si hace falta un statement oficial.',
        tip: 'No es un comentario respondible en composer: el riesgo está en la narrativa.',
      };
    } else {
      parts = {
        tipo: `Mención informativa en ${plat}`,
        lectura: `Cobertura o video sobre ${brand}. ${lectura}`,
        accion: 'Archivá para el informe de reputación. No redactes respuesta de hilo.',
        tip: '',
      };
    }
  } else if (sentimiento === 'positivo') {
    parts = {
      tipo: `Comentario favorable en ${plat}`,
      lectura,
      accion: 'Agradecé en breve, en el tono de la plataforma. Evitá sobre-prometer.',
      tip: 'Si pide algo concreto, derivá a soporte o DM.',
    };
  } else if (sentimiento === 'critico') {
    parts = {
      tipo: `Alto riesgo en ${plat}`,
      lectura,
      accion:
        'No publiques respuesta automática. Pasá a moderación humana y definí si la respuesta es privada, pública o jurídica.',
      tip: 'Documentá evidencia antes de actuar.',
    };
  } else if (sentimiento === 'negativo') {
    parts = {
      tipo: `Queja accionable en ${plat}`,
      lectura,
      accion:
        'Respondé con empatía, validá el problema y ofrecé un canal privado (DM/soporte) para resolver sin pelear en público.',
      tip: 'Si el tema se repite (precio, bugs, soporte), sumalo al playbook de defensa.',
    };
  } else {
    parts = {
      tipo: `Mención en ${plat}`,
      lectura,
      accion: 'Observá si el hilo se amplifica. Respondé solo si aportás claridad útil.',
      tip: '',
    };
  }

  const textOut = [parts.tipo, parts.lectura, parts.accion, parts.tip].filter(Boolean).join(' ');

  return {
    ...parts,
    text: textOut,
  };
}

function angleFromText(text) {
  const t = String(text || '');
  if (EVENT_RE.test(t)) {
    return 'Apunta a un evento, entrevista o cobertura de actualidad.';
  }
  if (/\b(precio|caro|billing|fee|tarifa|refund|cobr)\b/i.test(t)) {
    return 'Hay tensión por precio, cobro o reembolsos.';
  }
  if (/\b(soporte|support|ticket|no\s+responde|offline|live\s+chat|waiting)\b/i.test(t)) {
    return 'El problema parece ser soporte lento o atención demorada.';
  }
  if (/\b(outage|falla|bug|crash|api|timeout)\b/i.test(t)) {
    return 'Se menciona una falla de producto o servicio.';
  }
  if (/\b(estafa|fraude|scam)\b/i.test(t)) {
    return 'Aparecen acusaciones de confianza o posible fraude.';
  }
  if (/\b(hiring|empleo|job|career)\b/i.test(t)) {
    return 'El contexto se acerca a talento o empleo.';
  }
  return 'No hay un solo dolor dominante; la lectura es contextual.';
}

/**
 * @param {{
 *   text: string,
 *   channel?: string,
 *   sourceUrl?: string,
 *   brandScope?: 'own' | 'rival',
 *   companyName?: string,
 *   competitorName?: string,
 *   mentionKind?: 'comment' | 'media',
 *   systemContext?: Record<string, unknown> | string,
 * }} input
 */
export function analyzeBrandMention(input) {
  const text = String(input.text || '').trim();
  const brandScope = input.brandScope === 'rival' ? 'rival' : 'own';
  const esCompetencia = brandScope === 'rival';
  const mentionKind = normalizeContentKind(input.mentionKind, input.channel);
  const plataforma = detectPlatform(input.channel, input.sourceUrl);
  const sentimiento = text ? classifySentiment(text) : 'neutral';
  const critico = sentimiento === 'critico' || LEGAL_RE.test(text) || SAFETY_RE.test(text);
  const requiereModeracion = critico;
  const hasComments = Array.isArray(input.scMeta?.topComments) && input.scMeta.topComments.length > 0;
  const replyable = isReplyableContent(mentionKind, input.scMeta);

  const systemContext =
    typeof input.systemContext === 'string'
      ? parseContextSystemBlock(input.systemContext)
      : normalizeSystemContext(input.systemContext);

  const categoria = text ? categoryFromText(text, sentimiento) : 'Mención general';
  const brand =
    String(input.companyName || input.competitorName || (esCompetencia ? 'el rival' : 'nuestra marca')).trim() ||
    'nuestra marca';

  let respuesta = null;
  if (text && !esCompetencia && !requiereModeracion && replyable) {
    respuesta = craftPublicReply({
      text,
      plataforma,
      sentimiento,
      brand,
    });
  }

  const insight = text
    ? buildAnalysisSummary({
        text,
        brand,
        sentimiento,
        categoria,
        plataforma,
        mentionKind,
        esCompetencia,
        hasComments,
      })
    : null;

  const storageSentiment = sentimentToStorage(sentimiento) || 'NEUTRAL';
  const scorePack = computeMentionScore({
    text,
    brandScope,
    mentionKind,
    sentimiento,
    frustrationScore: input.frustrationScore,
    scMeta: input.scMeta || null,
  });

  const conquest =
    esCompetencia && text
      ? analyzeConquestMention({
          text,
          competitorName: input.competitorName,
          companyName: input.companyName,
        })
      : null;

  if (conquest && !respuesta && esCompetencia) {
    respuesta = conquest.sales_intelligence.gancho_comercial_ia;
  }

  return {
    metadatos_personalizados: { ...systemContext },
    analisis_metrico: conquest?.analisis_metrico || null,
    sales_intelligence: conquest?.sales_intelligence || null,
    analisis_comentario_recibido: {
      plataforma_detectada: plataforma,
      sentimiento,
      es_competencia: esCompetencia,
      requiere_moderacion_humana: requiereModeracion,
      score_ia: scorePack.score,
      score_banda: scorePack.band,
      score_etiqueta: scorePack.label,
      score_drivers: scorePack.drivers,
      analisis_estrategico: {
        categoria_queja_o_elogio: categoria,
        resumen_insight: insight?.text || null,
        tipo: insight?.tipo || null,
        lectura: insight?.lectura || null,
        accion: insight?.accion || null,
        tip: insight?.tip || null,
      },
      respuesta_sugerida_publica: respuesta,
    },
    _rl: {
      brandScope,
      channel: plataforma || input.channel || null,
      mentionKind,
      sentimentStorage: storageSentiment,
      analysisSummary: insight?.text || null,
      insightParts: insight
        ? {
            tipo: insight.tipo,
            lectura: insight.lectura,
            accion: insight.accion,
            tip: insight.tip,
          }
        : null,
      aiScore: scorePack.score,
      aiScoreBand: scorePack.band,
      aiScoreLabel: scorePack.label,
      aiScoreDrivers: scorePack.drivers,
      conquest,
    },
    error: text ? null : 'empty_text',
  };
}

/**
 * Score IA 0–100: riesgo reputacional (own) u oportunidad de captación (rival).
 * Incorpora señal SocialCrawl (engagement / final_score) cuando existe.
 * @param {{
 *   text?: string,
 *   brandScope?: 'own' | 'rival',
 *   mentionKind?: 'comment' | 'media',
 *   sentimiento?: string,
 *   frustrationScore?: number,
 *   scMeta?: {
 *     finalScore?: number | null,
 *     rerankScore?: number | null,
 *     engagement?: { points?: number | null, numComments?: number | null },
 *     topComments?: unknown[],
 *     clusterTitle?: string | null,
 *   } | null,
 * }} input
 */
export function computeMentionScore(input = {}) {
  const text = String(input.text || '');
  const brandScope = input.brandScope === 'rival' ? 'rival' : 'own';
  const mentionKind = normalizeContentKind(input.mentionKind);
  const sentimiento = String(input.sentimiento || classifySentiment(text)).toLowerCase();
  const fr =
    typeof input.frustrationScore === 'number' && Number.isFinite(input.frustrationScore)
      ? Math.min(1, Math.max(0, input.frustrationScore))
      : scoreFrustration(text);
  const sc = input.scMeta && typeof input.scMeta === 'object' ? input.scMeta : null;

  /** @type {string[]} */
  const drivers = [];
  let score = brandScope === 'rival' ? 18 : 12;

  const frPts = Math.round(fr * (brandScope === 'rival' ? 42 : 48));
  score += frPts;
  if (frPts >= 20) drivers.push(brandScope === 'rival' ? 'Alta fricción del rival' : 'Alta fricción detectada');

  if (sentimiento === 'critico') {
    score += brandScope === 'rival' ? 22 : 28;
    drivers.push(brandScope === 'rival' ? 'Crisis del rival' : 'Tono crítico');
  } else if (sentimiento === 'negativo' || sentimiento === 'negative') {
    score += brandScope === 'rival' ? 16 : 18;
    drivers.push('Sentimiento negativo');
  } else if (sentimiento === 'positivo' || sentimiento === 'positive') {
    score += brandScope === 'rival' ? -8 : -14;
    drivers.push(brandScope === 'rival' ? 'Elogio al rival' : 'Tono positivo');
  } else {
    drivers.push('Tono neutral');
  }

  if (LEGAL_RE.test(text) || SAFETY_RE.test(text)) {
    score += 18;
    drivers.push('Señal legal / seguridad');
  }
  if (CHURN_RE.test(text)) {
    score += brandScope === 'rival' ? 20 : 12;
    drivers.push(brandScope === 'rival' ? 'Intención de cambio' : 'Riesgo de churn');
  }
  if (VIRAL_RE.test(text)) {
    score += 10;
    drivers.push('Potencial de amplificación');
  }
  if (INSULT_RE.test(text)) {
    score += 8;
    drivers.push('Lenguaje agresivo');
  }

  // SocialCrawl: engagement + ranking quality
  if (sc) {
    const points = typeof sc.engagement?.points === 'number' ? sc.engagement.points : 0;
    const comments =
      typeof sc.engagement?.numComments === 'number' ? sc.engagement.numComments : 0;
    let reachPts = 0;
    if (points >= 500 || comments >= 200) reachPts = 16;
    else if (points >= 100 || comments >= 50) reachPts = 10;
    else if (points >= 20 || comments >= 10) reachPts = 6;
    else if (points > 0 || comments > 0) reachPts = 3;
    if (reachPts) {
      score += reachPts;
      drivers.push(
        comments
          ? `Alcance en redes (${points || 0} pts · ${comments} comentarios)`
          : `Alcance en redes (${points} pts)`,
      );
    }
    const finalScore = typeof sc.finalScore === 'number' ? sc.finalScore : null;
    const rerank = typeof sc.rerankScore === 'number' ? sc.rerankScore : null;
    if (finalScore != null && finalScore >= 55) {
      score += Math.min(10, Math.round((finalScore - 50) / 5));
      drivers.push(`Relevancia ${Math.round(finalScore)}`);
    } else if (rerank != null && rerank >= 70) {
      score += 6;
      drivers.push(`Relevancia ${Math.round(rerank)}`);
    }
    const nComments = Array.isArray(sc.topComments) ? sc.topComments.length : 0;
    if (nComments >= 3) {
      score += 4;
      drivers.push(`${nComments} top comments enriquecidos`);
    }
    if (sc.clusterTitle) {
      score += 2;
      drivers.push(`Cluster: ${String(sc.clusterTitle).slice(0, 40)}`);
    }
  }

  if (
    mentionKind === 'news' ||
    mentionKind === 'market' ||
    mentionKind === 'pin' ||
    mentionKind === 'professional' ||
    mentionKind === 'web' ||
    mentionKind === 'media'
  ) {
    score = Math.round(score * (brandScope === 'rival' ? 0.62 : 0.55));
    drivers.push('Pieza de cobertura (menos hilo accionable)');
  }

  score = Math.max(1, Math.min(100, Math.round(score)));

  let band = 'medium';
  let label = brandScope === 'rival' ? 'Oportunidad media' : 'Riesgo medio';
  if (score >= 80) {
    band = 'critical';
    label = brandScope === 'rival' ? 'Oportunidad crítica' : 'Riesgo crítico';
  } else if (score >= 60) {
    band = 'high';
    label = brandScope === 'rival' ? 'Oportunidad alta' : 'Riesgo alto';
  } else if (score >= 35) {
    band = 'medium';
    label = brandScope === 'rival' ? 'Oportunidad media' : 'Riesgo medio';
  } else {
    band = 'low';
    label = brandScope === 'rival' ? 'Oportunidad baja' : 'Riesgo bajo';
  }

  return {
    score,
    band,
    label,
    drivers: drivers.slice(0, 6),
    kind: brandScope === 'rival' ? 'opportunity' : 'risk',
  };
}

/**
 * Asegura sentimiento + análisis en una alerta (scan o render).
 * @param {object} alert
 * @param {{ companyName?: string }} [opts]
 */
export function ensureItemIntel(alert, opts = {}) {
  if (!alert || typeof alert !== 'object') return alert;
  const text = String(alert.originalComplaint || alert.text || '').trim();
  if (!text) {
    alert._sentiment = alert._sentiment || 'NEUTRAL';
    alert._aiScore = alert._aiScore ?? 0;
    return alert;
  }

  const mentionKind = normalizeContentKind(
    alert._mentionKind,
    alert.channel || alert._source,
  );

  const hasSummary =
    String(alert._analysisSummary || alert._intel?.analisis_estrategico?.resumen_insight || '').trim()
      .length > 80 &&
    !/^Sentimiento\s+/i.test(
      String(alert._analysisSummary || alert._intel?.analisis_estrategico?.resumen_insight || ''),
    );
  const hasStructuredInsight = Boolean(
    alert._intel?.analisis_estrategico?.accion || alert._insight?.accion,
  );
  const hasSent = Boolean(alert._sentiment);
  const hasScore = typeof alert._aiScore === 'number' && alert._aiScore > 0;

  if (hasSummary && hasStructuredInsight && hasSent && alert._intel && hasScore) {
    alert._mentionKind = mentionKind;
    alert._actionable = isReplyableContent(mentionKind, alert._scMeta);
    if (!alert._insight && alert._intel?.analisis_estrategico) {
      const ae = alert._intel.analisis_estrategico;
      alert._insight = {
        tipo: ae.tipo || '',
        lectura: ae.lectura || '',
        accion: ae.accion || '',
        tip: ae.tip || '',
      };
    }
    const scopeEarly = alert._brandScope || alert.brandScope;
    if (scopeEarly === 'rival' && !alert._conquest) {
      const conquest = analyzeConquestMention({
        text,
        competitorName: alert.competitorName,
        companyName: opts.companyName,
      });
      alert._conquest = conquest;
      if (!alert.salesPitch && conquest.sales_intelligence?.gancho_comercial_ia) {
        alert.salesPitch = conquest.sales_intelligence.gancho_comercial_ia;
      }
    }
    return alert;
  }

  const scopeRaw = alert._brandScope || alert.brandScope;
  const brandScope = scopeRaw === 'rival' ? 'rival' : 'own';

  if (hasSummary && hasSent && alert._intel && !hasScore) {
    const scorePack = computeMentionScore({
      text,
      brandScope,
      mentionKind,
      sentimiento: alert._intel?.sentimiento,
      frustrationScore: alert.frustrationScore,
      scMeta: alert._scMeta || null,
    });
    applyScoreToAlert(alert, scorePack);
    alert._mentionKind = mentionKind;
    alert._actionable = isReplyableContent(mentionKind, alert._scMeta);
    if (alert._intel && typeof alert._intel === 'object') {
      alert._intel.score_ia = scorePack.score;
      alert._intel.score_banda = scorePack.band;
      alert._intel.score_etiqueta = scorePack.label;
      alert._intel.score_drivers = scorePack.drivers;
    }
    return alert;
  }

  const intel = analyzeBrandMention({
    text,
    channel: alert.channel || alert._source,
    sourceUrl: alert.sourceUrl,
    brandScope,
    companyName: opts.companyName,
    competitorName: brandScope === 'rival' ? alert.competitorName : undefined,
    mentionKind,
    frustrationScore: alert.frustrationScore,
    scMeta: alert._scMeta || null,
    systemContext: { alertId: alert.alertId },
  });

  const block = intel.analisis_comentario_recibido;
  alert._intel = block;
  alert._sentiment = sentimentToStorage(block?.sentimiento) || alert._sentiment || 'NEUTRAL';
  alert._analysisSummary =
    block?.analisis_estrategico?.resumen_insight || intel._rl?.analysisSummary || '';
  alert._insight = intel._rl?.insightParts || {
    tipo: block?.analisis_estrategico?.tipo || '',
    lectura: block?.analisis_estrategico?.lectura || '',
    accion: block?.analisis_estrategico?.accion || '',
    tip: block?.analisis_estrategico?.tip || '',
  };
  alert._mentionKind = mentionKind;
  alert._actionable = isReplyableContent(mentionKind, alert._scMeta);
  applyScoreToAlert(alert, {
    score: intel._rl?.aiScore ?? block?.score_ia ?? 0,
    band: intel._rl?.aiScoreBand ?? block?.score_banda ?? 'medium',
    label: intel._rl?.aiScoreLabel ?? block?.score_etiqueta ?? '',
    drivers: intel._rl?.aiScoreDrivers ?? block?.score_drivers ?? [],
    kind: brandScope === 'rival' ? 'opportunity' : 'risk',
  });
  if (brandScope === 'rival' && intel.sales_intelligence) {
    alert._conquest = {
      analisis_metrico: intel.analisis_metrico,
      sales_intelligence: intel.sales_intelligence,
    };
    if (intel.sales_intelligence.gancho_comercial_ia) {
      alert.salesPitch = intel.sales_intelligence.gancho_comercial_ia;
    }
  }
  return alert;
}

function applyScoreToAlert(alert, pack) {
  alert._aiScore = pack.score;
  alert._aiScoreBand = pack.band;
  alert._aiScoreLabel = pack.label;
  alert._aiScoreDrivers = pack.drivers || [];
  alert._aiScoreKind = pack.kind || 'risk';
}

function craftPublicReply({ text, plataforma, sentimiento, brand }) {
  const formal = plataforma ? FORMAL_PLATFORMS.has(plataforma) : false;
  const casual = plataforma ? CASUAL_PLATFORMS.has(plataforma) : !formal;
  const snip = text.slice(0, 80).replace(/\s+/g, ' ');

  if (sentimiento === 'positivo') {
    if (formal) {
      return `Muchas gracias por su comentario. En ${brand} valoramos mucho su reconocimiento y seguimos trabajando para merecerlo.`;
    }
    return casual
      ? `¡Gracias! En ${brand} nos alegra un montón leer esto. Seguimos para mejorar.`
      : `Gracias por tu comentario. En ${brand} lo apreciamos mucho.`;
  }

  if (sentimiento === 'neutral') {
    if (formal) {
      return `Gracias por escribirnos. En ${brand} quedamos a disposición para aclarar cualquier detalle que necesite.`;
    }
    return `Gracias por el mensaje. Si necesitás más info de ${brand}, escribinos y te ayudamos.`;
  }

  if (formal) {
    return (
      `Lamentamos la experiencia que describe. En ${brand} queremos resolverlo con la seriedad que corresponde. ` +
      `¿Podría contactarnos por mensaje privado o soporte para revisar su caso? Ref: "${snip}${text.length > 80 ? '…' : ''}"`
    );
  }
  return (
    `Lamentamos mucho lo que pasó. En ${brand} queremos ayudarte a resolverlo. ` +
    `Escribinos por DM / soporte y lo vemos juntos. Ref: "${snip}${text.length > 80 ? '…' : ''}"`
  );
}

/** Mapea sentimiento RL → badge storage */
export function sentimentToStorage(sent) {
  const s = String(sent || '').toLowerCase();
  if (s === 'positivo' || s === 'positive') return 'POSITIVE';
  if (s === 'negativo' || s === 'negative') return 'NEGATIVE';
  if (s === 'critico' || s === 'critical') return 'NEGATIVE';
  if (s === 'neutral' || s === 'neutro' || s === 'mixed') return 'NEUTRAL';
  return '';
}
