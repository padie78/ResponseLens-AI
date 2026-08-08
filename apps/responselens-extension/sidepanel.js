/**
 * Side Panel — Ops KPIs, triage, historial, workflow de alertas, fallback offline.
 */

import { gqlRequest } from './lib/appsync-client.js';
import {
  confirmSignUp,
  getCognitoConfig,
  getSession,
  saveCognitoConfig,
  signIn,
  signOut,
  signUp,
  startLocalSession,
} from './lib/auth.js';
import { buildLocalReplyOptions } from './lib/local-fallback.js';
import { buildLocalRivalReport, normalizeRivalReport } from './lib/rival-report.js';
import { computeRivalPerception } from './lib/rival-intel.js';
import { computeAnalytics, computeOpsStats, topEntries } from './lib/ops-stats.js';
import {
  buildDemoOpportunities,
  buildOpportunity,
  craftSalesPitchVariants,
  defaultCompetitorSeed,
  findMentionedCompetitor,
  lookupCompetitorProfile,
} from './lib/competitor-opportunity.js';
import { runCompetitorScan } from './lib/competitor-scan.js';
import {
  createSharePackage,
  formatPushSummary,
  isValidEmail,
  loadIntegrations,
  normalizeWhatsAppPhone,
  postSlackWebhook,
  pushOpportunityToCrm,
  saveIntegrations,
} from './lib/integrations.js';
import { loadScanCredentials, saveScanCredentials } from './lib/scan-credentials.js';
import {
  SCAN_SOURCES,
  PAGE_PLATFORMS,
  collectPlatformPrefsFromDom,
  defaultPlatformPrefs,
  listOpenUrlsForPrefs,
  matchPatternsForHost,
  normalizeHost,
  normalizePlatformPrefs,
} from './lib/platforms.js';

const STORAGE = {
  config: 'rl_user_config',
  alerts: 'rl_competitor_alerts',
  pending: 'rl_pending_complaint',
  appsync: 'rl_appsync',
  history: 'rl_reply_history',
  detection: 'rl_detection',
  uiZoom: 'rl_ui_zoom',
  rivalReports: 'rl_rival_reports',
  pageRivals: 'rl_page_rivals',
  pendingRivalReport: 'rl_pending_rival_report',
};

const ZOOM_STEPS = [100, 110, 125, 140, 160];
const DEFAULT_ZOOM = 125;
let uiZoom = DEFAULT_ZOOM;
/** @type {string | null} */
let expandedAlertId = null;

/** @type {null | { kind: string, title: string, data: object, alert?: object }} */
let pendingShareDraft = null;
/** @type {null | ((value: { dest: string, contact: string } | null) => void)} */
let shareModalResolve = null;
/** @type {string | null} */
let sharePendingDest = null;

function shareUiEls() {
  return {
    modal: document.getElementById('share-modal'),
    sub: document.getElementById('share-modal-sub'),
    stepDest: document.getElementById('share-step-dest'),
    stepContact: document.getElementById('share-step-contact'),
    input: document.getElementById('share-contact-input'),
    hint: document.getElementById('share-contact-hint'),
    label: document.getElementById('share-contact-label-text'),
    title: document.getElementById('share-modal-title'),
  };
}

function resetShareModalSteps() {
  const ui = shareUiEls();
  sharePendingDest = null;
  if (ui.stepDest) ui.stepDest.hidden = false;
  if (ui.stepContact) ui.stepContact.hidden = true;
  if (ui.title) ui.title.textContent = '¿Dónde querés compartir?';
  if (ui.input) ui.input.value = '';
}

function closeShareModal(value = null) {
  const ui = shareUiEls();
  if (ui.modal) ui.modal.hidden = true;
  resetShareModalSteps();
  const resolve = shareModalResolve;
  shareModalResolve = null;
  if (resolve) resolve(value);
}

function destNeedsContact(dest) {
  return dest === 'email' || dest === 'whatsapp' || dest === 'slack' || dest === 'crm';
}

async function showContactStep(dest, contacts) {
  const ui = shareUiEls();
  sharePendingDest = dest;
  if (ui.stepDest) ui.stepDest.hidden = true;
  if (ui.stepContact) ui.stepContact.hidden = false;
  if (ui.title) ui.title.textContent = '¿A quién?';

  let value = '';
  let hint = '';
  let labelText = 'Destinatario';
  let type = 'text';

  if (dest === 'email') {
    labelText = 'Email del destinatario';
    value = contacts.email || '';
    hint = 'Se abre el cliente de correo hacia esta dirección.';
    type = 'email';
  } else if (dest === 'whatsapp') {
    labelText = 'WhatsApp (código país + número)';
    value = contacts.whatsapp || '';
    hint = 'Ej: 54911xxxxxxxx (sin + ni espacios).';
    type = 'tel';
  } else if (dest === 'slack') {
    labelText = 'Slack Incoming Webhook URL';
    value = contacts.slackWebhook || '';
    hint = contacts.slackLabel
      ? `Canal/persona: ${contacts.slackLabel}. Si dejás vacío, solo se copia para pegar.`
      : 'Si tenés Incoming Webhook se postea solo. Si no, se copia el mensaje.';
    type = 'url';
  } else if (dest === 'crm') {
    labelText = 'CRM destino (solo lectura)';
    const parts = [];
    const integ = await loadIntegrations();
    if (integ.webhook?.enabled && integ.webhook.url) parts.push(`Webhook: ${integ.webhook.url}`);
    if (integ.hubspot?.enabled) parts.push('HubSpot: Private App configurada');
    value = parts.join(' · ') || 'Ningún CRM activo — configurá en Config → Integraciones';
    hint = parts.length
      ? 'Se enviará a los CRM habilitados en Config.'
      : 'Activá Webhook y/o HubSpot y volvé a intentar.';
    type = 'text';
  }

  if (ui.label) {
    ui.label.textContent = labelText;
  }
  if (ui.input) {
    ui.input.type = type;
    ui.input.value = value;
    ui.input.readOnly = dest === 'crm';
    ui.input.placeholder =
      dest === 'email'
        ? 'persona@empresa.com'
        : dest === 'whatsapp'
          ? '54911…'
          : dest === 'slack'
            ? 'https://hooks.slack.com/services/…'
            : '';
    if (dest !== 'crm') ui.input.focus();
  }
  if (ui.hint) ui.hint.textContent = hint;
}

/**
 * Pregunta destino + contacto. Retorna { dest, contact } o null si cancela.
 */
function askShareDestination(subtitle = '') {
  const ui = shareUiEls();
  if (!ui.modal) return Promise.resolve({ dest: 'clipboard', contact: '' });
  resetShareModalSteps();
  if (ui.sub) ui.sub.textContent = subtitle || 'Elegí canal y luego el destinatario.';
  ui.modal.hidden = false;
  return new Promise((resolve) => {
    shareModalResolve = resolve;
  });
}

function buildShareMessage({ title, viewerUrl, token, summary, contactNote }) {
  return [
    title,
    summary ? `\n${summary}\n` : '',
    contactNote ? `(Para: ${contactNote})` : '',
    `Visor (mismo Chrome): ${viewerUrl}`,
    '',
    'Token (para otro dispositivo / colega):',
    token,
    '',
    '— ResponseLens AI',
  ]
    .filter((line) => line !== undefined && line !== '')
    .join('\n');
}

/**
 * @param {{ kind: string, title: string, data: object, alert?: object, summary?: string }} draft
 */
async function shareWithDestinationPrompt(draft) {
  pendingShareDraft = draft;
  const choice = await askShareDestination(draft.title);
  pendingShareDraft = null;
  if (!choice?.dest) return { ok: false, cancelled: true };

  const { dest, contact } = choice;
  const integ = await loadIntegrations();

  const { viewerUrl, token, pack } = await createSharePackage({
    kind: draft.kind,
    title: draft.title,
    data: draft.data,
  });
  const message = buildShareMessage({
    title: draft.title,
    viewerUrl,
    token,
    summary: draft.summary || '',
    contactNote: contact || integ.contacts?.slackLabel || '',
  });

  if (dest === 'clipboard' || dest === 'viewer') {
    if (dest === 'viewer') await chrome.tabs.create({ url: viewerUrl, active: true });
    await navigator.clipboard.writeText(message);
    if (els.scanStatus) {
      els.scanStatus.classList.remove('is-error');
      els.scanStatus.textContent =
        dest === 'viewer' ? `Visor abierto (${pack.shareId}).` : `Copiado (${pack.shareId}).`;
    }
    return { ok: true, dest, pack };
  }

  if (dest === 'email') {
    if (!isValidEmail(contact)) {
      if (els.scanStatus) {
        els.scanStatus.classList.add('is-error');
        els.scanStatus.textContent = 'Email inválido. Configurá el contacto o corregilo al compartir.';
      }
      return { ok: false, dest };
    }
    // Recordar contacto
    await saveIntegrations({ ...integ, contacts: { ...integ.contacts, email: contact.trim() } });
    const subject = encodeURIComponent(draft.title.slice(0, 120));
    const body = encodeURIComponent(message.slice(0, 1800));
    await chrome.tabs.create({
      url: `mailto:${encodeURIComponent(contact.trim())}?subject=${subject}&body=${body}`,
      active: true,
    });
    await navigator.clipboard.writeText(message).catch(() => {});
    if (els.scanStatus) {
      els.scanStatus.classList.remove('is-error');
      els.scanStatus.textContent = `Email a ${contact.trim()} · texto también en portapapeles.`;
    }
    return { ok: true, dest, pack };
  }

  if (dest === 'whatsapp') {
    const phone = normalizeWhatsAppPhone(contact);
    if (!phone) {
      if (els.scanStatus) {
        els.scanStatus.classList.add('is-error');
        els.scanStatus.textContent = 'Falta el número de WhatsApp (con código de país).';
      }
      return { ok: false, dest };
    }
    await saveIntegrations({ ...integ, contacts: { ...integ.contacts, whatsapp: phone } });
    const text = encodeURIComponent(message.slice(0, 3000));
    await chrome.tabs.create({ url: `https://wa.me/${phone}?text=${text}`, active: true });
    if (els.scanStatus) {
      els.scanStatus.classList.remove('is-error');
      els.scanStatus.textContent = `WhatsApp a +${phone} (${pack.shareId}).`;
    }
    return { ok: true, dest, pack };
  }

  if (dest === 'slack') {
    const webhook = String(contact || '').trim();
    if (webhook) {
      await saveIntegrations({
        ...integ,
        contacts: { ...integ.contacts, slackWebhook: webhook },
      });
      const posted = await postSlackWebhook(webhook, message);
      if (els.scanStatus) {
        els.scanStatus.classList.toggle('is-error', !posted.ok);
        els.scanStatus.textContent = posted.ok
          ? `Enviado a Slack${integ.contacts?.slackLabel ? ` (${integ.contacts.slackLabel})` : ''}.`
          : `Slack falló: ${posted.detail}. Mensaje copiado.`;
      }
      if (!posted.ok) await navigator.clipboard.writeText(message);
      return { ok: posted.ok, dest, pack };
    }
    await navigator.clipboard.writeText(message);
    if (els.scanStatus) {
      els.scanStatus.classList.remove('is-error');
      els.scanStatus.textContent = `Sin webhook: mensaje copiado${
        integ.contacts?.slackLabel ? ` · pegalo en ${integ.contacts.slackLabel}` : ' · pegalo en Slack'
      }.`;
    }
    return { ok: true, dest, pack };
  }

  if (dest === 'crm') {
    if (!integ.webhook?.enabled && !integ.hubspot?.enabled) {
      if (els.scanStatus) {
        els.scanStatus.classList.add('is-error');
        els.scanStatus.textContent = 'Configurá Webhook o HubSpot en Config → Integraciones.';
      }
      return { ok: false, dest };
    }
    if (draft.kind === 'opportunity' && draft.alert) {
      const cfgData = await storageGet([STORAGE.config]);
      const results = await pushOpportunityToCrm(draft.alert, {
        companyName: cfgData[STORAGE.config]?.company?.companyName,
        reportMarkdown: draft.data?.reportMarkdown,
      });
      if (els.scanStatus) {
        els.scanStatus.classList.toggle('is-error', !results.some((r) => r.ok));
        els.scanStatus.textContent = formatPushSummary(results);
      }
      return { ok: results.some((r) => r.ok), dest, pack, results };
    }
    const synthetic = {
      alertId: pack.shareId,
      competitorName: draft.data?.competitorName || draft.title,
      originalComplaint: draft.summary || draft.title,
      salesPitch: (draft.data?.opportunities || []).slice(0, 2).join('\n') || null,
      severity: 'MEDIUM',
      status: 'NEW',
      channel: 'share',
      sourceUrl: viewerUrl,
    };
    const cfgData = await storageGet([STORAGE.config]);
    const results = await pushOpportunityToCrm(synthetic, {
      companyName: cfgData[STORAGE.config]?.company?.companyName,
      reportMarkdown: draft.data?.reportMarkdown,
    });
    if (els.scanStatus) {
      els.scanStatus.classList.toggle('is-error', !results.some((r) => r.ok));
      els.scanStatus.textContent = formatPushSummary(results);
    }
    return { ok: results.some((r) => r.ok), dest, pack, results };
  }

  return { ok: false, dest };
}

document.getElementById('share-modal')?.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  if (t.closest('[data-share-cancel]')) {
    closeShareModal(null);
    return;
  }
  const destBtn = t.closest('[data-share-dest]');
  if (destBtn) {
    const dest = destBtn.getAttribute('data-share-dest');
    if (!destNeedsContact(dest)) {
      closeShareModal({ dest, contact: '' });
      return;
    }
    const integ = await loadIntegrations();
    await showContactStep(dest, integ.contacts || {});
    return;
  }
});

document.getElementById('btn-share-back')?.addEventListener('click', () => {
  resetShareModalSteps();
  const ui = shareUiEls();
  if (ui.sub) ui.sub.textContent = pendingShareDraft?.title || 'Elegí canal y luego el destinatario.';
});

document.getElementById('btn-share-send')?.addEventListener('click', () => {
  const dest = sharePendingDest;
  const contact = document.getElementById('share-contact-input')?.value?.trim() || '';
  if (!dest) return;
  if (dest === 'email' && !isValidEmail(contact)) {
    const hint = document.getElementById('share-contact-hint');
    if (hint) hint.textContent = 'Ingresá un email válido.';
    return;
  }
  if (dest === 'whatsapp' && !normalizeWhatsAppPhone(contact)) {
    const hint = document.getElementById('share-contact-hint');
    if (hint) hint.textContent = 'Ingresá un número con código de país.';
    return;
  }
  if (dest === 'crm') {
    closeShareModal({ dest, contact: '' });
    return;
  }
  closeShareModal({ dest, contact });
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && shareModalResolve) closeShareModal(null);
});

const ANALYZE_MUTATION = `
  mutation AnalyzeReply($input: AnalyzeReplyInput!) {
    analyzeReply(input: $input) {
      complaintId
      sourceUrl
      channel
      originalText
      model
      generatedAt
      triage {
        riskScore
        riskLevel
        escalationFlags
        recommendedAction
        keyIssues
        summary
      }
      options {
        tone
        label
        body
        rationale
      }
    }
  }
`;

const ANALYZE_RIVAL_MUTATION = `
  mutation AnalyzeRivalReport($input: AnalyzeRivalReportInput!) {
    analyzeRivalReport(input: $input) {
      competitorName
      mentionCount
      avgFrustration
      riskLevel
      conclusions
      opportunities
      reportMarkdown
      model
      generatedAt
      themes { id label }
      sources
    }
  }
`;

const SAVE_CONFIG_MUTATION = `
  mutation SaveUserConfig($input: SaveUserConfigInput!) {
    saveUserConfig(input: $input) {
      userId
      updatedAt
    }
  }
`;

const ACTION_LABELS = {
  PUBLIC_REPLY: 'Responder en público',
  PRIVATE_DM: 'Mover a privado / DM',
  ESCALATE_LEGAL: 'Escalar a Legal',
  ESCALATE_SAFETY: 'Escalar a Safety',
  NO_ENGAGE: 'No interactuar',
};

/** @type {null | Record<string, unknown>} */
let currentComplaint = null;
/** @type {null | Record<string, unknown>} */
let currentResult = null;

const els = {
  tabs: [...document.querySelectorAll('.rl-tab')],
  panels: {
    own: document.getElementById('panel-own'),
    comp: document.getElementById('panel-comp'),
    stats: document.getElementById('panel-stats'),
    hist: document.getElementById('panel-hist'),
    cfg: document.getElementById('panel-cfg'),
  },
  empty: document.getElementById('own-empty'),
  loader: document.getElementById('own-loader'),
  triage: document.getElementById('own-triage'),
  complaint: document.getElementById('own-complaint'),
  cards: document.getElementById('own-cards'),
  feed: document.getElementById('comp-feed'),
  histList: document.getElementById('hist-list'),
  form: document.getElementById('cfg-form'),
  status: document.getElementById('cfg-status'),
  refresh: document.getElementById('btn-refresh-alerts'),
  loadDemo: document.getElementById('btn-load-demo'),
  scanComp: document.getElementById('btn-scan-comp'),
  scanStatus: document.getElementById('comp-scan-status'),
  alertFilter: document.getElementById('alert-filter'),
  alertFilterDate: document.getElementById('alert-filter-date'),
  alertFilterPlatform: document.getElementById('alert-filter-platform'),
  alertFilterRival: document.getElementById('alert-filter-rival'),
  alertFilterSeverity: document.getElementById('alert-filter-severity'),
  alertFilterQ: document.getElementById('alert-filter-q'),
  filterCount: document.getElementById('comp-filter-count'),
  rivalBanner: document.getElementById('rival-intel-banner'),
  rivalBannerTitle: document.getElementById('rival-intel-title'),
  rivalBannerSub: document.getElementById('rival-intel-sub'),
  rivalBannerBtn: document.getElementById('btn-rival-intel'),
  rivalReportPanel: document.getElementById('rival-report-panel'),
  fichaRivalSelect: document.getElementById('ficha-rival-select'),
  btnOpenRivalFicha: document.getElementById('btn-open-rival-ficha'),
  manual: document.getElementById('own-manual'),
  compManual: document.getElementById('comp-manual'),
  rivalSelect: document.getElementById('comp-rival-select'),
  exportHist: document.getElementById('btn-export-history'),
  zoomOut: document.getElementById('btn-zoom-out'),
  zoomIn: document.getElementById('btn-zoom-in'),
  zoomLabel: document.getElementById('btn-zoom-label'),
  kpis: {
    replies: document.getElementById('kpi-replies'),
    alerts: document.getElementById('kpi-alerts'),
    critical: document.getElementById('kpi-critical'),
    winrate: document.getElementById('kpi-winrate'),
  },
  statsRange: document.getElementById('stats-range'),
  statsKpiGrid: document.getElementById('stats-kpi-grid'),
  statsCompareSummary: document.getElementById('stats-compare-summary'),
  chartCompare: document.getElementById('chart-compare'),
  chartTrend: document.getElementById('chart-trend'),
  chartStack: document.getElementById('chart-stack'),
  chartFunnel: document.getElementById('chart-funnel'),
  chartRisk: document.getElementById('chart-risk'),
  chartSeverity: document.getElementById('chart-severity'),
  chartRivals: document.getElementById('chart-rivals'),
  chartChannels: document.getElementById('chart-channels'),
  chartTones: document.getElementById('chart-tones'),
  chartActions: document.getElementById('chart-actions'),
};

function nearestZoomStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - n) < Math.abs(best - n) ? step : best,
  );
}

function applyUiZoom(percent) {
  uiZoom = nearestZoomStep(percent);
  const scale = uiZoom / 100;
  document.documentElement.style.setProperty('--rl-ui-zoom', String(scale));
  // Evitar zoom en <html> (rompe scroll con overflow:hidden).
  document.documentElement.style.zoom = '';
  if (els.zoomLabel) els.zoomLabel.textContent = `${uiZoom}%`;
  if (els.zoomOut) els.zoomOut.disabled = uiZoom <= ZOOM_STEPS[0];
  if (els.zoomIn) els.zoomIn.disabled = uiZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

async function loadUiZoom() {
  const data = await storageGet([STORAGE.uiZoom]);
  applyUiZoom(data[STORAGE.uiZoom] ?? DEFAULT_ZOOM);
}

async function setUiZoom(percent) {
  applyUiZoom(percent);
  await storageSet({ [STORAGE.uiZoom]: uiZoom });
}

function activateTab(name) {
  for (const tab of els.tabs) {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  for (const [key, panel] of Object.entries(els.panels)) {
    if (!panel) continue;
    const on = key === name;
    panel.classList.toggle('is-visible', on);
    panel.hidden = !on;
  }
  if (name === 'hist') void renderHistory();
  if (name === 'comp') void refreshAlerts().catch((err) => console.error('[RL] refreshAlerts', err));
  if (name === 'stats') void renderStats().catch((err) => console.error('[RL] renderStats', err));
}

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

els.zoomOut?.addEventListener('click', () => {
  const idx = ZOOM_STEPS.indexOf(uiZoom);
  if (idx > 0) void setUiZoom(ZOOM_STEPS[idx - 1]);
});

els.zoomIn?.addEventListener('click', () => {
  const idx = ZOOM_STEPS.indexOf(uiZoom);
  if (idx < ZOOM_STEPS.length - 1) void setUiZoom(ZOOM_STEPS[idx + 1]);
});

els.zoomLabel?.addEventListener('click', () => {
  void setUiZoom(100);
});

applyUiZoom(DEFAULT_ZOOM);

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(obj) {
  return chrome.storage.local.set(obj);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setOwnState({ loading = false, hasComplaint = false } = {}) {
  els.empty.hidden = hasComplaint || loading;
  els.loader.hidden = !loading;
  els.triage.hidden = !hasComplaint || loading;
  els.complaint.hidden = !hasComplaint || loading;
  els.cards.hidden = !hasComplaint || loading;
}

async function refreshKpis() {
  const data = await storageGet([STORAGE.history, STORAGE.alerts]);
  const stats = computeOpsStats({
    history: data[STORAGE.history] || [],
    alerts: data[STORAGE.alerts] || [],
  });
  els.kpis.replies.textContent = String(stats.repliesThisWeek);
  els.kpis.alerts.textContent = String(stats.openAlerts);
  els.kpis.critical.textContent = String(stats.criticalOpen);
  if (els.kpis.winrate) els.kpis.winrate.textContent = `${stats.winRate}%`;
  if (!els.panels.stats?.hidden) renderStats();
}

function statsRangeDays() {
  const n = Number(els.statsRange?.value || 14);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

async function renderStats() {
  if (!els.statsKpiGrid) return;
  const data = await storageGet([STORAGE.history, STORAGE.alerts, STORAGE.config]);
  const companyName = data[STORAGE.config]?.company?.companyName || 'Tu marca';
  const analytics = computeAnalytics({
    history: data[STORAGE.history] || [],
    alerts: data[STORAGE.alerts] || [],
    days: statsRangeDays(),
  });

  const { own, comp, comparison, pipeline, series } = analytics;

  els.statsKpiGrid.innerHTML = [
    kpiTile(own.repliesInWindow, 'Propios', sparkFromSeries(series, 'own')),
    kpiTile(comp.mentionsInWindow, 'Rivales', sparkFromSeries(series, 'comp')),
    kpiTile(`${comparison.ownSharePct}%`, 'Share'),
    kpiTile(`${comp.winRate}%`, 'Win'),
    kpiTile(comp.open, 'Abiertas'),
    kpiTile(comp.won, 'Ganados'),
    kpiTile(own.escalationsWindow, 'Escalados'),
    kpiTile(own.avgRiskScore || '—', 'Riesgo'),
  ].join('');

  if (els.statsCompareSummary) {
    els.statsCompareSummary.textContent = `${companyName} ${comparison.ownSharePct}%`;
  }

  renderDonutShare(els.chartCompare, comparison.ownInWindow, comparison.compInWindow, companyName);
  renderTrendChart(els.chartTrend, series);
  renderStackedBars(els.chartStack, series);
  renderFunnel(els.chartFunnel, pipeline);
  renderRiskBars(els.chartRisk, own.riskCounts);
  renderRiskBars(els.chartSeverity, comp.severityCounts || {});
  renderHBars(els.chartRivals, topEntries(comp.byCompetitor, 5), 'Sin rivales', {
    clickableRival: true,
  });
  els.chartRivals?.querySelectorAll('[data-rival-name]').forEach((node) => {
    node.style.cursor = 'pointer';
    node.title = 'Ver ficha de percepción';
    node.addEventListener('click', () => {
      const name = node.getAttribute('data-rival-name');
      if (name) void openRivalFicha(name);
    });
  });
  renderHBars(els.chartChannels, mergeChannelMaps(own.byChannel, comp.byChannel), 'Sin canales');
  renderHBars(els.chartTones, topEntries(own.byTone, 5), 'Sin tonos');
  renderHBars(
    els.chartActions,
    topEntries(own.byAction, 5).map((e) => ({
      name: ACTION_LABELS[e.name] || e.name.replace(/^ESCALATE_/, '').slice(0, 14),
      count: e.count,
    })),
    'Sin acciones',
  );
}

function kpiTile(value, label, sparkSvg = '') {
  return `<div class="rl-kpi rl-kpi--compact">${
    sparkSvg ? `<div class="rl-kpi__spark" aria-hidden="true">${sparkSvg}</div>` : ''
  }<span>${escapeHtml(String(value))}</span><small>${escapeHtml(label)}</small></div>`;
}

function sparkFromSeries(series, key) {
  if (!series?.length) return '';
  const vals = series.map((d) => Number(d[key]) || 0);
  const max = Math.max(1, ...vals);
  const w = 48;
  const h = 16;
  const pts = vals
    .map((v, i) => {
      const x = vals.length <= 1 ? w / 2 : (i / (vals.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = key === 'own' ? 'var(--rl-accent)' : '#c2410c';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline fill="none" stroke="${stroke}" stroke-width="1.5" points="${pts}" /></svg>`;
}

function mergeChannelMaps(ownMap, compMap) {
  /** @type {Record<string, number>} */
  const all = {};
  for (const [k, v] of Object.entries(ownMap || {})) all[k] = (all[k] || 0) + v;
  for (const [k, v] of Object.entries(compMap || {})) all[k] = (all[k] || 0) + v;
  return topEntries(all, 6);
}

function renderDonutShare(el, ownN, compN, ownLabel) {
  if (!el) return;
  const total = Math.max(ownN + compN, 1);
  const ownPct = ownN / total;
  const r = 34;
  const c = 2 * Math.PI * r;
  const ownLen = ownPct * c;
  el.innerHTML = `
    <div class="rl-donut-wrap">
      <svg viewBox="0 0 100 100" width="80" height="80" aria-hidden="true">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="#c2410c" stroke-width="11" />
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--rl-accent)" stroke-width="11"
          stroke-dasharray="${ownLen.toFixed(2)} ${(c - ownLen).toFixed(2)}"
          transform="rotate(-90 50 50)" />
        <text x="50" y="48" text-anchor="middle" class="rl-donut-value">${Math.round(ownPct * 100)}%</text>
        <text x="50" y="60" text-anchor="middle" class="rl-donut-sub">propios</text>
      </svg>
      <div class="rl-donut-legend">
        <div><i class="rl-swatch rl-swatch--own"></i> ${escapeHtml(ownLabel)} <strong>${ownN}</strong></div>
        <div><i class="rl-swatch rl-swatch--comp"></i> Rivales <strong>${compN}</strong></div>
      </div>
    </div>
  `;
}

function renderCompareBars(el, ownN, compN, ownLabel) {
  renderDonutShare(el, ownN, compN, ownLabel);
}

function renderTrendChart(el, series) {
  if (!el) return;
  if (!series?.length) {
    el.innerHTML = '<p class="rl-empty rl-empty--sm">Sin actividad.</p>';
    return;
  }
  const w = 320;
  const h = 100;
  const padL = 22;
  const padR = 6;
  const padT = 8;
  const padB = 20;
  const maxY = Math.max(1, ...series.map((d) => Math.max(d.own, d.comp)));
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = series.length;
  const xAt = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => padT + innerH - (v / maxY) * innerH;

  const ownPts = series.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.own).toFixed(1)}`).join(' ');
  const compPts = series.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.comp).toFixed(1)}`).join(' ');

  const grid = [0, 1]
    .map((p) => {
      const y = padT + innerH * (1 - p);
      return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="rl-chart-grid" />`;
    })
    .join('');

  const labels = series
    .filter((_, i) => i === 0 || i === n - 1 || i === Math.floor(n / 2))
    .map((d) => {
      const i = series.indexOf(d);
      return `<text x="${xAt(i)}" y="${h - 4}" text-anchor="middle" class="rl-chart-label">${escapeHtml(d.label)}</text>`;
    })
    .join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <text x="2" y="${padT + 8}" class="rl-chart-label">${maxY}</text>
      <polyline fill="none" stroke="var(--rl-accent)" stroke-width="2" points="${ownPts}" />
      <polyline fill="none" stroke="#c2410c" stroke-width="2" stroke-dasharray="4 3" points="${compPts}" />
      ${labels}
    </svg>
  `;
}

function renderStackedBars(el, series) {
  if (!el) return;
  if (!series?.length) {
    el.innerHTML = '<p class="rl-empty rl-empty--sm">Sin actividad.</p>';
    return;
  }
  const sample = series.length > 14 ? series.filter((_, i) => i % 2 === 0 || i === series.length - 1) : series;
  const max = Math.max(1, ...sample.map((d) => d.own + d.comp));
  const w = 320;
  const h = 100;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 20;
  const gap = 2;
  const barW = Math.max(3, (w - padL - padR - gap * (sample.length - 1)) / sample.length);
  const bars = sample
    .map((d, i) => {
      const x = padL + i * (barW + gap);
      const ownH = (d.own / max) * (h - padT - padB);
      const compH = (d.comp / max) * (h - padT - padB);
      const yComp = h - padB - compH;
      const yOwn = yComp - ownH;
      return `
        <rect x="${x.toFixed(1)}" y="${yOwn.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(ownH, 0).toFixed(1)}" fill="var(--rl-accent)" rx="1" />
        <rect x="${x.toFixed(1)}" y="${yComp.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(compH, 0).toFixed(1)}" fill="#c2410c" rx="1" />
      `;
    })
    .join('');
  const labelIdx = [0, Math.floor(sample.length / 2), sample.length - 1];
  const labels = labelIdx
    .filter((i, idx, arr) => arr.indexOf(i) === idx && sample[i])
    .map((i) => {
      const x = padL + i * (barW + gap) + barW / 2;
      return `<text x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle" class="rl-chart-label">${escapeHtml(sample[i].label)}</text>`;
    })
    .join('');
  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${bars}
      ${labels}
    </svg>
  `;
}

function renderFunnel(el, pipeline) {
  if (!el) return;
  const steps = [
    { key: 'open', label: 'Abiertas', value: pipeline.open, tone: 'warn' },
    { key: 'contacted', label: 'Contact.', value: pipeline.contacted, tone: 'own' },
    { key: 'won', label: 'Ganadas', value: pipeline.won, tone: 'ok' },
    { key: 'dismissed', label: 'Descart.', value: pipeline.dismissed, tone: 'muted' },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  el.innerHTML = `<div class="rl-funnel rl-funnel--dense">${steps
    .map(
      (s) => `
      <div class="rl-funnel__row">
        <span class="rl-funnel__label">${escapeHtml(s.label)}</span>
        <div class="rl-funnel__track">
          <div class="rl-funnel__bar rl-funnel__bar--${s.tone}" style="width:${Math.round((s.value / max) * 100)}%"></div>
        </div>
        <strong class="rl-funnel__n">${s.value}</strong>
      </div>`,
    )
    .join('')}</div>`;
}

function renderRiskBars(el, riskCounts) {
  if (!el) return;
  const order = [
    { key: 'CRITICAL', label: 'Crít.', tone: 'danger' },
    { key: 'HIGH', label: 'Alto', tone: 'warn' },
    { key: 'MEDIUM', label: 'Med.', tone: 'own' },
    { key: 'LOW', label: 'Bajo', tone: 'ok' },
  ];
  const total = order.reduce((s, o) => s + (riskCounts[o.key] || 0), 0);
  if (!total) {
    el.innerHTML = '<p class="rl-empty rl-empty--sm">Sin datos.</p>';
    return;
  }
  el.innerHTML = `<div class="rl-funnel rl-funnel--dense">${order
    .map((o) => {
      const v = riskCounts[o.key] || 0;
      const pct = Math.round((v / total) * 100);
      return `
      <div class="rl-funnel__row">
        <span class="rl-funnel__label">${escapeHtml(o.label)}</span>
        <div class="rl-funnel__track">
          <div class="rl-funnel__bar rl-funnel__bar--${o.tone}" style="width:${pct}%"></div>
        </div>
        <strong class="rl-funnel__n">${v}</strong>
      </div>`;
    })
    .join('')}</div>`;
}

function renderHBars(el, entries, emptyMsg, opts = {}) {
  if (!el) return;
  if (!entries?.length) {
    el.innerHTML = `<p class="rl-empty rl-empty--sm">${escapeHtml(emptyMsg)}</p>`;
    return;
  }
  const max = Math.max(1, ...entries.map((e) => e.count));
  const clickable = Boolean(opts.clickableRival);
  el.innerHTML = `<div class="rl-funnel rl-funnel--dense">${entries
    .map(
      (e) => `
      <div class="rl-funnel__row"${clickable ? ` data-rival-name="${escapeHtml(e.name)}" role="button" tabindex="0"` : ''}>
        <span class="rl-funnel__label" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
        <div class="rl-funnel__track">
          <div class="rl-funnel__bar rl-funnel__bar--comp" style="width:${Math.round((e.count / max) * 100)}%"></div>
        </div>
        <strong class="rl-funnel__n">${e.count}</strong>
      </div>`,
    )
    .join('')}</div>`;
}

els.statsRange?.addEventListener('change', () => {
  void renderStats();
});

function renderTriage(triage) {
  if (!triage) {
    els.triage.hidden = true;
    els.triage.innerHTML = '';
    return;
  }
  const flags = (triage.escalationFlags || [])
    .map((f) => `<span class="rl-chip">${escapeHtml(f)}</span>`)
    .join('');
  const issues = (triage.keyIssues || [])
    .map((i) => `<span class="rl-chip rl-chip--muted">${escapeHtml(i)}</span>`)
    .join('');

  els.triage.hidden = false;
  els.triage.innerHTML = `
    <div class="rl-triage__row">
      <span class="rl-badge rl-badge--${escapeHtml(String(triage.riskLevel || 'LOW').toLowerCase())}">
        Riesgo ${escapeHtml(triage.riskLevel)} · ${escapeHtml(String(triage.riskScore))}
      </span>
      <strong>${escapeHtml(ACTION_LABELS[triage.recommendedAction] || triage.recommendedAction)}</strong>
    </div>
    <p>${escapeHtml(triage.summary || '')}</p>
    <div class="rl-chips">${flags}${issues}</div>
  `;
}

function renderComplaint(payload) {
  els.complaint.textContent = payload.text;
  els.complaint.title = payload.sourceUrl || '';
}

function ensureRecommendedOptions(result) {
  const options = Array.isArray(result?.options) ? [...result.options] : [];
  if (!options.length) return result;
  if (options.some((o) => o.recommended)) {
    let seen = false;
    return {
      ...result,
      options: options.map((o) => {
        if (o.recommended && !seen) {
          seen = true;
          return { ...o, recommended: true };
        }
        return { ...o, recommended: false };
      }),
    };
  }

  const action = result.triage?.recommendedAction || '';
  let tone = 'EMPATHETIC';
  if (action.startsWith('ESCALATE') || action === 'PRIVATE_DM' || action === 'NO_ENGAGE') {
    tone = 'FORMAL_CORPORATE';
  } else if (/\b(bug|error|falla|ca[ií]da|outage|api|timeout)\b/i.test(result.originalText || '')) {
    tone = 'RESOLUTIVE_TECHNICAL';
  }

  return {
    ...result,
    options: options.map((o) => ({
      ...o,
      recommended: o.tone === tone,
      rationale:
        o.tone === tone && !o.rationale
          ? 'Opción recomendada según el triage de este caso.'
          : o.rationale,
    })),
  };
}

function renderCards(result) {
  const normalized = ensureRecommendedOptions(result);
  const options = [...(normalized.options || [])].sort(
    (a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)),
  );
  const complaintId = normalized.complaintId;
  const blockPublic =
    normalized.triage?.recommendedAction === 'ESCALATE_LEGAL' ||
    normalized.triage?.recommendedAction === 'ESCALATE_SAFETY' ||
    normalized.triage?.recommendedAction === 'NO_ENGAGE';

  els.cards.innerHTML = '';
  if (blockPublic) {
    const warn = document.createElement('div');
    warn.className = 'rl-warn';
    warn.textContent =
      'Triage recomienda no publicar aún (escalado / no interactuar). Puedes copiar para uso interno o DM.';
    els.cards.appendChild(warn);
  }

  for (const opt of options) {
    const card = document.createElement('article');
    card.className = `rl-card${opt.recommended ? ' is-recommended' : ''}`;
    card.innerHTML = `
      <div class="rl-card__head">
        <h3>${escapeHtml(opt.label)}</h3>
        ${opt.recommended ? '<span class="rl-rec-badge">Recomendada</span>' : ''}
      </div>
      ${opt.rationale ? `<p class="rl-rationale">${escapeHtml(opt.rationale)}</p>` : ''}
      <p>${escapeHtml(opt.body)}</p>
    `;
    const actions = document.createElement('div');
    actions.className = 'rl-card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'rl-btn rl-btn--ghost';
    copyBtn.textContent = 'Copiar';
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(opt.body);
      copyBtn.textContent = 'Copiado';
      setTimeout(() => {
        copyBtn.textContent = 'Copiar';
      }, 1200);
    });

    const injectBtn = document.createElement('button');
    injectBtn.type = 'button';
    injectBtn.className = `rl-btn ${opt.recommended ? 'rl-btn--primary' : 'rl-btn--ghost'}`;
    injectBtn.textContent = blockPublic ? 'Inyectar igual' : opt.recommended ? 'Usar recomendada' : 'Inyectar';
    injectBtn.addEventListener('click', async () => {
      injectBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'RL_INJECT_REPLY',
          text: opt.body,
          complaintId,
        });
        await appendHistory({
          kind: 'propios',
          at: new Date().toISOString(),
          tone: opt.tone,
          label: opt.recommended ? `${opt.label} (recomendada)` : opt.label,
          body: opt.body,
          channel: normalized.channel || currentComplaint?.channel,
          sourceUrl: normalized.sourceUrl || currentComplaint?.sourceUrl,
          originalText: normalized.originalText || currentComplaint?.text,
          recommendedAction: normalized.triage?.recommendedAction,
          riskLevel: normalized.triage?.riskLevel,
          injectResult: res?.reason || (res?.ok ? 'ok' : 'unknown'),
          model: normalized.model,
          recommended: Boolean(opt.recommended),
        });
        await refreshKpis();
      } finally {
        injectBtn.disabled = false;
      }
    });

    actions.append(copyBtn, injectBtn);
    card.appendChild(actions);
    els.cards.appendChild(card);
  }
}

async function appendHistory(entry) {
  const data = await storageGet([STORAGE.history]);
  const list = Array.isArray(data[STORAGE.history]) ? data[STORAGE.history] : [];
  list.unshift(entry);
  await storageSet({ [STORAGE.history]: list.slice(0, 200) });
  if (!els.panels.hist.hidden) renderHistory();
}

/** @type {string | null} */
let expandedHistoryId = null;

function historyItemId(item, idx) {
  return item.id || item.alertId || item.at || `hist_${idx}`;
}

async function renderHistory() {
  if (!els.histList) return;
  const data = await storageGet([STORAGE.history]);
  const list = data[STORAGE.history] || [];
  els.histList.innerHTML = '';
  if (!list.length) {
    els.histList.innerHTML =
      '<div class="rl-empty">Aún no hay actividad. Las inyecciones de Propios y los cambios de Competencia (Contactado / Ganado / Descartar) aparecen acá.</div>';
    return;
  }

  if (
    expandedHistoryId &&
    !list.some((item, idx) => historyItemId(item, idx) === expandedHistoryId)
  ) {
    expandedHistoryId = null;
  }

  list.forEach((item, idx) => {
    const id = historyItemId(item, idx);
    const isCap = item.kind === 'captacion';
    const isOpen = expandedHistoryId === id;
    const title = isCap
      ? `${item.label || 'Captación'} · ${item.competitorName || ''}`
      : item.label || item.tone || 'Respuesta';
    const badge = isCap ? item.status || '—' : item.riskLevel || '—';
    const kindLabel = isCap ? 'competencia' : 'propios';
    const fullBody = item.body || item.originalText || '';
    const snippet = truncateText(fullBody, 100);
    const metaLine = [
      (item.at || '').replace('T', ' ').slice(0, 16),
      item.channel || kindLabel,
      isCap ? null : ACTION_LABELS[item.recommendedAction] || item.recommendedAction || null,
    ]
      .filter(Boolean)
      .join(' · ');

    const node = document.createElement('article');
    node.className = `rl-alert rl-alert--accordion${isOpen ? ' is-expanded' : ''}`;
    node.dataset.histId = id;

    node.innerHTML = `
      <button type="button" class="rl-alert__summary rl-alert__summary--hist" data-hist-toggle aria-expanded="${
        isOpen ? 'true' : 'false'
      }">
        <span class="rl-hist-kind rl-hist-kind--${isCap ? 'cap' : 'own'}" aria-hidden="true">${
          isCap ? 'C' : 'P'
        }</span>
        <span class="rl-alert__summary-text">
          <span class="rl-alert__title-row">
            <strong>${escapeHtml(title)}</strong>
            <span class="rl-badge">${escapeHtml(badge)}</span>
          </span>
          <span class="rl-alert__snippet">${escapeHtml(snippet || 'Sin detalle')}</span>
          <span class="rl-alert__meta">${escapeHtml(metaLine)}</span>
        </span>
        <span class="rl-alert__chevron" data-chevron aria-hidden="true">${isOpen ? '▾' : '▸'}</span>
      </button>
      <div class="rl-alert__body" data-hist-body ${isOpen ? '' : 'hidden'}>
        ${
          item.originalText && item.body && item.originalText !== item.body
            ? `<p class="rl-muted rl-alert__section-label">Original</p>
               <p class="rl-alert__complaint">${escapeHtml(item.originalText)}</p>`
            : ''
        }
        <p class="rl-muted rl-alert__section-label">${isCap ? 'Pitch / acción' : 'Respuesta'}</p>
        <p class="rl-alert__complaint">${escapeHtml(fullBody || '—')}</p>
        <p class="rl-muted rl-alert__links">
          ${escapeHtml(item.at || '')}
          ${item.channel ? ` · ${escapeHtml(item.channel)}` : ''}
          ${
            isCap
              ? item.sourceUrl
                ? ` · <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">Fuente</a>`
                : ''
              : ` · ${escapeHtml(ACTION_LABELS[item.recommendedAction] || item.recommendedAction || '')}`
          }
          ${item.model ? ` · ${escapeHtml(item.model)}` : ''}
        </p>
      </div>
    `;

    const toggle = node.querySelector('[data-hist-toggle]');
    toggle?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const willOpen = !node.classList.contains('is-expanded');
      els.histList.querySelectorAll('.rl-alert.is-expanded').forEach((el) => {
        if (el === node) return;
        el.classList.remove('is-expanded');
        const body = el.querySelector('[data-hist-body]');
        if (body) body.hidden = true;
        el.querySelector('[data-hist-toggle]')?.setAttribute('aria-expanded', 'false');
        const chev = el.querySelector('[data-chevron]');
        if (chev) chev.textContent = '▸';
      });
      expandedHistoryId = willOpen ? id : null;
      node.classList.toggle('is-expanded', willOpen);
      const body = node.querySelector('[data-hist-body]');
      if (body) body.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      const chev = toggle.querySelector('[data-chevron]');
      if (chev) chev.textContent = willOpen ? '▾' : '▸';
      if (willOpen) {
        requestAnimationFrame(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    });

    els.histList.appendChild(node);
  });
}

async function analyzeComplaint(payload) {
  currentComplaint = payload;
  activateTab('own');
  setOwnState({ loading: true, hasComplaint: true });
  renderComplaint(payload);

  const {
    [STORAGE.config]: config,
    [STORAGE.appsync]: appsync,
    [STORAGE.detection]: detection,
  } = await storageGet([STORAGE.config, STORAGE.appsync, STORAGE.detection]);

  const allowOffline = detection?.offlineFallback !== false;

  try {
    let result;
    if (!appsync?.graphqlUrl || !appsync?.apiKey) {
      if (!allowOffline) throw new Error('Configura AppSync en Config.');
      result = buildLocalReplyOptions({
        text: payload.text,
        companyName: config?.company?.companyName,
      });
      result.complaintId = payload.id || payload.complaintId || null;
      result.channel = payload.channel;
      result.sourceUrl = payload.sourceUrl;
    } else {
      try {
        const data = await gqlRequest({
          url: appsync.graphqlUrl,
          apiKey: appsync.apiKey,
          query: ANALYZE_MUTATION,
          variables: {
            input: {
              userId: config?.userId || 'local-user',
              text: payload.text,
              channel: payload.channel,
              sourceUrl: payload.sourceUrl,
              complaintId: payload.id || payload.complaintId,
              companyName: config?.company?.companyName,
              whatTheySell: config?.company?.whatTheySell,
              brandVoiceNotes: config?.company?.brandVoiceNotes,
            },
          },
        });
        result = data.analyzeReply;
      } catch (cloudErr) {
        if (!allowOffline) throw cloudErr;
        result = buildLocalReplyOptions({
          text: payload.text,
          companyName: config?.company?.companyName,
        });
        result.complaintId = payload.id || payload.complaintId || null;
        result.channel = payload.channel;
        result.sourceUrl = payload.sourceUrl;
        result._offline = true;
        result.triage.summary = `Fallback offline (${cloudErr instanceof Error ? cloudErr.message : 'error cloud'}). ${result.triage.summary}`;
      }
    }

    currentResult = result;
    setOwnState({ loading: false, hasComplaint: true });
    renderTriage(result.triage);
    renderCards(result);
  } catch (err) {
    setOwnState({ loading: false, hasComplaint: true });
    els.triage.hidden = true;
    els.cards.hidden = false;
    els.cards.innerHTML = `<p class="rl-status is-error">${escapeHtml(
      err instanceof Error ? err.message : String(err),
    )}</p>`;
  }
}

function matchesAlertFilter(alert, filter) {
  const status = alert.status || 'NEW';
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return status === 'NEW' || status === 'SNOOZED';
  return status === filter;
}

function alertDetectedTs(alert) {
  const t = Date.parse(alert.detectedAt || alert.createdAt || alert.at || '');
  return Number.isFinite(t) ? t : null;
}

function alertPlatformKey(alert) {
  if (alert._source === 'hackernews') return 'hackernews';
  if (alert._source === 'reddit') return 'reddit';
  if (alert._source === 'news') return 'news';
  if (alert._source === 'page') return 'page';
  if (alert._demo) return 'manual';
  if (alert._synthetic) return 'manual';
  const ch = String(alert.channel || '').toLowerCase();
  const url = String(alert.sourceUrl || '').toLowerCase();
  if (ch === 'manual' || url.startsWith('manual://')) return 'manual';
  if (ch.includes('reddit') || url.includes('reddit.com')) return 'reddit';
  if (ch === 'news' || url.includes('news.google') || url.includes('/rss/')) return 'news';
  if (ch.includes('hn') || url.includes('ycombinator') || url.includes('hn.algolia')) return 'hackernews';
  if (ch.includes('amazon') || url.includes('amazon.')) return 'amazon';
  if (ch.includes('ebay') || url.includes('ebay.')) return 'ebay';
  if (ch.includes('youtube') || url.includes('youtube.') || url.includes('youtu.be')) return 'youtube';
  if (ch === 'x' || ch.includes('twitter') || url.includes('x.com') || url.includes('twitter.com')) return 'x';
  if (ch.includes('facebook') || url.includes('facebook.') || url.includes('fb.com')) return 'facebook';
  if (ch.includes('instagram') || url.includes('instagram.')) return 'instagram';
  if (ch.includes('tiktok') || url.includes('tiktok.')) return 'tiktok';
  if (ch.includes('threads') || url.includes('threads.')) return 'threads';
  if (ch.includes('linkedin') || url.includes('linkedin.')) return 'linkedin';
  if (ch.includes('bluesky') || ch.includes('bsky') || url.includes('bsky.app')) return 'bluesky';
  if (ch.includes('glassdoor') || url.includes('glassdoor.')) return 'glassdoor';
  if (ch === 'g2' || url.includes('g2.com')) return 'g2';
  if (ch.includes('capterra') || url.includes('capterra.')) return 'capterra';
  if (ch.includes('producthunt') || url.includes('producthunt.')) return 'producthunt';
  if (ch.includes('indeed') || url.includes('indeed.')) return 'indeed';
  if (url) return 'page';
  return 'manual';
}

function getCompFilterState() {
  return {
    status: els.alertFilter?.value || 'OPEN',
    days: els.alertFilterDate?.value || 'all',
    platform: els.alertFilterPlatform?.value || 'all',
    rival: els.alertFilterRival?.value || 'all',
    severity: els.alertFilterSeverity?.value || 'all',
    q: (els.alertFilterQ?.value || '').trim().toLowerCase(),
  };
}

function matchesCompFilters(alert, filters) {
  if (!matchesAlertFilter(alert, filters.status)) return false;

  if (filters.days && filters.days !== 'all') {
    const days = Number(filters.days);
    const ts = alertDetectedTs(alert);
    if (ts == null) return false;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    if (filters.days === '1') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (ts < start.getTime()) return false;
    } else if (ts < since) {
      return false;
    }
  }

  if (filters.platform && filters.platform !== 'all') {
    if (alertPlatformKey(alert) !== filters.platform) return false;
  }

  if (filters.rival && filters.rival !== 'all') {
    if (String(alert.competitorName || '').trim() !== filters.rival) return false;
  }

  if (filters.severity && filters.severity !== 'all') {
    const sev = String(alert.severity || 'MEDIUM').toUpperCase();
    if (filters.severity === 'HIGH') {
      if (sev !== 'HIGH' && sev !== 'CRITICAL') return false;
    } else if (sev !== filters.severity) {
      return false;
    }
  }

  if (filters.q) {
    const hay = `${alert.competitorName || ''} ${alert.originalComplaint || ''} ${alert.salesPitch || ''}`.toLowerCase();
    if (!hay.includes(filters.q)) return false;
  }

  return true;
}

function fillRivalFilterOptions(alerts, competitors = []) {
  const sel = els.alertFilterRival;
  if (!sel) return;
  const current = sel.value || 'all';
  const names = new Set();
  for (const c of competitors || []) {
    if (c?.name) names.add(String(c.name).trim());
  }
  for (const a of alerts || []) {
    if (a?.competitorName) names.add(String(a.competitorName).trim());
  }
  const sorted = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  sel.innerHTML =
    `<option value="all">Todos</option>` +
    sorted.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (current && (current === 'all' || sorted.includes(current))) {
    sel.value = current;
  }
}

async function refreshAlerts() {
  await ensureCompetitorsReady();
  await fillRivalSelect();
  await fillFichaRivalSelect();
  const data = await storageGet([STORAGE.alerts, STORAGE.config]);
  const all = Array.isArray(data[STORAGE.alerts]) ? data[STORAGE.alerts] : [];
  fillRivalFilterOptions(all, data[STORAGE.config]?.competitors || []);
  const filters = getCompFilterState();
  const alerts = all.filter((a) => matchesCompFilters(a, filters));
  if (els.filterCount) {
    els.filterCount.textContent =
      alerts.length === all.length
        ? `${alerts.length} oportunidad${alerts.length === 1 ? '' : 'es'}`
        : `${alerts.length} de ${all.length} (filtrado)`;
  }
  const company = data[STORAGE.config]?.company || null;
  renderAlerts(alerts, company);
  await refreshPageRivalBanner();
  await refreshKpis();
}

/** @type {null | { competitorName: string, mentions?: object[] }} */
let pendingIntelRival = null;

async function refreshPageRivalBanner() {
  const data = await storageGet([STORAGE.pageRivals]);
  const page = data[STORAGE.pageRivals];
  if (!els.rivalBanner) return;
  if (!page?.rivals?.length) {
    els.rivalBanner.hidden = true;
    pendingIntelRival = null;
    return;
  }
  const top = [...page.rivals].sort((a, b) => (b.mentions?.length || 0) - (a.mentions?.length || 0))[0];
  pendingIntelRival = {
    competitorName: top.name,
    mentions: top.mentions || [],
  };
  els.rivalBanner.hidden = false;
  if (els.rivalBannerTitle) {
    els.rivalBannerTitle.textContent = `Rival en página: ${top.name}`;
  }
  if (els.rivalBannerSub) {
    const n = page.rivals.reduce((s, r) => s + (r.mentions?.length || 0), 0);
    els.rivalBannerSub.textContent = `${page.rivals.length} rival(es) · ${n} mención(es) · ${page.channel || 'web'}`;
  }
}

function renderRivalReport(report, perception = null) {
  const panel = els.rivalReportPanel;
  if (!panel || !report) return;
  panel.hidden = false;
  const themes = (report.themes || []).map((t) => t.label || t).join(' · ');
  const perc = perception;

  panel.innerHTML = `
    <div class="rl-rival-report__head">
      <h3>Ficha · ${escapeHtml(report.competitorName)}</h3>
      <button type="button" class="rl-btn rl-btn--ghost" data-close-report>Cerrar</button>
    </div>
    ${
      perc
        ? `
    <p class="rl-rival-voice">${escapeHtml(perc.voiceLine)}</p>
    <div class="rl-rival-kpis" aria-label="KPIs del rival">
      ${kpiTile(`${perc.perceptionScore}`, 'Percepción')}
      ${kpiTile(perc.mentionCount, 'Menciones')}
      ${kpiTile(perc.avgFrustration, 'Frustración')}
      ${kpiTile(`${perc.switchIntentPct}%`, 'Churn')}
      ${kpiTile(perc.pipeline.open, 'Abiertas')}
      ${kpiTile(`${perc.pipeline.winRate}%`, 'Win')}
      ${kpiTile(perc.pipeline.won, 'Ganados')}
      ${kpiTile(perc.days + 'd', 'Ventana')}
    </div>
    <div class="rl-rival-charts">
      <article class="rl-chart-card rl-chart-card--dense">
        <header class="rl-chart-card__head"><h3>Cómo lo ven (temas)</h3></header>
        <div data-ficha-themes class="rl-chart rl-chart--sm"></div>
      </article>
      <article class="rl-chart-card rl-chart-card--dense">
        <header class="rl-chart-card__head"><h3>Canales</h3></header>
        <div data-ficha-channels class="rl-chart rl-chart--sm"></div>
      </article>
      <article class="rl-chart-card rl-chart-card--dense">
        <header class="rl-chart-card__head"><h3>Severidad</h3></header>
        <div data-ficha-severity class="rl-chart rl-chart--sm"></div>
      </article>
      <article class="rl-chart-card rl-chart-card--dense">
        <header class="rl-chart-card__head"><h3>Tendencia</h3></header>
        <div data-ficha-trend class="rl-chart rl-chart--sm"></div>
      </article>
    </div>
    ${
      perc.sampleQuotes?.length
        ? `<p class="rl-muted rl-alert__section-label">Cómo hablan los usuarios</p>
    <ul class="rl-rival-quotes">${perc.sampleQuotes
      .map(
        (q) => `<li>“${escapeHtml(q.text)}”<span class="rl-muted">${escapeHtml(q.channel)}${
          q.sourceUrl ? ` · ${escapeHtml(q.sourceUrl.slice(0, 48))}` : ''
        }</span></li>`,
      )
      .join('')}</ul>`
        : ''
    }`
        : ''
    }
    <p class="rl-rival-report__meta">
      ${escapeHtml(report.riskLevel || '')} · frustración ${escapeHtml(String(report.avgFrustration ?? '—'))}
      · ${escapeHtml(String(report.mentionCount ?? 0))} menciones · ${escapeHtml(report.model || '')}
      ${themes ? ` · ${escapeHtml(themes)}` : ''}
    </p>
    <p class="rl-muted rl-alert__section-label">Conclusiones IA</p>
    <ul>${(report.conclusions || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    <p class="rl-muted rl-alert__section-label">Ángulos de captación</p>
    <ul>${(report.opportunities || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    <details class="rl-disclosure">
      <summary>Informe markdown</summary>
      <pre class="rl-rival-report__md">${escapeHtml(report.reportMarkdown || '')}</pre>
    </details>
    <div class="rl-rival-report__actions">
      <button type="button" class="rl-btn rl-btn--primary" data-copy-report>Copiar informe</button>
      <button type="button" class="rl-btn rl-btn--ghost" data-share-ficha>Compartir ficha</button>
      <button type="button" class="rl-btn rl-btn--ghost" data-goto-stats>Ver en Stats</button>
    </div>
  `;

  if (perc) {
    renderHBars(panel.querySelector('[data-ficha-themes]'), perc.topThemes, 'Sin temas');
    renderHBars(panel.querySelector('[data-ficha-channels]'), perc.topChannels, 'Sin canales');
    renderRiskBars(panel.querySelector('[data-ficha-severity]'), perc.bySeverity);
    renderRivalTrend(panel.querySelector('[data-ficha-trend]'), perc.series);
  }

  panel.querySelector('[data-close-report]')?.addEventListener('click', () => {
    panel.hidden = true;
  });
  panel.querySelector('[data-copy-report]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    await navigator.clipboard.writeText(report.reportMarkdown || '');
    if (btn) {
      btn.textContent = '✓ Copiado';
      setTimeout(() => {
        btn.textContent = 'Copiar informe';
      }, 1200);
    }
  });
  panel.querySelector('[data-share-ficha]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (btn) btn.disabled = true;
    try {
      await shareWithDestinationPrompt({
        kind: 'rival_ficha',
        title: `Ficha · ${report.competitorName}`,
        summary: perc?.voiceLine || report.conclusions?.[0] || '',
        data: {
          competitorName: report.competitorName,
          voiceLine: perc?.voiceLine,
          perceptionScore: perc?.perceptionScore,
          avgFrustration: perc?.avgFrustration ?? report.avgFrustration,
          switchIntentPct: perc?.switchIntentPct,
          conclusions: report.conclusions,
          opportunities: report.opportunities,
          reportMarkdown: report.reportMarkdown,
          themes: report.themes,
        },
      });
    } finally {
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Compartir ficha';
        }
      }, 400);
    }
  });
  panel.querySelector('[data-goto-stats]')?.addEventListener('click', () => {
    activateTab('stats');
    void renderStats();
  });
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderRivalTrend(el, series) {
  if (!el) return;
  if (!series?.length) {
    el.innerHTML = '<p class="rl-empty rl-empty--sm">Sin serie.</p>';
    return;
  }
  const mapped = series.map((d) => ({
    label: d.label,
    own: 0,
    comp: d.count || 0,
  }));
  renderTrendChart(el, mapped);
}

async function gatherMentionsForRival(competitorName, extraMentions = []) {
  const data = await storageGet([STORAGE.alerts, STORAGE.pageRivals]);
  const alerts = (data[STORAGE.alerts] || []).filter(
    (a) => String(a.competitorName || '').trim() === competitorName,
  );
  const pageRival = (data[STORAGE.pageRivals]?.rivals || []).find(
    (r) => r.name === competitorName,
  );
  const mentions = [
    ...extraMentions,
    ...(pageRival?.mentions || []),
    ...alerts.map((a) => ({
      text: a.originalComplaint,
      sourceUrl: a.sourceUrl,
      channel: a.channel,
    })),
  ];
  // dedupe by text prefix
  const seen = new Set();
  const unique = [];
  for (const m of mentions) {
    const key = String(m.text || '')
      .slice(0, 80)
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }
  return unique;
}

async function generateRivalReport(competitorName, extraMentions = []) {
  const name = String(competitorName || '').trim();
  if (!name) return null;
  activateTab('comp');
  if (els.rivalReportPanel) {
    els.rivalReportPanel.hidden = false;
    els.rivalReportPanel.innerHTML = `<p class="rl-muted">Analizando a ${escapeHtml(name)} en menciones públicas…</p>`;
  }

  const {
    [STORAGE.config]: cfg,
    [STORAGE.appsync]: appsync,
    [STORAGE.detection]: detection,
  } = await storageGet([STORAGE.config, STORAGE.appsync, STORAGE.detection]);

  let mentions = await gatherMentionsForRival(name, extraMentions);

  // Enriquecer con escaneo rápido HN/Reddit de ese rival
  try {
    const scan = await runCompetitorScan({
      company: cfg?.company,
      userId: cfg?.userId || 'local-user',
      competitors: [{ name, aliases: lookupCompetitorProfile(name, cfg?.competitors)?.aliases || [] }],
      pageMentions: [],
      preferSyntheticFallback: false,
      sources: { hackernews: true, reddit_api: true, news_portals: true, active_page: false },
      credentials: await loadScanCredentials(),
    });
    for (const opp of scan.opportunities || []) {
      if (opp._synthetic) continue;
      mentions.push({
        text: opp.originalComplaint,
        sourceUrl: opp.sourceUrl,
        channel: opp.channel || opp._source,
      });
    }
  } catch (err) {
    console.warn('[RL] rival scan enrich', err);
  }

  // dedupe again
  mentions = await gatherMentionsForRival(name, mentions);
  if (!mentions.length) {
    mentions = [{ text: `Public dissatisfaction mentions about ${name}`, sourceUrl: '', channel: 'manual' }];
  }

  const allowOffline = detection?.offlineFallback !== false;
  let report = null;

  if (appsync?.graphqlUrl && appsync?.apiKey) {
    try {
      const data = await gqlRequest({
        url: appsync.graphqlUrl,
        apiKey: appsync.apiKey,
        query: ANALYZE_RIVAL_MUTATION,
        variables: {
          input: {
            userId: cfg?.userId || 'local-user',
            competitorName: name,
            mentions: mentions.map((m) => m.text).slice(0, 10),
            channel: mentions[0]?.channel || 'web',
            sourceUrl: mentions[0]?.sourceUrl || '',
            companyName: cfg?.company?.companyName,
            whatTheySell: cfg?.company?.whatTheySell,
            brandVoiceNotes: cfg?.company?.brandVoiceNotes,
          },
        },
      });
      report = normalizeRivalReport(data.analyzeRivalReport, name);
    } catch (err) {
      console.warn('[RL] analyzeRivalReport cloud failed', err);
      if (!allowOffline) throw err;
    }
  }

  if (!report) {
    report = buildLocalRivalReport({
      competitorName: name,
      mentions,
      companyName: cfg?.company?.companyName,
      whatTheySell: cfg?.company?.whatTheySell,
      competitors: cfg?.competitors || [],
    });
  }

  const alertsData = await storageGet([STORAGE.alerts]);
  const perception = computeRivalPerception({
    competitorName: name,
    mentions,
    alerts: alertsData[STORAGE.alerts] || [],
    days: statsRangeDays(),
  });

  const stored = await storageGet([STORAGE.rivalReports]);
  const map = stored[STORAGE.rivalReports] && typeof stored[STORAGE.rivalReports] === 'object'
    ? stored[STORAGE.rivalReports]
    : {};
  map[name] = { ...report, perception };
  await storageSet({ [STORAGE.rivalReports]: map });
  await storageSet({ [STORAGE.pendingRivalReport]: null });

  if (els.fichaRivalSelect) els.fichaRivalSelect.value = name;
  renderRivalReport(report, perception);
  return report;
}

async function fillFichaRivalSelect() {
  const sel = els.fichaRivalSelect;
  if (!sel) return;
  const data = await storageGet([STORAGE.config, STORAGE.alerts, STORAGE.pageRivals]);
  const names = new Set();
  for (const c of data[STORAGE.config]?.competitors || []) {
    if (c?.name) names.add(String(c.name).trim());
  }
  for (const a of data[STORAGE.alerts] || []) {
    if (a?.competitorName) names.add(String(a.competitorName).trim());
  }
  for (const r of data[STORAGE.pageRivals]?.rivals || []) {
    if (r?.name) names.add(String(r.name).trim());
  }
  if (!names.size) {
    for (const n of ['Shopify', 'AWS', 'Mailchimp']) names.add(n);
  }
  const prev = sel.value;
  sel.innerHTML = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
    .join('');
  if (prev && names.has(prev)) sel.value = prev;
}

async function openRivalFicha(competitorName) {
  const name = String(competitorName || els.fichaRivalSelect?.value || '').trim();
  if (!name) return;
  activateTab('comp');
  if (els.fichaRivalSelect) els.fichaRivalSelect.value = name;
  await generateRivalReport(name);
}

els.btnOpenRivalFicha?.addEventListener('click', () => {
  void openRivalFicha(els.fichaRivalSelect?.value);
});

async function consumePendingRivalReport() {
  const data = await storageGet([STORAGE.pendingRivalReport]);
  const pending = data[STORAGE.pendingRivalReport];
  if (!pending?.competitorName) return;
  await generateRivalReport(pending.competitorName, pending.mentions || []);
}


/** Asegura perfil/rivales; no auto-inyecta demos (evita confusión). */
async function ensureCompetitorsReady() {
  const data = await storageGet([STORAGE.alerts, STORAGE.config]);
  let cfg = data[STORAGE.config] || {};
  if (!cfg.competitors?.length) {
    cfg = {
      ...cfg,
      userId: cfg.userId || 'local-user',
      company: cfg.company || {
        companyName: 'TuMarca',
        whatTheySell: 'software B2B con soporte humano',
      },
      competitors: defaultCompetitorSeed(),
    };
    await storageSet({ [STORAGE.config]: cfg });
    await fillRivalSelect();
  }
  const list = data[STORAGE.alerts];
  if (Array.isArray(list) && list.length > 0) {
    const enriched = list.map((a) =>
      a.competitor
        ? a
        : {
            ...a,
            competitor: lookupCompetitorProfile(a.competitorName, cfg.competitors),
          },
    );
    if (JSON.stringify(enriched) !== JSON.stringify(list)) {
      await storageSet({ [STORAGE.alerts]: enriched });
    }
  }
}

async function collectPageMentions() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return [];
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RL_LIST_CAPTURE_CANDIDATES' });
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

async function scanCompetitorMarket() {
  if (!els.scanComp) return;
  els.scanComp.disabled = true;
  if (els.scanStatus) {
    els.scanStatus.classList.remove('is-error');
    els.scanStatus.textContent = 'Escaneando fuentes profesionales (HN · Reddit · News · página)…';
  }

  try {
    await ensureCompetitorsReady();
    const { [STORAGE.config]: cfg } = await storageGet([STORAGE.config]);
    const competitors = cfg?.competitors?.length
      ? cfg.competitors
      : defaultCompetitorSeed();
    const pageMentions = await collectPageMentions();
    const detectionData = await storageGet([STORAGE.detection]);
    const platformPrefs = normalizePlatformPrefs(detectionData[STORAGE.detection]?.platforms);
    const { opportunities, stats, errors, scannedNames } = await runCompetitorScan({
      company: cfg?.company,
      userId: cfg?.userId || 'local-user',
      competitors,
      pageMentions,
      preferSyntheticFallback: false,
      sources: platformPrefs.scanSources,
      credentials: await loadScanCredentials(),
    });

    const data = await storageGet([STORAGE.alerts]);
    const existing = Array.isArray(data[STORAGE.alerts]) ? data[STORAGE.alerts] : [];
    const kept = existing.filter((a) => !a._synthetic && !a._demo && a._source !== 'synthetic');
    const byId = new Map(kept.map((a) => [a.alertId, a]));
    for (const opp of opportunities) {
      if (opp._synthetic) continue;
      byId.set(opp.alertId, { ...byId.get(opp.alertId), ...opp });
    }
    const merged = [...byId.values()]
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 100);
    await storageSet({ [STORAGE.alerts]: merged });

    const parts = [];
    if (stats.hn) parts.push(`${stats.hn} Hacker News`);
    if (stats.reddit) {
      parts.push(
        `${stats.reddit} Reddit${stats.providers?.reddit === 'oauth' ? ' (OAuth)' : ''}`,
      );
    }
    if (stats.news) {
      const newsMode = stats.providers?.news === 'newsapi' ? 'NewsAPI' : 'RSS';
      parts.push(
        `${stats.news} noticias/${newsMode}${stats.ownNews ? ` (${stats.ownNews} tu marca)` : ''}`,
      );
    }
    if (stats.page) parts.push(`${stats.page} en página`);
    const namesLabel = (scannedNames || []).slice(0, 4).join(', ') || '—';
    if (els.scanStatus) {
      if (parts.length) {
        els.scanStatus.textContent = `Listo: ${parts.join(' · ')} · rivales: ${namesLabel}`;
      } else {
        const hint = errors?.length ? ` (${errors[0]})` : '';
        els.scanStatus.textContent =
          `Sin menciones para: ${namesLabel}.${hint} ` +
          `En Config poné marcas reales (Shopify, Stripe, AWS…) y volvé a escanear.`;
      }
    }
    await refreshAlerts();
  } catch (err) {
    if (els.scanStatus) {
      els.scanStatus.classList.add('is-error');
      els.scanStatus.textContent =
        err instanceof Error ? err.message : 'No se pudo escanear. Reintentá.';
    }
  } finally {
    els.scanComp.disabled = false;
  }
}

async function fillRivalSelect() {
  if (!els.rivalSelect) return;
  const { [STORAGE.config]: cfg } = await storageGet([STORAGE.config]);
  const competitors = cfg?.competitors?.length
    ? cfg.competitors
    : [{ name: 'AWS' }, { name: 'Shopify' }, { name: 'Mailchimp' }];
  const current = els.rivalSelect.value;
  els.rivalSelect.innerHTML = competitors
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');
  if (current && [...els.rivalSelect.options].some((o) => o.value === current)) {
    els.rivalSelect.value = current;
  }
}

async function prependOpportunity(opp) {
  const data = await storageGet([STORAGE.alerts]);
  const list = Array.isArray(data[STORAGE.alerts]) ? data[STORAGE.alerts] : [];
  await storageSet({
    [STORAGE.alerts]: [opp, ...list.filter((a) => a.alertId !== opp.alertId)].slice(0, 100),
  });
  // No auto-expandir: el usuario abre con clic
  expandedAlertId = null;
}

function sourceLabel(alert) {
  if (alert._brandScope === 'own') return 'prensa · tu marca';
  if (alert._source === 'hackernews') return 'hn';
  if (alert._source === 'reddit') return 'reddit';
  if (alert._source === 'news') return 'noticias';
  if (alert._source === 'page') return 'página';
  if (alert._demo) return 'ejemplo';
  if (alert._synthetic) return 'simulado';
  return '';
}

function truncateText(text, max = 90) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function setAlertExpanded(node, open) {
  node.classList.toggle('is-expanded', open);
  const body = node.querySelector('[data-alert-body]');
  const toggle = node.querySelector('[data-alert-toggle]');
  if (body) {
    body.hidden = !open;
    body.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const chev = toggle.querySelector('[data-chevron]');
    if (chev) chev.textContent = open ? '▾' : '▸';
  }
}

function collapseAllAlerts(exceptId = null) {
  if (!els.feed) return;
  els.feed.querySelectorAll('.rl-alert--accordion').forEach((el) => {
    if (exceptId && el.dataset.alertId === exceptId) return;
    setAlertExpanded(el, false);
  });
}

function renderAlerts(alerts, company = null) {
  if (!els.feed) return;
  els.feed.innerHTML = '';
  if (!alerts?.length) {
    els.feed.innerHTML = `
      <div class="rl-empty">
        Todavía no hay oportunidades.<br/>
        Pulsá <strong>Escanear</strong> para buscar quejas de tus rivales.
        <button type="button" class="rl-btn rl-btn--primary" id="btn-empty-scan" style="margin-top:12px">
          Escanear
        </button>
      </div>`;
    document.getElementById('btn-empty-scan')?.addEventListener('click', () => {
      void scanCompetitorMarket();
    });
    return;
  }

  // Si no hay expandida válida, no abrir ninguna (lista compacta).
  if (expandedAlertId && !alerts.some((a) => a.alertId === expandedAlertId)) {
    expandedAlertId = null;
  }

  for (const alert of alerts) {
    try {
      renderAlertCard(alert, company);
    } catch (err) {
      console.error('[RL] renderAlertCard', alert?.alertId, err);
    }
  }
}

function renderAlertCard(alert, company = null) {
    const c = alert.competitor || lookupCompetitorProfile(alert.competitorName) || {};
    const logo = c.logoUrl || lookupCompetitorProfile(alert.competitorName)?.logoUrl;
    const isOpen = expandedAlertId === alert.alertId;
    const src = sourceLabel(alert);
    const node = document.createElement('article');
    node.className = `rl-alert rl-alert--accordion${isOpen ? ' is-expanded' : ''}`;
    node.dataset.alertId = alert.alertId;

    node.innerHTML = `
      <button type="button" class="rl-alert__summary" data-alert-toggle aria-expanded="${isOpen ? 'true' : 'false'}">
        <img class="rl-comp-logo rl-comp-logo--sm" src="${escapeHtml(logo || '')}" alt="" width="28" height="28" decoding="async" />
        <span class="rl-alert__summary-text">
          <span class="rl-alert__title-row">
            <strong>${escapeHtml(alert.competitorName || 'Rival')}</strong>
            ${
              alert._brandScope === 'own'
                ? '<span class="rl-badge rl-badge--own">Tu marca</span>'
                : ''
            }
            <span class="rl-badge rl-badge--${escapeHtml(String(alert.severity || 'HIGH').toLowerCase())}">
              ${escapeHtml(alert.status || 'NEW')}
            </span>
          </span>
          <span class="rl-alert__snippet">${escapeHtml(truncateText(alert.originalComplaint, 88))}</span>
          <span class="rl-alert__meta">${escapeHtml(
            [src, alert.frustrationScore != null ? `score ${alert.frustrationScore}` : '']
              .filter(Boolean)
              .join(' · '),
          )}</span>
        </span>
        <span class="rl-alert__chevron" data-chevron aria-hidden="true">${isOpen ? '▾' : '▸'}</span>
      </button>
      <div class="rl-alert__body" data-alert-body ${isOpen ? '' : 'hidden'}>
        <p class="rl-alert__complaint">${escapeHtml(alert.originalComplaint || '')}</p>
        <p class="rl-muted rl-alert__links">
          ${
            c.websiteUrl
              ? `<a href="${escapeHtml(c.websiteUrl)}" target="_blank" rel="noopener">Sitio</a> · `
              : ''
          }
          <a href="${escapeHtml(alert.sourceUrl || '#')}" target="_blank" rel="noopener">Fuente</a>
          ${c.weaknessNotes ? ` · <span title="${escapeHtml(c.weaknessNotes)}">debilidad</span>` : ''}
        </p>
        <p class="rl-muted rl-alert__section-label">Pitch</p>
        <div class="rl-pitch-tabs" data-pitch-tabs></div>
        <div class="rl-pitch-preview" data-pitch-preview></div>
        <div class="rl-card-actions rl-card-actions--compact" data-alert-actions></div>
      </div>
    `;

    const img = node.querySelector('.rl-comp-logo');
    if (img) {
      img.addEventListener('error', () => {
        img.src = lookupCompetitorProfile(alert.competitorName)?.logoUrl || img.src;
        img.onerror = null;
      });
    }

    const toggle = node.querySelector('[data-alert-toggle]');
    toggle?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const willOpen = !node.classList.contains('is-expanded');
      collapseAllAlerts(willOpen ? alert.alertId : null);
      expandedAlertId = willOpen ? alert.alertId : null;
      setAlertExpanded(node, willOpen);
      if (willOpen) {
        requestAnimationFrame(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    });

    let pitches = Array.isArray(alert.salesPitches) ? alert.salesPitches : null;
    if (!pitches?.length) {
      pitches = craftSalesPitchVariants({
        companyName: company?.companyName,
        whatTheySell: company?.whatTheySell,
        keyLinks: company?.keyLinks,
        competitorName: alert.competitorName,
        complaint: alert.originalComplaint,
      });
      if (alert.salesPitch && pitches[0]) {
        pitches = pitches.map((p, i) =>
          i === 0 ? { ...p, body: alert.salesPitch, recommended: true } : { ...p, recommended: false },
        );
      }
    }
    if (!pitches?.length) {
      pitches = [
        {
          id: 'soft',
          label: 'Suave',
          recommended: true,
          body: alert.salesPitch || '',
          rationale: '',
        },
      ];
    }

    let selectedPitch = pitches.find((p) => p.recommended) || pitches[0];
    const tabsEl = node.querySelector('[data-pitch-tabs]');
    const previewEl = node.querySelector('[data-pitch-preview]');

    const renderPitchUi = () => {
      if (!tabsEl || !previewEl) return;
      tabsEl.innerHTML = pitches
        .map((p) => {
          const on = selectedPitch?.id === p.id;
          return `<button type="button" class="rl-pitch-tab${on ? ' is-active' : ''}${
            p.recommended ? ' is-rec' : ''
          }" data-pitch-id="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`;
        })
        .join('');
      previewEl.innerHTML = `
        ${selectedPitch?.rationale ? `<p class="rl-rationale">${escapeHtml(selectedPitch.rationale)}</p>` : ''}
        <p><em>${escapeHtml(selectedPitch?.body || '')}</em></p>
      `;
      tabsEl.querySelectorAll('[data-pitch-id]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedPitch = pitches.find((p) => p.id === btn.getAttribute('data-pitch-id')) || selectedPitch;
          renderPitchUi();
        });
      });
    };
    renderPitchUi();

    const actions = node.querySelector('[data-alert-actions]');
    if (actions) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'rl-btn rl-btn--primary';
      copy.textContent = 'Copiar';
      copy.addEventListener('click', async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(selectedPitch?.body || alert.salesPitch || '');
        copy.textContent = '✓';
        setTimeout(() => {
          copy.textContent = 'Copiar';
        }, 1000);
      });

      const inject = document.createElement('button');
      inject.type = 'button';
      inject.className = 'rl-btn rl-btn--ghost';
      inject.textContent = 'Inyectar';
      inject.addEventListener('click', async (e) => {
        e.stopPropagation();
        inject.disabled = true;
        try {
          await chrome.runtime.sendMessage({
            type: 'RL_INJECT_REPLY',
            text: selectedPitch?.body || alert.salesPitch,
            complaintId: null,
          });
          await updateAlertStatus(alert.alertId, 'CONTACTED');
        } finally {
          inject.disabled = false;
        }
      });

      const mkStatusBtn = (label, status) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rl-btn rl-btn--ghost';
        b.textContent = label;
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          await updateAlertStatus(alert.alertId, status);
        });
        return b;
      };

      actions.append(
        copy,
        inject,
        mkStatusBtn('Contactado', 'CONTACTED'),
        mkStatusBtn('Ganado', 'WON'),
        mkStatusBtn('Descartar', 'DISMISSED'),
      );

      const crmBtn = document.createElement('button');
      crmBtn.type = 'button';
      crmBtn.className = 'rl-btn rl-btn--ghost';
      crmBtn.textContent = 'CRM';
      crmBtn.title = 'Enviar a webhook / HubSpot';
      crmBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        crmBtn.disabled = true;
        crmBtn.textContent = '…';
        try {
          const cfgData = await storageGet([STORAGE.config]);
          const results = await pushOpportunityToCrm(alert, {
            companyName: cfgData[STORAGE.config]?.company?.companyName,
          });
          crmBtn.textContent = results.some((r) => r.ok) ? '✓ CRM' : 'CRM ✗';
          if (els.scanStatus) {
            els.scanStatus.classList.toggle('is-error', !results.some((r) => r.ok));
            els.scanStatus.textContent = formatPushSummary(results);
          }
        } finally {
          setTimeout(() => {
            crmBtn.disabled = false;
            crmBtn.textContent = 'CRM';
          }, 1600);
        }
      });

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'rl-btn rl-btn--ghost';
      shareBtn.textContent = 'Share';
      shareBtn.title = 'Crear link / token compartible';
      shareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        shareBtn.disabled = true;
        try {
          await shareWithDestinationPrompt({
            kind: 'opportunity',
            title: `Oportunidad · ${alert.competitorName}`,
            summary: truncateText(alert.originalComplaint, 160),
            alert,
            data: {
              competitorName: alert.competitorName,
              originalComplaint: alert.originalComplaint,
              sourceUrl: alert.sourceUrl,
              channel: alert.channel,
              severity: alert.severity,
              status: alert.status,
              salesPitch: selectedPitch?.body || alert.salesPitch,
              alertId: alert.alertId,
            },
          });
        } finally {
          shareBtn.disabled = false;
          shareBtn.textContent = 'Share';
        }
      });

      actions.append(crmBtn, shareBtn);

      const reportBtn = document.createElement('button');
      reportBtn.type = 'button';
      reportBtn.className = 'rl-btn rl-btn--ghost';
      reportBtn.textContent = 'Informe IA';
      reportBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        reportBtn.disabled = true;
        reportBtn.textContent = 'Analizando…';
        try {
          await generateRivalReport(alert.competitorName, [
            {
              text: alert.originalComplaint,
              sourceUrl: alert.sourceUrl,
              channel: alert.channel,
            },
          ]);
        } finally {
          reportBtn.disabled = false;
          reportBtn.textContent = 'Informe IA';
        }
      });
      actions.append(reportBtn);
    }

    els.feed.appendChild(node);
}

const CAPTURE_STATUS_LABELS = {
  CONTACTED: 'Contactado',
  WON: 'Ganado',
  DISMISSED: 'Descartado',
  NEW: 'Abierto',
  SNOOZED: 'Pospuesto',
};

async function updateAlertStatus(alertId, status) {
  const data = await storageGet([STORAGE.alerts]);
  const list = Array.isArray(data[STORAGE.alerts]) ? data[STORAGE.alerts] : [];
  const prev = list.find((a) => a.alertId === alertId);
  const next = list.map((a) => (a.alertId === alertId ? { ...a, status } : a));
  await storageSet({ [STORAGE.alerts]: next });

  if (prev) {
    await appendHistory({
      kind: 'captacion',
      at: new Date().toISOString(),
      label: CAPTURE_STATUS_LABELS[status] || status,
      status,
      competitorName: prev.competitorName,
      body: prev.salesPitch || '',
      originalText: prev.originalComplaint || '',
      channel: prev.channel || 'competencia',
      sourceUrl: prev.sourceUrl || '',
      alertId: prev.alertId,
    });
  }

  await refreshAlerts();
  await refreshKpis();
}

function emptyCompetitorDraft() {
  return {
    name: '',
    aliases: [],
    websiteUrl: '',
    logoUrl: '',
    industry: '',
    description: '',
    socialHandles: [],
    weaknessNotes: '',
  };
}

function renderCompetitorEditor(competitors) {
  const root = document.getElementById('cfg-competitors-list');
  if (!root) return;
  const list = Array.isArray(competitors) && competitors.length ? competitors : [emptyCompetitorDraft()];

  root.innerHTML = list
    .map((c, idx) => {
      const aliases = Array.isArray(c.aliases) ? c.aliases.join(', ') : '';
      const social = Array.isArray(c.socialHandles) ? c.socialHandles.join(', ') : '';
      const title = (c.name || '').trim() || `Competidor ${idx + 1}`;
      const open = !c.name; // nuevos vacíos abiertos para editar
      return `
      <article class="rl-comp-form${open ? ' is-expanded' : ''}" data-idx="${idx}">
        <button type="button" class="rl-comp-form__toggle" data-comp-toggle aria-expanded="${open ? 'true' : 'false'}">
          <span class="rl-comp-form__chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
          <strong>${escapeHtml(title)}</strong>
          <span class="rl-muted">${escapeHtml(c.industry || '')}</span>
        </button>
        <div class="rl-comp-form__body" data-comp-body ${open ? '' : 'hidden'}>
          <div class="rl-comp-form__head">
            <span class="rl-muted">Editar ficha</span>
            <button type="button" class="rl-btn rl-btn--ghost rl-btn--danger-text" data-remove="${idx}">
              Quitar
            </button>
          </div>
          <label>
            Nombre *
            <input data-field="name" value="${escapeHtml(c.name || '')}" maxlength="120" required placeholder="Shopify" />
          </label>
          <label>
            Aliases (separados por coma)
            <input data-field="aliases" value="${escapeHtml(aliases)}" maxlength="200" placeholder="rival cloud, rivalcloud" />
          </label>
          <label>
            Sitio web
            <input data-field="websiteUrl" type="url" value="${escapeHtml(c.websiteUrl || '')}" maxlength="300" placeholder="https://…" />
          </label>
          <label>
            Logo URL (opcional)
            <input data-field="logoUrl" type="url" value="${escapeHtml(c.logoUrl && !String(c.logoUrl).includes('google.com/s2/favicons') ? c.logoUrl : '')}" maxlength="400" placeholder="https://…/logo.png" />
          </label>
          <label>
            Industria
            <input data-field="industry" value="${escapeHtml(c.industry || '')}" maxlength="120" placeholder="Cloud / IaaS" />
          </label>
          <label>
            Descripción
            <textarea data-field="description" rows="2" maxlength="400" placeholder="Qué vende / posicionamiento">${escapeHtml(c.description || '')}</textarea>
          </label>
          <label>
            Debilidades conocidas
            <textarea data-field="weaknessNotes" rows="2" maxlength="400" placeholder="Soporte lento, cobros duplicados…">${escapeHtml(c.weaknessNotes || '')}</textarea>
          </label>
          <label>
            Redes (coma)
            <input data-field="socialHandles" value="${escapeHtml(social)}" maxlength="200" placeholder="@rivalcloud" />
          </label>
        </div>
      </article>`;
    })
    .join('');

  root.querySelectorAll('[data-comp-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.rl-comp-form');
      if (!card) return;
      const open = !card.classList.contains('is-expanded');
      card.classList.toggle('is-expanded', open);
      const body = card.querySelector('[data-comp-body]');
      if (body) body.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      const chev = btn.querySelector('.rl-comp-form__chevron');
      if (chev) chev.textContent = open ? '▾' : '▸';
    });
  });

  root.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const current = collectCompetitorsFromForm();
      const idx = Number(btn.getAttribute('data-remove'));
      current.splice(idx, 1);
      renderCompetitorEditor(current.length ? current : [emptyCompetitorDraft()]);
    });
  });
}

function collectCompetitorsFromForm() {
  const root = document.getElementById('cfg-competitors-list');
  if (!root) return [];
  return [...root.querySelectorAll('.rl-comp-form')]
    .map((card) => {
      const val = (field) => card.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
      const name = val('name');
      if (!name) return null;
      const splitList = (s) =>
        s
          ? s.split(',').map((x) => x.trim()).filter(Boolean)
          : [];
      return {
        name,
        aliases: splitList(val('aliases')),
        websiteUrl: val('websiteUrl') || null,
        logoUrl: val('logoUrl') || null,
        industry: val('industry') || null,
        description: val('description') || null,
        weaknessNotes: val('weaknessNotes') || null,
        socialHandles: splitList(val('socialHandles')),
      };
    })
    .filter(Boolean);
}

function parseKeywords(raw) {
  return String(raw || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderPlatformPrefs(prefs) {
  const p = normalizePlatformPrefs(prefs);
  const scanRoot = document.getElementById('cfg-scan-sources');
  const pageRoot = document.getElementById('cfg-page-platforms');
  const customRoot = document.getElementById('cfg-custom-platforms');
  if (!scanRoot || !pageRoot || !customRoot) return;

  scanRoot.innerHTML = SCAN_SOURCES.map(
    (s) => `
    <label class="rl-check rl-platform-item">
      <input type="checkbox" id="cfg-scan-${s.id}" ${p.scanSources[s.id] !== false ? 'checked' : ''} />
      <span>
        <strong>${s.label}</strong>
        <small>${s.hint || ''}</small>
      </span>
    </label>`,
  ).join('');

  pageRoot.innerHTML = PAGE_PLATFORMS.map(
    (plat) => `
    <label class="rl-check rl-platform-item">
      <input type="checkbox" id="cfg-page-${plat.id}" ${p.pageEnabled[plat.id] !== false ? 'checked' : ''} />
      <span>
        <strong>${plat.label}</strong>
        <small>${plat.hosts.join(', ')}</small>
      </span>
    </label>`,
  ).join('');

  customRoot.innerHTML = (p.custom || [])
    .map(
      (c) => `
    <article class="rl-custom-platform" data-custom-platform="${escapeHtml(c.id)}">
      <label class="rl-check">
        <input type="checkbox" data-field="enabled" ${c.enabled !== false ? 'checked' : ''} />
        Activa
      </label>
      <label>
        Nombre
        <input data-field="label" value="${escapeHtml(c.label || c.host)}" maxlength="80" />
      </label>
      <label>
        Dominio
        <input data-field="host" value="${escapeHtml(c.host)}" maxlength="120" required />
      </label>
      <button type="button" class="rl-btn rl-btn--ghost" data-remove-platform="${escapeHtml(c.id)}">Quitar</button>
    </article>`,
    )
    .join('');

  customRoot.querySelectorAll('[data-remove-platform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove-platform');
      const next = collectPlatformPrefsFromDom();
      next.custom = next.custom.filter((c) => c.id !== id);
      renderPlatformPrefs(next);
    });
  });
}

async function requestOriginsForCustoms(customs) {
  const origins = [];
  for (const c of customs || []) {
    if (!c.enabled || !c.host) continue;
    origins.push(...matchPatternsForHost(c.host));
  }
  if (!origins.length) return { ok: true, granted: true };
  try {
    const granted = await chrome.permissions.request({ origins: [...new Set(origins)] });
    return { ok: true, granted: Boolean(granted) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadConfigForm() {
  const data = await storageGet([STORAGE.config, STORAGE.appsync, STORAGE.detection]);
  const cfg = data[STORAGE.config] || {};
  const appsync = data[STORAGE.appsync] || {};
  const detection = data[STORAGE.detection] || {};
  const session = await getSession();
  const cognito = (await getCognitoConfig()) || {};

  document.getElementById('cfg-user-id').value = session?.userId || cfg.userId || 'local-user';
  document.getElementById('cfg-name').value = cfg.company?.companyName || '';
  document.getElementById('cfg-sells').value = cfg.company?.whatTheySell || '';
  document.getElementById('cfg-links').value = (cfg.company?.keyLinks || []).join('\n');
  document.getElementById('cfg-voice').value = cfg.company?.brandVoiceNotes || '';
  renderCompetitorEditor(cfg.competitors?.length ? cfg.competitors : defaultCompetitorSeed());
  document.getElementById('cfg-gql').value = appsync.graphqlUrl || '';
  document.getElementById('cfg-rt').value = appsync.realtimeUrl || '';
  document.getElementById('cfg-key').value = appsync.apiKey || '';
  document.getElementById('cfg-cog-region').value = cognito.region || '';
  document.getElementById('cfg-cog-pool').value = cognito.userPoolId || '';
  document.getElementById('cfg-cog-client').value = cognito.clientId || '';
  document.getElementById('cfg-sensitivity').value = detection.sensitivity || 'medium';
  document.getElementById('cfg-keywords').value = (detection.extraKeywords || []).join(', ');
  document.getElementById('cfg-ignore-hosts').value = (detection.ignoreHosts || []).join('\n');
  document.getElementById('cfg-offline').checked = detection.offlineFallback !== false;
  renderPlatformPrefs(detection.platforms || defaultPlatformPrefs());

  const integ = await loadIntegrations();
  document.getElementById('cfg-crm-webhook').checked = Boolean(integ.webhook?.enabled);
  document.getElementById('cfg-crm-webhook-url').value = integ.webhook?.url || '';
  document.getElementById('cfg-crm-webhook-secret').value = integ.webhook?.secret || '';
  document.getElementById('cfg-crm-hubspot').checked = Boolean(integ.hubspot?.enabled);
  document.getElementById('cfg-crm-hubspot-token').value = integ.hubspot?.accessToken || '';
  document.getElementById('cfg-crm-autopush').checked = Boolean(integ.autoPushOnCapture);
  document.getElementById('cfg-share-ttl').value = String(integ.shareTtlHours || 168);
  document.getElementById('cfg-share-email').value = integ.contacts?.email || '';
  document.getElementById('cfg-share-whatsapp').value = integ.contacts?.whatsapp || '';
  document.getElementById('cfg-share-slack-webhook').value = integ.contacts?.slackWebhook || '';
  document.getElementById('cfg-share-slack-label').value = integ.contacts?.slackLabel || '';

  const scanCreds = await loadScanCredentials();
  document.getElementById('cfg-reddit-oauth').checked = Boolean(scanCreds.reddit?.enabled);
  document.getElementById('cfg-reddit-client-id').value = scanCreds.reddit?.clientId || '';
  document.getElementById('cfg-reddit-client-secret').value = scanCreds.reddit?.clientSecret || '';
  document.getElementById('cfg-reddit-ua').value =
    scanCreds.reddit?.userAgent || 'ResponseLensAI/0.7 (professional-scan)';
  document.getElementById('cfg-newsapi').checked = Boolean(scanCreds.newsapi?.enabled);
  document.getElementById('cfg-newsapi-key').value = scanCreds.newsapi?.apiKey || '';

  const label = document.getElementById('auth-user-label');
  if (label && session) {
    label.textContent =
      session.mode === 'cognito'
        ? session.email || session.userId
        : `Modo local · ${session.userId}`;
  }
}

document.getElementById('btn-add-platform')?.addEventListener('click', async () => {
  const input = document.getElementById('cfg-new-platform-host');
  const host = normalizeHost(input?.value);
  if (!host) {
    els.status?.classList.add('is-error');
    if (els.status) els.status.textContent = 'Dominio inválido. Usá algo como trustpilot.com';
    return;
  }
  const current = collectPlatformPrefsFromDom();
  if (current.custom.some((c) => c.host === host) || PAGE_PLATFORMS.some((p) => p.hosts.includes(host))) {
    if (els.status) {
      els.status.classList.remove('is-error');
      els.status.textContent = 'Esa plataforma ya está en la lista.';
    }
    return;
  }
  const perm = await requestOriginsForCustoms([{ host, enabled: true }]);
  if (!perm.granted) {
    if (els.status) {
      els.status.classList.add('is-error');
      els.status.textContent = 'Chrome no otorgó permiso para ese dominio.';
    }
    return;
  }
  current.custom.push({
    id: `custom_${host.replace(/\./g, '_')}`,
    label: host,
    host,
    enabled: true,
  });
  renderPlatformPrefs(current);
  if (input) input.value = '';
  if (els.status) {
    els.status.classList.remove('is-error');
    els.status.textContent = `Plataforma ${host} agregada. Guardá la config para activar el escaneo.`;
  }
});

document.getElementById('btn-open-platforms')?.addEventListener('click', async () => {
  // Preferir lo marcado en el formulario; si no, lo guardado
  let prefs = collectPlatformPrefsFromDom();
  const saved = await storageGet([STORAGE.detection]);
  if (!document.getElementById('cfg-scan-hackernews')) {
    prefs = normalizePlatformPrefs(saved[STORAGE.detection]?.platforms);
  }
  const urls = listOpenUrlsForPrefs(prefs);
  if (!urls.length) {
    if (els.status) {
      els.status.classList.add('is-error');
      els.status.textContent = 'No hay plataformas activas para abrir.';
    }
    return;
  }
  for (let i = 0; i < urls.length; i += 1) {
    await chrome.tabs.create({ url: urls[i], active: i === 0 });
  }

  if (els.status) {
    els.status.classList.remove('is-error');
    els.status.textContent = `Se abrieron ${urls.length} pestaña(s). Entrá a comentarios/reviews para que el plugin detecte.`;
  }
});

document.getElementById('btn-add-competitor')?.addEventListener('click', () => {
  const current = collectCompetitorsFromForm();
  current.push(emptyCompetitorDraft());
  renderCompetitorEditor(current);
  const cards = document.querySelectorAll('.rl-comp-form');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  cards[cards.length - 1]?.querySelector('[data-field="name"]')?.focus();
});

els.form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  els.status.classList.remove('is-error');
  els.status.textContent = 'Guardando…';

  const session = await getSession();
  const userId = session?.userId || document.getElementById('cfg-user-id').value.trim();
  document.getElementById('cfg-user-id').value = userId;
  const company = {
    companyName: document.getElementById('cfg-name').value.trim(),
    whatTheySell: document.getElementById('cfg-sells').value.trim(),
    keyLinks: document
      .getElementById('cfg-links')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    brandVoiceNotes: document.getElementById('cfg-voice').value.trim() || null,
  };
  const competitors = collectCompetitorsFromForm();
  if (!competitors.length) {
    els.status.classList.add('is-error');
    els.status.textContent = 'Agregá al menos un competidor con nombre.';
    document.getElementById('cfg-competitors-list')?.closest('details')?.setAttribute('open', '');
    return;
  }
  const appsync = {
    graphqlUrl: document.getElementById('cfg-gql').value.trim(),
    realtimeUrl: document.getElementById('cfg-rt').value.trim(),
    apiKey: document.getElementById('cfg-key').value.trim(),
  };
  await saveCognitoConfig({
    region: document.getElementById('cfg-cog-region').value.trim(),
    userPoolId: document.getElementById('cfg-cog-pool').value.trim(),
    clientId: document.getElementById('cfg-cog-client').value.trim(),
  });
  const platforms = collectPlatformPrefsFromDom();
  const detection = {
    sensitivity: document.getElementById('cfg-sensitivity').value,
    extraKeywords: parseKeywords(document.getElementById('cfg-keywords').value),
    ignoreHosts: document
      .getElementById('cfg-ignore-hosts')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    offlineFallback: document.getElementById('cfg-offline').checked,
    platforms,
  };

  const config = { userId, company, competitors };

  try {
    const perm = await requestOriginsForCustoms(platforms.custom);
    if (platforms.custom.some((c) => c.enabled) && !perm.granted) {
      els.status.classList.add('is-error');
      els.status.textContent =
        'Guardado local pendiente de permisos: aceptá el acceso a los dominios custom en el diálogo de Chrome.';
    }

    await storageSet({
      [STORAGE.config]: config,
      [STORAGE.appsync]: appsync,
      [STORAGE.detection]: detection,
    });

    await saveIntegrations({
      webhook: {
        enabled: document.getElementById('cfg-crm-webhook')?.checked,
        url: document.getElementById('cfg-crm-webhook-url')?.value?.trim() || '',
        secret: document.getElementById('cfg-crm-webhook-secret')?.value || '',
      },
      hubspot: {
        enabled: document.getElementById('cfg-crm-hubspot')?.checked,
        accessToken: document.getElementById('cfg-crm-hubspot-token')?.value?.trim() || '',
      },
      autoPushOnCapture: document.getElementById('cfg-crm-autopush')?.checked,
      shareTtlHours: Number(document.getElementById('cfg-share-ttl')?.value || 168),
      contacts: {
        email: document.getElementById('cfg-share-email')?.value?.trim() || '',
        whatsapp: document.getElementById('cfg-share-whatsapp')?.value?.trim() || '',
        slackWebhook: document.getElementById('cfg-share-slack-webhook')?.value?.trim() || '',
        slackLabel: document.getElementById('cfg-share-slack-label')?.value?.trim() || '',
      },
    });

    await saveScanCredentials({
      reddit: {
        enabled: document.getElementById('cfg-reddit-oauth')?.checked,
        clientId: document.getElementById('cfg-reddit-client-id')?.value?.trim() || '',
        clientSecret: document.getElementById('cfg-reddit-client-secret')?.value || '',
        userAgent:
          document.getElementById('cfg-reddit-ua')?.value?.trim() ||
          'ResponseLensAI/0.7 (professional-scan)',
      },
      newsapi: {
        enabled: document.getElementById('cfg-newsapi')?.checked,
        apiKey: document.getElementById('cfg-newsapi-key')?.value?.trim() || '',
      },
    });

    // Pedir host opcional para webhook custom si está activo
    const whUrl = document.getElementById('cfg-crm-webhook-url')?.value?.trim();
    if (document.getElementById('cfg-crm-webhook')?.checked && whUrl) {
      try {
        const u = new URL(whUrl);
        await chrome.permissions.request({ origins: [`${u.protocol}//${u.host}/*`] });
      } catch {
        /* ignore */
      }
    }

    await chrome.runtime.sendMessage({ type: 'RL_DETECTION_UPDATED', detection });

    if (appsync.graphqlUrl && appsync.apiKey) {
      await gqlRequest({
        url: appsync.graphqlUrl,
        apiKey: appsync.apiKey,
        query: SAVE_CONFIG_MUTATION,
        variables: { input: { userId, company, competitors } },
      });
    }

    await chrome.runtime.sendMessage({ type: 'RL_START_SUBSCRIPTION', userId });
    await fillRivalSelect();
    els.status.textContent = 'Configuración guardada. Competidores listos para captación.';
  } catch (err) {
    els.status.classList.add('is-error');
    els.status.textContent =
      'Local OK. Cloud: ' + (err instanceof Error ? err.message : String(err));
  }
});

els.manual?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = document.getElementById('manual-text').value.trim();
  if (!text) return;
  await analyzeComplaint({
    id: `manual_${Date.now()}`,
    text,
    sourceUrl: 'manual://sidepanel',
    channel: 'manual',
  });
});

els.compManual?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = document.getElementById('comp-manual-text').value.trim();
  if (!text) return;
  const { [STORAGE.config]: cfg } = await storageGet([STORAGE.config]);
  const rival =
    els.rivalSelect?.value ||
    findMentionedCompetitor(text, cfg?.competitors || []) ||
    'Competidor';
  const opp = buildOpportunity({
    competitorName: rival,
    complaint: text,
    sourceUrl: document.getElementById('comp-manual-url').value.trim() || 'manual://competencia',
    channel: 'manual',
    company: cfg?.company,
    userId: cfg?.userId || 'local-user',
    competitors: cfg?.competitors || defaultCompetitorSeed(),
  });
  await prependOpportunity(opp);
  document.getElementById('comp-manual-text').value = '';
  els.alertFilter.value = 'OPEN';
  await refreshAlerts();
});

els.refresh?.addEventListener('click', () => {
  void refreshAlerts();
});
els.alertFilter?.addEventListener('change', () => {
  void refreshAlerts();
});
els.alertFilterDate?.addEventListener('change', () => {
  void refreshAlerts();
});
els.alertFilterPlatform?.addEventListener('change', () => {
  void refreshAlerts();
});
els.alertFilterRival?.addEventListener('change', () => {
  void refreshAlerts();
});
els.alertFilterSeverity?.addEventListener('change', () => {
  void refreshAlerts();
});
let filterQTimer = 0;
els.alertFilterQ?.addEventListener('input', () => {
  window.clearTimeout(filterQTimer);
  filterQTimer = window.setTimeout(() => {
    void refreshAlerts();
  }, 220);
});
els.scanComp?.addEventListener('click', () => {
  void scanCompetitorMarket();
});

document.getElementById('btn-open-capture-demo')?.addEventListener('click', async () => {
  const url = chrome.runtime.getURL('fixtures/rival-capture-demo.html');
  await chrome.tabs.create({ url, active: true });
  if (els.scanStatus) {
    els.scanStatus.classList.remove('is-error');
    els.scanStatus.textContent =
      'Demo abierta. Esperá el highlight azul y usá 🎯 para captar o 📊 para el informe.';
  }
});

els.loadDemo?.addEventListener('click', async () => {
  const { [STORAGE.config]: cfg, [STORAGE.alerts]: existing } = await storageGet([
    STORAGE.config,
    STORAGE.alerts,
  ]);
  let competitors = cfg?.competitors?.length ? cfg.competitors : defaultCompetitorSeed();
  if (!cfg?.competitors?.length) {
    await storageSet({
      [STORAGE.config]: {
        ...(cfg || {}),
        userId: cfg?.userId || 'local-user',
        company: cfg?.company || {
          companyName: 'TuMarca',
          whatTheySell: 'software B2B con soporte humano',
        },
        competitors,
      },
    });
    await loadConfigForm();
  }
  const demos = buildDemoOpportunities(cfg?.company, cfg?.userId || 'local-user', competitors);
  const rest = (existing || []).filter((a) => !String(a.alertId || '').startsWith('demo-'));
  await storageSet({ [STORAGE.alerts]: [...demos, ...rest] });
  // Lista colapsada: el usuario abre con un clic
  expandedAlertId = null;
  els.alertFilter.value = 'OPEN';
  await refreshAlerts();
  activateTab('comp');
});

els.exportHist.addEventListener('click', async () => {
  const data = await storageGet([STORAGE.history]);
  const list = data[STORAGE.history] || [];
  const header = 'at,tone,channel,riskLevel,recommendedAction,body\n';
  const rows = list
    .map((h) =>
      [h.at, h.tone, h.channel, h.riskLevel, h.recommendedAction, JSON.stringify(h.body || '')].join(
        ',',
      ),
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `responselens-history-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

els.rivalBannerBtn?.addEventListener('click', async () => {
  const name = pendingIntelRival?.competitorName;
  if (!name) return;
  els.rivalBannerBtn.disabled = true;
  els.rivalBannerBtn.textContent = 'Analizando…';
  try {
    await generateRivalReport(name, pendingIntelRival?.mentions || []);
  } finally {
    els.rivalBannerBtn.disabled = false;
    els.rivalBannerBtn.textContent = 'Informe IA';
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'RL_PENDING_COMPLAINT' && message.payload) {
    const text = message.payload.text || '';
    const rival =
      message.payload.competitorName ||
      findMentionedCompetitor(text, []);
    // Defensa: si menciona rival, no abrir triage de Propios
    if (rival) {
      activateTab('comp');
      void refreshAlerts();
      return;
    }
    analyzeComplaint(message.payload);
  }
  if (message?.type === 'RL_NEW_ALERT' || message?.type === 'RL_CAPTURE_OPPORTUNITY') {
    expandedAlertId = null;
    void refreshAlerts();
    activateTab('comp');
    if (message.type === 'RL_CAPTURE_OPPORTUNITY' && message.payload?.requestRivalReport) {
      void generateRivalReport(message.payload.competitorName, message.payload.pageMentions || []);
    }
  }
  if (message?.type === 'RL_PAGE_RIVALS_DETECTED') {
    void storageSet({ [STORAGE.pageRivals]: message.payload }).then(() => refreshPageRivalBanner());
  }
  if (message?.type === 'RL_REQUEST_RIVAL_REPORT' && message.payload?.competitorName) {
    activateTab('comp');
    void generateRivalReport(message.payload.competitorName, message.payload.mentions || []);
  }
});

const authGate = document.getElementById('auth-gate');
const appShell = document.getElementById('app-shell');
const authStatus = document.getElementById('auth-status');
let pendingConfirmEmail = '';

function setAuthStatus(msg, isError = false) {
  if (!authStatus) return;
  authStatus.textContent = msg || '';
  authStatus.classList.toggle('is-error', Boolean(isError));
}

function showAuthTab(name) {
  document.querySelectorAll('.rl-auth-tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.authTab === name);
  });
  document.getElementById('auth-login-form').hidden = name !== 'login';
  document.getElementById('auth-register-form').hidden = name !== 'register';
}

document.querySelectorAll('.rl-auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => showAuthTab(tab.dataset.authTab));
});

async function enterApp(session) {
  if (authGate) authGate.hidden = true;
  if (appShell) appShell.hidden = false;

  // Sincronizar userId de sesión en config
  const data = await storageGet([STORAGE.config]);
  const cfg = data[STORAGE.config] || {};
  if (session?.userId && cfg.userId !== session.userId) {
    await storageSet({
      [STORAGE.config]: { ...cfg, userId: session.userId },
    });
  }

  await loadUiZoom();
  await loadConfigForm();
  await fillRivalSelect();
  await refreshAlerts();
  await refreshKpis();
  await consumePendingRivalReport();

  const pending = await storageGet([STORAGE.pending]);
  const pendingPayload = pending[STORAGE.pending];
  // Si hay informe de rival pendiente / recién capturado, no mandar a Propios
  const rivalPending = await storageGet(['rl_pending_rival_report']);
  if (pendingPayload && !rivalPending.rl_pending_rival_report) {
    const rivalHint =
      pendingPayload.competitorName ||
      findMentionedCompetitor(pendingPayload.text || '', (await storageGet([STORAGE.config]))[STORAGE.config]?.competitors || []);
    if (rivalHint) {
      await storageSet({ [STORAGE.pending]: null });
      activateTab('comp');
      await refreshAlerts();
    } else {
      await analyzeComplaint(pendingPayload);
      await storageSet({ [STORAGE.pending]: null });
    }
  } else if (pendingPayload) {
    await storageSet({ [STORAGE.pending]: null });
  }

  if (session?.userId) {
    chrome.runtime.sendMessage({ type: 'RL_START_SUBSCRIPTION', userId: session.userId });
  }
}

document.getElementById('auth-login-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  setAuthStatus('Entrando…');
  try {
    const email = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-pass').value;
    const session = await signIn({ email, password });
    await enterApp(session);
  } catch (err) {
    setAuthStatus(err instanceof Error ? err.message : String(err), true);
  }
});

document.getElementById('auth-register-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  setAuthStatus('Procesando…');
  const email = document.getElementById('auth-reg-email').value.trim();
  const password = document.getElementById('auth-reg-pass').value;
  const code = document.getElementById('auth-reg-code').value.trim();
  const confirmWrap = document.getElementById('auth-confirm-wrap');
  try {
    if (pendingConfirmEmail && code) {
      await confirmSignUp({ email: pendingConfirmEmail || email, code });
      const session = await signIn({ email: pendingConfirmEmail || email, password });
      await enterApp(session);
      return;
    }
    await signUp({ email, password });
    pendingConfirmEmail = email;
    if (confirmWrap) confirmWrap.hidden = false;
    document.getElementById('auth-reg-submit').textContent = 'Confirmar y entrar';
    setAuthStatus('Te enviamos un código al email. Ingresalo y confirmá.');
  } catch (err) {
    setAuthStatus(err instanceof Error ? err.message : String(err), true);
  }
});

document.getElementById('btn-auth-local')?.addEventListener('click', async () => {
  setAuthStatus('Iniciando modo local…');
  try {
    const session = await startLocalSession();
    await enterApp(session);
  } catch (err) {
    setAuthStatus(err instanceof Error ? err.message : String(err), true);
  }
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await signOut();
  if (appShell) appShell.hidden = true;
  if (authGate) authGate.hidden = false;
  setAuthStatus('Sesión cerrada.');
  showAuthTab('login');
});

(async function boot() {
  const verEl = document.getElementById('ext-version');
  if (verEl) {
    const v = chrome.runtime.getManifest?.()?.version || '?';
    verEl.hidden = false;
    verEl.textContent = `v${v}`;
  }
  await loadUiZoom();
  const session = await getSession();
  if (session?.userId) {
    await enterApp(session);
  } else {
    if (authGate) authGate.hidden = false;
    if (appShell) appShell.hidden = true;
  }
})();
