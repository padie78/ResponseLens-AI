/**
 * Digest diario (copiar a Slack/mail). No envía solo: arma el texto.
 */

import { listLeads, slaBreached } from './ops-queue.js';

function isOpen(status) {
  const st = String(status || 'NEW').toUpperCase();
  return st === 'NEW' || st === 'SNOOZED';
}

function snip(t, n = 110) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * @param {{ alerts?: object[], companyName?: string }} opts
 */
export function buildDailyDigest(opts) {
  const alerts = opts.alerts || [];
  const brand = opts.companyName || 'Marca';
  const own = alerts.filter((a) => a.brandScope === 'own' && isOpen(a.status));
  const urgent = own
    .filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL' || slaBreached(a))
    .slice(0, 5);
  const leads = listLeads(alerts).slice(0, 3);
  const lines = [
    `Digest ResponseLens — ${brand} — ${new Date().toLocaleDateString('es-AR')}`,
    '',
    `Urgentes / SLA (${urgent.length})`,
    ...urgent.map(
      (a, i) =>
        `${i + 1}. [${a.severity}] ${a._ops?.assignee || 'sin dueño'} — ${snip(a.originalComplaint)}`,
    ),
    urgent.length ? '' : '1. Sin urgentes abiertos.',
    `Leads rivales (${leads.length})`,
    ...leads.map(
      (a, i) =>
        `${i + 1}. ${a.competitorName} · ${a._ops?.crmStage || a.status} · ${a._ops?.assignee || 'sin dueño'} — ${snip(a.originalComplaint)}`,
    ),
    leads.length ? '' : '1. Sin intención de cambio abierta.',
    'Secuencia sugerida: público → DM → follow-up 48 h.',
  ];
  return {
    markdown: lines.join('\n'),
    urgentCount: urgent.length,
    leadCount: leads.length,
    urgent,
    leads,
  };
}

/**
 * POST digest to a Slack incoming webhook.
 * @param {string} digestText
 * @param {string} webhookUrl
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendDigestToSlack(digestText, webhookUrl) {
  const url = String(webhookUrl || '').trim();
  if (!url.startsWith('https://hooks.slack.com/')) {
    return { ok: false, error: 'URL inválida: debe ser https://hooks.slack.com/...' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: digestText } },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Slack respondió ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Error de red' };
  }
}
