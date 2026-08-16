/**
 * Motor local de Conquista Comercial (Módulo B).
 * Schema estricto: analisis_metrico + sales_intelligence (ES).
 */

const POS_RE =
  /\b(gracias|excelente|genial|love|amazing|awesome|great|recomend|fantastic|útil|util|impresionante|felicit)\b/i;
const NEG_RE =
  /\b(estafa|horrible|pésim|pesim|terrible|awful|scam|refund|reembolso|no\s+funciona|basura|fraude|odio|hate|sucks|worst|broken|outage|falla|falló|fallo|caro|expensive|slow|unreliable|queja|problema|bug|crash|ca[ií]da)\b/i;
const RAGE_RE =
  /\b(estafa|fraude|scam|demanda|lawsuit|abogad|chargeback|reembolso|refund|me\s+cambio|nunca\s+m[aá]s|basura|odio|hate|worst|pésim)\b/i;
const CHURN_RE =
  /\b(me\s+cambio|switching|cancel|leaving|alternativa|alternative|me\s+voy|migr)\b/i;

/** @typedef {'app_tecnologia'|'soporte_cliente'|'precio_costo'|'logistica_envio'|'calidad_producto'|'marketing_ventas'} CategoriaOperativa */

const CATEGORY_RULES = [
  {
    id: 'app_tecnologia',
    re: /\b(app|api|bug|crash|timeout|login|outage|ca[ií]da|no\s+funciona|plataforma|sistema|error|downtime)\b/i,
    pill: '📱 App',
  },
  {
    id: 'soporte_cliente',
    re: /\b(soporte|support|ticket|no\s+responde|atenci[oó]n|chat|waiting|cola|agente)\b/i,
    pill: '🎧 Soporte',
  },
  {
    id: 'precio_costo',
    re: /\b(precio|caro|billing|cobr|tarifa|fee|costo|factura|chargeback|reembolso|refund)\b/i,
    pill: '💸 Precio',
  },
  {
    id: 'logistica_envio',
    re: /\b(env[ií]o|shipping|delivery|paquete|courier|tracking|demora|retraso|log[ií]stic)\b/i,
    pill: '📦 Envío',
  },
  {
    id: 'marketing_ventas',
    re: /\b(publicidad|ads|spam|promesa|oferta|venta|onboarding|upsell|marketing)\b/i,
    pill: '📣 Ventas',
  },
  {
    id: 'calidad_producto',
    re: /\b(calidad|roto|defect|producto|servicio|experiencia|horrible|pésim|basura)\b/i,
    pill: '📦 Producto',
  },
];

/**
 * @param {string} text
 * @returns {CategoriaOperativa}
 */
export function classifyOperativeCategory(text) {
  const t = String(text || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(t)) return /** @type {CategoriaOperativa} */ (rule.id);
  }
  return 'calidad_producto';
}

function categoryPill(id) {
  return CATEGORY_RULES.find((r) => r.id === id)?.pill || '📦 Producto';
}

/**
 * @param {string} text
 * @returns {'positivo'|'neutral'|'negativo'}
 */
export function classifyConquestSentiment(text) {
  const t = String(text || '');
  const pos = (t.match(POS_RE) || []).length;
  const neg = (t.match(NEG_RE) || []).length;
  if (neg > pos) return 'negativo';
  if (pos > neg) return 'positivo';
  if (RAGE_RE.test(t) || CHURN_RE.test(t)) return 'negativo';
  return 'neutral';
}

/**
 * 1 = detractor extremo … 5 = promoter.
 * @param {string} text
 * @param {'positivo'|'neutral'|'negativo'} sentimiento
 */
function scoreSentimiento1to5(text, sentimiento) {
  const t = String(text || '');
  if (sentimiento === 'positivo') return RAGE_RE.test(t) ? 3 : 5;
  if (sentimiento === 'neutral') return 3;
  if (RAGE_RE.test(t) && CHURN_RE.test(t)) return 1;
  if (RAGE_RE.test(t)) return 1;
  if (CHURN_RE.test(t)) return 2;
  return 2;
}

function sentimentPill(sentimiento) {
  if (sentimiento === 'negativo') return '🔴 Negativo';
  if (sentimiento === 'positivo') return '🟢 Positivo';
  return '🟡 Mixto';
}

function conversionScore(sentimiento, score, critica, text) {
  const t = String(text || '');
  if (sentimiento === 'positivo') return 'bajo';
  if (critica || score <= 2 || CHURN_RE.test(t)) return 'alto';
  if (sentimiento === 'negativo') return 'medio';
  return 'bajo';
}

function oneLineIncident(text, rival, categoria) {
  const snippet = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  const labels = {
    app_tecnologia: 'falla técnica',
    soporte_cliente: 'atención deficiente',
    precio_costo: 'fricción de precio o cobro',
    logistica_envio: 'problema logístico',
    calidad_producto: 'calidad percibida',
    marketing_ventas: 'promesa comercial no cumplida',
  };
  const label = labels[categoria] || 'fricción operativa';
  if (!snippet) {
    return `Cliente de ${rival} reporta ${label} sin detalle adicional.`;
  }
  return `Cliente de ${rival}: ${label}. “${snippet}${snippet.length >= 140 ? '…' : ''}”`;
}

function conquestHook({ companyName, rival, categoria, sentimiento, trial }) {
  const brand = String(companyName || '').trim() || 'nuestra solución';
  const pain = {
    app_tecnologia: 'estabilidad técnica y menos caídas',
    soporte_cliente: 'soporte local 24/7 que sí responde',
    precio_costo: 'precios transparentes, sin sorpresas en la factura',
    logistica_envio: 'operación predecible y seguimiento claro',
    calidad_producto: 'una experiencia más sólida de punta a punta',
    marketing_ventas: 'lo que prometemos es lo que entregamos',
  }[categoria];

  if (sentimiento === 'positivo') {
    return `Vi que estás conforme con ${rival}. Si alguna vez necesitás ${pain}, ${brand} ofrece ${trial} para probar sin compromiso.`;
  }

  return (
    `Lamento lo que te está pasando con ${rival}. ` +
    `Si buscás ${pain}, en ${brand} te acompañamos en la migración y tenés ${trial}. ` +
    `Cuando quieras, te muestro cómo evitar que se repita.`
  );
}

/**
 * @param {{
 *   text: string,
 *   competitorName?: string,
 *   companyName?: string,
 * }} input
 */
export function analyzeConquestMention(input) {
  const text = String(input?.text || '').trim();
  const rival = String(input?.competitorName || '').trim() || 'el rival';
  const companyName = String(input?.companyName || '').trim();
  const trial = 'el primer mes gratis (prueba de 30 días)';

  const sentimiento = classifyConquestSentiment(text);
  const categoria_operativa = classifyOperativeCategory(text);
  const score_sentimiento = scoreSentimiento1to5(text, sentimiento);
  const alerta_reputacional_critica =
    RAGE_RE.test(text) ||
    /\b(demanda|lawsuit|abogad|chargeback|estafa|fraude|scam)\b/i.test(text);

  return {
    analisis_metrico: {
      sentimiento,
      score_sentimiento,
      categoria_operativa,
      etiquetas: [sentimentPill(sentimiento), categoryPill(categoria_operativa)],
      alerta_reputacional_critica,
    },
    sales_intelligence: {
      resumen_incidente: oneLineIncident(text, rival, categoria_operativa),
      gancho_comercial_ia: conquestHook({
        companyName,
        rival,
        categoria: categoria_operativa,
        sentimiento,
        trial,
      }),
      score_conversion_estimado: conversionScore(
        sentimiento,
        score_sentimiento,
        alerta_reputacional_critica,
        text,
      ),
    },
  };
}
