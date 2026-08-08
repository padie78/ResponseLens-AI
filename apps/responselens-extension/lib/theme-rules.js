/**
 * Temas de fricción compartidos (ficha + pitches + playbooks).
 */

export const THEME_RULES = [
  {
    id: 'reliability',
    re: /\b(outage|downtime|ca[ií]da|falla|crash|timeout|500|unstable|inestable|uptime)\b/i,
    label: 'Confiabilidad',
    en: 'Reliability / uptime',
    es: 'Confiabilidad / uptime',
  },
  {
    id: 'support',
    re: /\b(support|soporte|ticket|respuesta|ignore|ghost|abysmal|no\s+responde)\b/i,
    label: 'Soporte',
    en: 'Customer support',
    es: 'Soporte al cliente',
  },
  {
    id: 'pricing',
    re: /\b(price|precio|caro|expensive|billing|cobro|charge|refund|reembolso|chargeback)\b/i,
    label: 'Precio',
    en: 'Pricing / billing',
    es: 'Precio / facturación',
  },
  {
    id: 'product',
    re: /\b(bug|feature|ui|ux|product|producto|lento|slow|broken|roto)\b/i,
    label: 'Producto',
    en: 'Product / UX',
    es: 'Producto / UX',
  },
  {
    id: 'trust',
    re: /\b(scam|estafa|fraude|trust|confianza|lie|mentir|lawsuit|demanda)\b/i,
    label: 'Confianza',
    en: 'Trust / reputation',
    es: 'Confianza / reputación',
  },
  {
    id: 'churn',
    re: /\b(switch|cambio|cancel|me\s+voy|leaving|alternative|alternativa|me\s+cambio)\b/i,
    label: 'Churn',
    en: 'Switch intent',
    es: 'Intención de cambio',
  },
];

/**
 * @param {string} text
 * @param {'es'|'en'} [lang]
 * @returns {{ id: string, label: string }[]}
 */
export function detectThemes(text, lang = 'es') {
  const hit = [];
  for (const rule of THEME_RULES) {
    if (rule.re.test(text)) {
      hit.push({
        id: rule.id,
        label: lang === 'en' ? rule.en : rule.es,
      });
    }
  }
  if (!hit.length) {
    hit.push({
      id: 'general',
      label: lang === 'en' ? 'General dissatisfaction' : 'Insatisfacción general',
    });
  }
  return hit;
}

/** Primer tema accionable (prioriza churn/trust/reliability). */
export function primaryTheme(text, lang = 'es') {
  const themes = detectThemes(text, lang);
  const priority = ['churn', 'trust', 'reliability', 'support', 'pricing', 'product'];
  for (const id of priority) {
    const found = themes.find((t) => t.id === id);
    if (found) return found;
  }
  return themes[0];
}

export function themeHookSentence(themeId, lang = 'es') {
  const mapEs = {
    reliability: 'especialmente en uptime y estabilidad',
    support: 'con soporte humano que sí responde',
    pricing: 'con facturación predecible y sin sorpresas',
    product: 'con un producto más usable y estable',
    trust: 'con transparencia y reputación cuidada',
    churn: 'si estás evaluando alternativas ahora',
    general: 'sin fricción innecesaria',
  };
  const mapEn = {
    reliability: 'especially on uptime and stability',
    support: 'with human support that actually replies',
    pricing: 'with predictable billing and no surprises',
    product: 'with a more usable, stable product',
    trust: 'with transparency and a cleaner reputation',
    churn: 'if you are evaluating alternatives now',
    general: 'without unnecessary friction',
  };
  const map = lang === 'en' ? mapEn : mapEs;
  return map[themeId] || map.general;
}
