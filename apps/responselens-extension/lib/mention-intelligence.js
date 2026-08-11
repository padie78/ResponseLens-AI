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
 * Mini-análisis legible (varias frases) por ítem.
 * No repite el sentimiento: eso ya va en el badge superior de la card.
 */
function buildAnalysisSummary({
  text,
  brand,
  sentimiento,
  categoria,
  plataforma,
  mentionKind,
  esCompetencia,
}) {
  const plat = plataforma || 'web';
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const snip = raw.slice(0, 140);
  const snipSuffix = raw.length > 140 ? '…' : '';
  const angle = angleFromText(raw);

  if (esCompetencia) {
    return (
      `Lectura: aparece fricción atribuible a ${brand} en ${plat}, con foco en «${categoria}». ` +
      `${angle} ` +
      `Para captación conviene contrastar el dolor del usuario con tu propuesta de valor, sin fingir ser el rival en el hilo. ` +
      `Fragmento: “${snip}${snipSuffix}”`
    );
  }

  if (mentionKind === 'media') {
    if (sentimiento === 'positivo') {
      return (
        `Se trata de cobertura o contenido audiovisual sobre ${brand} en ${plat}, no de un comentario en un hilo. ` +
        `Tema dominante: ${categoria}. ${angle} ` +
        `La lectura es favorable o al menos constructiva: sirve para reputación y awareness, no para inyectar una respuesta pública. ` +
        `Recomendación: registrar alcance/contexto, compartir internamente si suma, y solo actuar si el video deriva en crisis en comentarios. ` +
        `Referencia: “${snip}${snipSuffix}”`
      );
    }
    if (sentimiento === 'negativo' || sentimiento === 'critico') {
      return (
        `Contenido de tipo media (${plat}) que menciona a ${brand} con carga crítica. Tema: ${categoria}. ${angle} ` +
        `No es un comentario respondible en composer: el riesgo está en la narrativa del video/noticia y en los comentarios que pueda generar. ` +
        (sentimiento === 'critico'
          ? `Prioridad alta: escalar a reputación/legal si hay acusaciones graves, y preparar postura pública. `
          : `Seguí la pieza, revisá comentarios destacados y decidí si hace falta un statement o aclaración en canal oficial. `) +
        `Referencia: “${snip}${snipSuffix}”`
      );
    }
    return (
      `Mención informativa / cobertura sobre ${brand} en ${plat} (video, vlog o noticia). Tema: ${categoria}. ${angle} ` +
      `No hay pedido explícito al brand ni una queja dirigida: el valor es de monitoreo de vida digital (quién habla, en qué contexto). ` +
      `Acción sugerida: archivar para el informe de reputación, no redactar respuesta de hilo. Si el contenido es un evento o conferencia, anotá speakers y mensaje asociado. ` +
      `Referencia: “${snip}${snipSuffix}”`
    );
  }

  if (sentimiento === 'positivo') {
    return (
      `Comentario accionable favorable a ${brand} en ${plat}. Tema: ${categoria}. ${angle} ` +
      `Oportunidad de reforzar relación: un agradecimiento breve en el tono de la plataforma suele bastar. ` +
      `Evitar sobre-prometer; si el usuario pide algo concreto, derivar a soporte o DM. ` +
      `Fragmento: “${snip}${snipSuffix}”`
    );
  }
  if (sentimiento === 'critico') {
    return (
      `Señal de alto riesgo sobre ${brand} en ${plat}. Tema: ${categoria}. ${angle} ` +
      `Puede involucrar lenguaje agresivo, amenaza o marco legal. No publiques una respuesta automática. ` +
      `Pasá el caso a moderación humana, documentá evidencia y definí si la respuesta es privada, pública o jurídica. ` +
      `Fragmento: “${snip}${snipSuffix}”`
    );
  }
  if (sentimiento === 'negativo') {
    return (
      `Queja o fricción accionable hacia ${brand} en ${plat}. Tema: ${categoria}. ${angle} ` +
      `Conviene responder con empatía, validar el problema y ofrecer un canal privado (DM/soporte) para resolver sin pelear en público. ` +
      `Si el tema se repite (precio, bugs, soporte), sumalo al playbook de defensa de marca. ` +
      `Fragmento: “${snip}${snipSuffix}”`
    );
  }
  return (
    `Mención de ${brand} en ${plat} sin carga emocional clara. Tema: ${categoria}. ${angle} ` +
    `Puede ser consulta, contexto o comentario lateral. Observá si otros usuarios amplifican el hilo. ` +
    `Respondé solo si aportás claridad útil; si no, dejalo en monitoreo. ` +
    `Fragmento: “${snip}${snipSuffix}”`
  );
}

function angleFromText(text) {
  const t = String(text || '');
  if (EVENT_RE.test(t)) {
    return 'El texto apunta a un evento, entrevista o cobertura de actualidad.';
  }
  if (/\b(precio|caro|billing|fee|tarifa|refund|cobr)\b/i.test(t)) {
    return 'Hay indicios de tensión por precio, cobro o reembolsos.';
  }
  if (/\b(soporte|support|ticket|no\s+responde)\b/i.test(t)) {
    return 'El eje parece ser experiencia de soporte o demora en la atención.';
  }
  if (/\b(outage|falla|bug|crash|api|timeout)\b/i.test(t)) {
    return 'Se menciona confiabilidad o fallas de producto/servicio.';
  }
  if (/\b(estafa|fraude|scam)\b/i.test(t)) {
    return 'Aparecen acusaciones de confianza o posible fraude.';
  }
  if (/\b(hiring|empleo|job|career)\b/i.test(t)) {
    return 'El contexto se acerca a talento, empleo o hiring.';
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
  const mentionKind = input.mentionKind === 'media' ? 'media' : 'comment';
  const plataforma = detectPlatform(input.channel, input.sourceUrl);
  const sentimiento = text ? classifySentiment(text) : 'neutral';
  const critico = sentimiento === 'critico' || LEGAL_RE.test(text) || SAFETY_RE.test(text);
  const requiereModeracion = critico;

  const systemContext =
    typeof input.systemContext === 'string'
      ? parseContextSystemBlock(input.systemContext)
      : normalizeSystemContext(input.systemContext);

  const categoria = text ? categoryFromText(text, sentimiento) : 'Mención general';
  const brand =
    String(input.companyName || input.competitorName || (esCompetencia ? 'el rival' : 'nuestra marca')).trim() ||
    'nuestra marca';

  let respuesta = null;
  if (text && !esCompetencia && !requiereModeracion && mentionKind === 'comment') {
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
      })
    : null;

  const storageSentiment = sentimentToStorage(sentimiento) || 'NEUTRAL';

  return {
    metadatos_personalizados: { ...systemContext },
    analisis_comentario_recibido: {
      plataforma_detectada: plataforma,
      sentimiento,
      es_competencia: esCompetencia,
      requiere_moderacion_humana: requiereModeracion,
      analisis_estrategico: {
        categoria_queja_o_elogio: categoria,
        resumen_insight: insight,
      },
      respuesta_sugerida_publica: respuesta,
    },
    _rl: {
      brandScope,
      channel: plataforma || input.channel || null,
      mentionKind,
      sentimentStorage: storageSentiment,
      analysisSummary: insight,
    },
    error: text ? null : 'empty_text',
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
    return alert;
  }

  const mentionKind =
    alert._mentionKind === 'media' || alert._actionable === false
      ? 'media'
      : alert._source === 'youtube' ||
          alert._source === 'news' ||
          alert.channel === 'youtube' ||
          alert.channel === 'news'
        ? 'media'
        : 'comment';

  const hasSummary =
    String(alert._analysisSummary || alert._intel?.analisis_estrategico?.resumen_insight || '').trim()
      .length > 80 &&
    !/^Sentimiento\s+/i.test(
      String(alert._analysisSummary || alert._intel?.analisis_estrategico?.resumen_insight || ''),
    );
  const hasSent = Boolean(alert._sentiment);

  if (hasSummary && hasSent && alert._intel) {
    alert._mentionKind = alert._mentionKind || mentionKind;
    alert._actionable = alert._actionable ?? mentionKind === 'comment';
    return alert;
  }

  const intel = analyzeBrandMention({
    text,
    channel: alert.channel || alert._source,
    sourceUrl: alert.sourceUrl,
    brandScope: alert._brandScope === 'own' ? 'own' : alert._brandScope === 'rival' ? 'rival' : 'own',
    companyName: opts.companyName || alert.competitorName,
    mentionKind,
    systemContext: { alertId: alert.alertId },
  });

  const block = intel.analisis_comentario_recibido;
  alert._intel = block;
  alert._sentiment = sentimentToStorage(block?.sentimiento) || alert._sentiment || 'NEUTRAL';
  alert._analysisSummary =
    block?.analisis_estrategico?.resumen_insight || intel._rl?.analysisSummary || '';
  alert._mentionKind = mentionKind;
  alert._actionable = mentionKind === 'comment';
  return alert;
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
