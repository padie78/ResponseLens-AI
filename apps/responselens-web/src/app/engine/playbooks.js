/**
 * Playbooks de guerra legítima: defensa (propios) + captación (competencia).
 * Basados en temas reales de la queja — sin fabricar menciones.
 */

import { detectThemes, primaryTheme, themeHookSentence } from './theme-rules.js';

/**
 * @param {{
 *   complaint: string,
 *   competitorName?: string,
 *   companyName?: string,
 *   whatTheySell?: string,
 *   lang?: 'es'|'en',
 * }} input
 */
export function buildCapturePlaybook(input) {
  const lang = input.lang || 'es';
  const rival = input.competitorName || (lang === 'en' ? 'the rival' : 'el rival');
  const brand = input.companyName || (lang === 'en' ? 'your brand' : 'tu marca');
  const offer = input.whatTheySell || (lang === 'en' ? 'your offer' : 'tu oferta');
  const theme = primaryTheme(input.complaint || '', lang);
  const themes = detectThemes(input.complaint || '', lang);
  const hook = themeHookSentence(theme.id, lang);

  if (lang === 'en') {
    return {
      theme,
      themes,
      steps: [
        {
          id: 'listen',
          title: 'Listen',
          body: `Confirm the pain (${theme.label}) without attacking ${rival} by name-calling.`,
        },
        {
          id: 'public',
          title: 'Public soft reply',
          body: `Empathize briefly, mention you help ${hook}, invite a DM — no hard sell in-thread.`,
        },
        {
          id: 'dm',
          title: 'Private follow-up',
          body: `Map ${offer} to the exact complaint. Offer a short migration checklist.`,
        },
        {
          id: 'proof',
          title: 'Proof',
          body: `Share one concrete proof point (SLA, support hours, pricing clarity) aligned to ${theme.label}.`,
        },
        {
          id: 'crm',
          title: 'Pipeline',
          body: `Log the opportunity in CRM / Share from the alert card. Status: NEW → CONTACTED.`,
        },
      ],
      donts: [
        'Do not invent or post fake negative reviews about competitors.',
        'Do not pile-on with insults — it damages your brand and may violate platform rules.',
        'Do not spam every thread; prioritize HIGH/CRITICAL + switch-intent.',
      ],
      oneLiner: `${brand}: win on ${theme.label} — ${hook}.`,
    };
  }

  return {
    theme,
    themes,
    steps: [
      {
        id: 'listen',
        title: 'Escuchar',
        body: `Confirmá el dolor (${theme.label}) sin insultar a ${rival}.`,
      },
      {
        id: 'public',
        title: 'Respuesta pública suave',
        body: `Empatía breve, mencioná que ayudás ${hook}, invitá a DM — sin hard sell en el hilo.`,
      },
      {
        id: 'dm',
        title: 'Seguimiento privado',
        body: `Conectá ${offer} con la queja exacta. Ofrecé checklist corto de migración.`,
      },
      {
        id: 'proof',
        title: 'Prueba',
        body: `Un proof point concreto (SLA, soporte, claridad de precio) alineado a ${theme.label}.`,
      },
      {
        id: 'crm',
        title: 'Pipeline',
        body: `Registrá en CRM / Share desde la alerta. Estado: NEW → CONTACTED.`,
      },
    ],
    donts: [
      'No inventes ni publiques reseñas falsas del rival.',
      'No te sumes al linchamiento: daña tu marca y viola reglas de la plataforma.',
      'No spamees todos los hilos; priorizá HIGH/CRITICAL + intención de cambio.',
    ],
    oneLiner: `${brand}: ganá en ${theme.label} — ${hook}.`,
  };
}

/**
 * Playbook de defensa cuando la queja es sobre tu marca.
 */
export function buildDefensePlaybook(input) {
  const lang = input.lang || 'es';
  const brand = input.companyName || (lang === 'en' ? 'your brand' : 'tu marca');
  const theme = primaryTheme(input.complaint || '', lang);
  const themes = detectThemes(input.complaint || '', lang);

  if (lang === 'en') {
    return {
      theme,
      themes,
      steps: [
        {
          id: 'triage',
          title: 'Triage',
          body: `Classify risk (legal / safety / churn). Theme: ${theme.label}.`,
        },
        {
          id: 'public',
          title: 'Public reply',
          body: `Acknowledge + take ownership. Move sensitive detail to DM.`,
        },
        {
          id: 'fix',
          title: 'Fix signal',
          body: `If ${theme.id === 'reliability' ? 'uptime' : theme.label} is real, say what is being fixed — no empty apology.`,
        },
        {
          id: 'follow',
          title: 'Close the loop',
          body: `Follow up when resolved. Log in Historial for KPI tracking.`,
        },
      ],
      donts: [
        'Do not argue publicly with angry customers.',
        'Do not disclose PII or internal blame in comments.',
      ],
      oneLiner: `${brand} defense on ${theme.label}: acknowledge → private fix → close loop.`,
    };
  }

  return {
    theme,
    themes,
    steps: [
      {
        id: 'triage',
        title: 'Triage',
        body: `Clasificá riesgo (legal / safety / churn). Tema: ${theme.label}.`,
      },
      {
        id: 'public',
        title: 'Respuesta pública',
        body: `Reconocé el problema y hacete cargo. Detalle sensible → DM.`,
      },
      {
        id: 'fix',
        title: 'Señal de fix',
        body: `Si el dolor de ${theme.label} es real, decí qué se está corrigiendo — sin disculpa vacía.`,
      },
      {
        id: 'follow',
        title: 'Cerrar el ciclo',
        body: `Seguimiento cuando esté resuelto. Registrá en Historial para KPIs.`,
      },
    ],
    donts: [
      'No discutas en público con clientes enfadados.',
      'No expongas PII ni culpas internas en comentarios.',
    ],
    oneLiner: `Defensa ${brand} en ${theme.label}: reconocer → fix privado → cerrar ciclo.`,
  };
}

export function formatPlaybookHtml(playbook) {
  if (!playbook) return '';
  const steps = (playbook.steps || [])
    .map(
      (s, i) =>
        `<li><strong>${i + 1}. ${escapeHtml(s.title)}</strong> — ${escapeHtml(s.body)}</li>`,
    )
    .join('');
  const donts = (playbook.donts || [])
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join('');
  return `
    <p class="rl-playbook__line">${escapeHtml(playbook.oneLiner || '')}</p>
    <ol class="rl-playbook__steps">${steps}</ol>
    ${donts ? `<p class="rl-muted rl-alert__section-label">No hacer</p><ul class="rl-playbook__donts">${donts}</ul>` : ''}
  `;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Paso extra según canal (local, sin API). */
export function withChannelPlaybook(playbook, channel) {
  if (!playbook) return playbook;
  const ch = String(channel || '').toLowerCase();
  let extra = null;
  if (ch.includes('linkedin')) {
    extra = {
      id: 'channel',
      title: 'LinkedIn',
      body: 'Tono profesional, sin emojis de meme. Preferí comentario corto + InMail si hay lead.',
    };
  } else if (ch.includes('reddit')) {
    extra = {
      id: 'channel',
      title: 'Reddit',
      body: 'No suenes a marca. Respondé como humano; el pitch duro se downvota.',
    };
  } else if (ch.includes('twitter') || ch.includes('x.com') || ch === 'x') {
    extra = {
      id: 'channel',
      title: 'X',
      body: 'Una frase pública + hilo o DM. Evitá walls of text.',
    };
  } else if (ch.includes('youtube')) {
    extra = {
      id: 'channel',
      title: 'YouTube',
      body: 'Comentario visible bajo el video; detalle a comunidad o mail.',
    };
  } else if (ch.includes('instagram') || ch.includes('tiktok')) {
    extra = {
      id: 'channel',
      title: 'Social corto',
      body: 'Respuesta breve en comentario; conversión en DM/stories.',
    };
  }
  if (!extra) return playbook;
  return { ...playbook, steps: [...(playbook.steps || []), extra] };
}
