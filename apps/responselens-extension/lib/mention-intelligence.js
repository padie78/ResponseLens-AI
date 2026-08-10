/**
 * Motor de inteligencia de menciones (reputación / captación).
 * Solo analiza texto — NO llama APIs ni conoce secrets.
 * Las credenciales y HTTP viven en socialcrawl-client / scan / Lambda.
 */

const LEGAL_RE = /\b(abogad|demanda|legal|lawsuit|attorney|sue)\b/i;
const SAFETY_RE = /\b(amenaza|suicid|violencia|harm|danger|kill|matar)\b/i;
const INSULT_RE =
  /\b(hijo\s+de|mierda|basura|estupido|estúpido|idiot|asshole|fuck\s+you|vete\s+a)\b/i;
const POS_RE =
  /\b(gracias|excelente|genial|love|amazing|recomend|recommend|fantastic|mejor\s+servicio)\b/i;
const NEG_RE =
  /\b(estafa|horrible|pésim|terrible|awful|scam|refund|no\s+funciona|basura|fraude|decepcion)\b/i;

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
    // Nunca filtramos claves: el backend puede extender metadatos bajo demanda.
    out[String(k)] = v;
  }
  return out;
}

/**
 * Parsea bloque tipo "clave: valor" (uno por línea) sin tocar secrets.
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
    // Rechazar intentos de colar credenciales en contexto
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
  return null;
}

function classifySentiment(text) {
  const t = String(text || '');
  if (INSULT_RE.test(t) || SAFETY_RE.test(t)) return 'critico';
  const pos = (t.match(POS_RE) || []).length;
  const neg = (t.match(NEG_RE) || []).length;
  if (neg > pos + 1) return 'negativo';
  if (pos > neg) return 'positivo';
  if (neg > 0) return 'negativo';
  return 'neutral';
}

function categoryFromText(text, sentiment) {
  const t = String(text || '');
  if (/\b(precio|caro|billing|cobr|refund|reembolso|charge)\b/i.test(t)) return 'Precio / facturación';
  if (/\b(soporte|support|ticket|no\s+responde|ghost)\b/i.test(t)) return 'Soporte';
  if (/\b(outage|ca[ií]da|falla|bug|crash|timeout)\b/i.test(t)) return 'Confiabilidad / producto';
  if (/\b(estafa|fraude|scam|trust|engaño)\b/i.test(t)) return 'Confianza';
  if (sentiment === 'positivo') return 'Elogio';
  return 'Experiencia general';
}

/**
 * @param {{
 *   text: string,
 *   channel?: string,
 *   sourceUrl?: string,
 *   brandScope?: 'own' | 'rival',
 *   companyName?: string,
 *   competitorName?: string,
 *   systemContext?: Record<string, unknown> | string,
 * }} input
 */
export function analyzeBrandMention(input) {
  const text = String(input.text || '').trim();
  const brandScope = input.brandScope === 'rival' ? 'rival' : 'own';
  const esCompetencia = brandScope === 'rival';
  const plataforma = detectPlatform(input.channel, input.sourceUrl);
  const sentimiento = text ? classifySentiment(text) : null;
  const critico = sentimiento === 'critico' || LEGAL_RE.test(text) || SAFETY_RE.test(text);
  const requiereModeracion = critico;

  const systemContext =
    typeof input.systemContext === 'string'
      ? parseContextSystemBlock(input.systemContext)
      : normalizeSystemContext(input.systemContext);

  const categoria = text ? categoryFromText(text, sentimiento) : null;
  const brand =
    String(input.companyName || input.competitorName || (esCompetencia ? 'el rival' : 'nuestra marca')).trim() ||
    'nuestra marca';

  let respuesta = null;
  if (text && !esCompetencia && !requiereModeracion) {
    respuesta = craftPublicReply({
      text,
      plataforma,
      sentimiento,
      brand,
    });
  } else if (text && !esCompetencia && requiereModeracion) {
    respuesta = null;
  }

  const insight = esCompetencia
    ? `Dolor del cliente respecto a ${brand}: ${categoria || 'general'}. Oportunidad de captación (no responder en público como si fueras el rival).`
    : sentimiento === 'positivo'
      ? `Elogio / señal positiva sobre ${brand} (${categoria}).`
      : sentimiento === 'critico'
        ? `Crisis / riesgo alto — no publicar sin revisión humana.`
        : `Mención ${sentimiento || 'neutral'} sobre ${brand} (${categoria}).`;

  return {
    metadatos_personalizados: { ...systemContext },
    analisis_comentario_recibido: {
      plataforma_detectada: plataforma,
      sentimiento,
      es_competencia: esCompetencia,
      requiere_moderacion_humana: requiereModeracion,
      analisis_estrategico: {
        categoria_queja_o_elogio: categoria,
        resumen_insight: text ? insight : null,
      },
      respuesta_sugerida_publica: respuesta,
    },
    /** Campos internos RL (no del prompt SocialCrawl) */
    _rl: {
      brandScope,
      channel: plataforma || input.channel || null,
    },
    error: text ? null : 'empty_text',
  };
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
      ? `¡Gracias! 🙏 En ${brand} nos alegra un montón leer esto. Seguimos para mejorar.`
      : `Gracias por tu comentario. En ${brand} lo apreciamos mucho.`;
  }

  if (sentimiento === 'neutral') {
    if (formal) {
      return `Gracias por escribirnos. En ${brand} quedamos a disposición para aclarar cualquier detalle que necesite.`;
    }
    return `Gracias por el mensaje. Si necesitás más info de ${brand}, escribinos y te ayudamos.`;
  }

  // negativo
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
  if (s === 'neutral') return 'NEUTRAL';
  return '';
}
