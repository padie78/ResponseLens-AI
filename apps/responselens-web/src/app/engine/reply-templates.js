/**
 * Plantillas por tema (además del draft IA). Copy corto para hilo público.
 */

import { detectReplyLanguage } from './local-fallback.js';
import { primaryTheme } from './theme-rules.js';

/**
 * @param {{ complaint?: string, companyName?: string, competitorName?: string, brandScope?: string }} opts
 * @returns {{ id: string, label: string, body: string }[]}
 */
export function replyTemplatesFor(opts) {
  const brand = String(opts.companyName || 'nosotros').trim() || 'nosotros';
  const rival = String(opts.competitorName || 'el proveedor').trim();
  const lang = detectReplyLanguage(opts.complaint || '');
  const theme = primaryTheme(opts.complaint || '', lang === 'en' ? 'en' : 'es');
  const id = theme?.id || 'general';
  const own = opts.brandScope !== 'rival';

  const ownMap = {
    pricing: {
      label: 'Precio / factura',
      body: `Gracias por avisar. En ${brand} revisamos el cobro y te respondemos por DM con el desglose. No queremos que pagues de más.`,
    },
    reliability: {
      label: 'Caída / outage',
      body: `Estamos encima del incidente. En ${brand} el status lo actualizamos en cuanto tengamos causa y ETA. Gracias por la paciencia.`,
    },
    support: {
      label: 'Soporte lento',
      body: `Sentimos la espera. Un humano de ${brand} toma el ticket ahora y te escribe en el hilo o por DM con el siguiente paso.`,
    },
    product: {
      label: 'Producto / bug',
      body: `Anotado. Pasamos el caso a producto en ${brand}. Si podés, mandanos URL o captura por DM para reproducirlo.`,
    },
    trust: {
      label: 'Confianza',
      body: `Esto lo tratamos en serio. ${brand} no discute esto en público: te pedimos DM y lo escala compliance.`,
    },
    churn: {
      label: 'Se quiere ir',
      body: `Antes de que te vayas: queremos entender el dolor. ${brand} te ofrece una revisión de cuenta por DM, sin compromiso.`,
    },
    general: {
      label: 'Genérica',
      body: `Leímos tu comentario. En ${brand} lo vemos y te respondemos con algo concreto, no con una frase vacía.`,
    },
  };

  const rivalMap = {
    pricing: {
      label: 'Ángulo precio',
      body: `Si el precio de ${rival} no cierra, en ${brand} podemos armarte una comparativa honesta. DM abierto.`,
    },
    reliability: {
      label: 'Ángulo uptime',
      body: `Si ${rival} te dejó tirado, ${brand} publica status y on-call. Si querés, te contamos cómo operamos el corte.`,
    },
    support: {
      label: 'Ángulo soporte',
      body: `Soporte que no contesta es caro. En ${brand} hay humanos en el mismo día. Te paso cómo arrancar por DM.`,
    },
    churn: {
      label: 'Cambio de proveedor',
      body: `Si estás buscando alternativa a ${rival}, ${brand} puede hacer un debrief de 20 min. Sin pitch agresivo.`,
    },
    general: {
      label: 'Captación suave',
      body: `Vimos el hilo con ${rival}. Si te sirve una segunda opinión de ${brand}, estamos.`,
    },
  };

  const pack = own ? ownMap : rivalMap;
  const primary = pack[id] || pack.general;
  const extra = Object.entries(pack)
    .filter(([k]) => k !== id && k !== 'general')
    .slice(0, 2)
    .map(([k, v]) => ({ id: k, ...v }));
  const rows = [{ id, ...primary }, ...extra];
  if (lang !== 'en') return rows;
  return rows.map((r) => ({
    ...r,
    body: `[EN] ${r.body}`,
  }));
}
