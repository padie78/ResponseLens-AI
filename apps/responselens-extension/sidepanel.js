/**
 * Side Panel — Ops KPIs, triage, historial, workflow de alertas, fallback offline.
 */

import { gqlRequest } from './lib/appsync-client.js';
import { buildLocalReplyOptions } from './lib/local-fallback.js';
import { computeOpsStats } from './lib/ops-stats.js';
import {
  buildDemoOpportunities,
  buildOpportunity,
  craftSalesPitchVariants,
  defaultCompetitorSeed,
  findMentionedCompetitor,
  lookupCompetitorProfile,
} from './lib/competitor-opportunity.js';
import { runCompetitorScan } from './lib/competitor-scan.js';

const STORAGE = {
  config: 'rl_user_config',
  alerts: 'rl_competitor_alerts',
  pending: 'rl_pending_complaint',
  appsync: 'rl_appsync',
  history: 'rl_reply_history',
  detection: 'rl_detection',
  uiZoom: 'rl_ui_zoom',
};

const ZOOM_STEPS = [100, 110, 125, 140, 160];
const DEFAULT_ZOOM = 125;
let uiZoom = DEFAULT_ZOOM;

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
    escalations: document.getElementById('kpi-escalations'),
  },
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
  document.documentElement.style.zoom = `${uiZoom}%`;
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
    const on = key === name;
    panel.classList.toggle('is-visible', on);
    panel.hidden = !on;
  }
  if (name === 'hist') renderHistory();
  if (name === 'comp') refreshAlerts();
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
  els.kpis.escalations.textContent = String(stats.escalations);
}

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

async function renderHistory() {
  const data = await storageGet([STORAGE.history]);
  const list = data[STORAGE.history] || [];
  els.histList.innerHTML = '';
  if (!list.length) {
    els.histList.innerHTML =
      '<div class="rl-empty">Aún no hay actividad. Las inyecciones de Propios y los cambios de Competencia (Contactado / Ganado / Descartar) aparecen acá.</div>';
    return;
  }
  for (const item of list) {
    const node = document.createElement('article');
    node.className = 'rl-alert';
    const isCap = item.kind === 'captacion';
    const title = isCap
      ? `${item.label || 'Captación'} · ${item.competitorName || ''}`
      : item.label || item.tone || 'Respuesta';
    const badge = isCap ? item.status || '—' : item.riskLevel || '—';
    node.innerHTML = `
      <header>
        <strong>${escapeHtml(title)}</strong>
        <span class="rl-badge">${escapeHtml(badge)}</span>
      </header>
      <p class="rl-muted">${escapeHtml(item.at || '')} · ${escapeHtml(item.channel || (isCap ? 'competencia' : ''))}</p>
      <p>${escapeHtml((item.body || item.originalText || '').slice(0, 220))}${
        (item.body || item.originalText || '').length > 220 ? '…' : ''
      }</p>
      <p class="rl-muted">${escapeHtml(
        isCap
          ? item.sourceUrl || ''
          : ACTION_LABELS[item.recommendedAction] || item.recommendedAction || '',
      )}</p>
    `;
    els.histList.appendChild(node);
  }
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

async function refreshAlerts() {
  await ensureCompetitorsReady();
  await fillRivalSelect();
  const data = await storageGet([STORAGE.alerts, STORAGE.config]);
  const filter = els.alertFilter?.value || 'OPEN';
  let alerts = data[STORAGE.alerts] || [];
  alerts = alerts.filter((a) => matchesAlertFilter(a, filter));
  const company = data[STORAGE.config]?.company || null;
  renderAlerts(alerts, company);
  await refreshKpis();
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
    els.scanStatus.textContent = 'Escaneando Hacker News + Reddit + pestaña…';
  }

  try {
    await ensureCompetitorsReady();
    const { [STORAGE.config]: cfg } = await storageGet([STORAGE.config]);
    const competitors = cfg?.competitors?.length
      ? cfg.competitors
      : defaultCompetitorSeed();
    const pageMentions = await collectPageMentions();
    const { opportunities, stats, errors, scannedNames } = await runCompetitorScan({
      company: cfg?.company,
      userId: cfg?.userId || 'local-user',
      competitors,
      pageMentions,
      preferSyntheticFallback: false,
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
    if (stats.reddit) parts.push(`${stats.reddit} Reddit`);
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
}

function renderAlerts(alerts, company = null) {
  els.feed.innerHTML = '';
  if (!alerts?.length) {
    els.feed.innerHTML = `
      <div class="rl-empty">
        Todavía no hay oportunidades.<br/>
        Pulsá <strong>Escanear ahora</strong> para buscar quejas de tus rivales en Hacker News / Reddit
        (e importar las detectadas en la pestaña abierta).
        <button type="button" class="rl-btn rl-btn--primary" id="btn-empty-scan" style="margin-top:12px">
          Escanear ahora
        </button>
      </div>`;
    document.getElementById('btn-empty-scan')?.addEventListener('click', () => {
      void scanCompetitorMarket();
    });
    return;
  }

  for (const alert of alerts) {
    const c = alert.competitor || lookupCompetitorProfile(alert.competitorName) || {};
    const logo = c.logoUrl || lookupCompetitorProfile(alert.competitorName)?.logoUrl;
    const node = document.createElement('article');
    node.className = 'rl-alert';
    node.dataset.alertId = alert.alertId;

    const social = (c.socialHandles || [])
      .map((h) => `<span class="rl-chip rl-chip--muted">${escapeHtml(h)}</span>`)
      .join('');

    node.innerHTML = `
      <div class="rl-comp-card">
        <img class="rl-comp-logo" src="${escapeHtml(logo || '')}" alt="" width="40" height="40" />
        <div class="rl-comp-meta">
          <header>
            <strong>${escapeHtml(alert.competitorName)}</strong>
            <span class="rl-badge rl-badge--${escapeHtml(String(alert.severity || 'HIGH').toLowerCase())}">
              ${escapeHtml(alert.severity || 'HIGH')} · ${escapeHtml(alert.status || 'NEW')}
            </span>
          </header>
          ${c.industry ? `<p class="rl-comp-industry">${escapeHtml(c.industry)}</p>` : ''}
          ${c.description ? `<p class="rl-muted">${escapeHtml(c.description)}</p>` : ''}
          ${c.weaknessNotes ? `<p class="rl-comp-weak"><strong>Debilidad:</strong> ${escapeHtml(c.weaknessNotes)}</p>` : ''}
          <div class="rl-chips">${social}</div>
          <p class="rl-muted">
            ${
              c.websiteUrl
                ? `<a href="${escapeHtml(c.websiteUrl)}" target="_blank" rel="noopener">Sitio</a> · `
                : ''
            }
            <a href="${escapeHtml(alert.sourceUrl)}" target="_blank" rel="noopener">Fuente queja</a>
            · score ${escapeHtml(String(alert.frustrationScore ?? '—'))}
            ${alert._demo ? ' · ejemplo' : ''}
            ${alert._synthetic ? ' · simulado' : ''}
            ${alert._source === 'hackernews' ? ' · hn' : ''}
            ${alert._source === 'reddit' ? ' · reddit' : ''}
            ${alert._source === 'page' ? ' · página' : ''}
          </p>
        </div>
      </div>
      <p class="rl-muted">Queja del cliente del rival</p>
      <p>${escapeHtml(alert.originalComplaint)}</p>
      <p class="rl-muted">Pitches de captación (elegí uno)</p>
      <div class="rl-pitch-list" data-pitch-root="1"></div>
    `;

    const img = node.querySelector('.rl-comp-logo');
    if (img) {
      img.addEventListener('error', () => {
        img.src = lookupCompetitorProfile(alert.competitorName)?.logoUrl || img.src;
        img.onerror = null;
      });
    }

    const pitchRoot = node.querySelector('[data-pitch-root]');
    let pitches = Array.isArray(alert.salesPitches) ? alert.salesPitches : null;
    if (!pitches?.length) {
      pitches = craftSalesPitchVariants({
        companyName: company?.companyName,
        whatTheySell: company?.whatTheySell,
        keyLinks: company?.keyLinks,
        competitorName: alert.competitorName,
        complaint: alert.originalComplaint,
      });
      // Rehidratar con pitch histórico como "suave" si existía
      if (alert.salesPitch && pitches[0]) {
        pitches = pitches.map((p, i) =>
          i === 0 ? { ...p, body: alert.salesPitch, recommended: true } : { ...p, recommended: false },
        );
      }
    }

    let selectedPitch = pitches.find((p) => p.recommended) || pitches[0];

    const renderPitchCards = () => {
      if (!pitchRoot) return;
      pitchRoot.innerHTML = '';
      for (const pitch of pitches) {
        const isSel = selectedPitch?.id === pitch.id;
        const card = document.createElement('div');
        card.className = `rl-pitch${isSel ? ' is-selected' : ''}${pitch.recommended ? ' is-recommended' : ''}`;
        card.innerHTML = `
          <div class="rl-pitch__head">
            <strong>${escapeHtml(pitch.label)}</strong>
            ${pitch.recommended ? '<span class="rl-rec-badge">Recomendada</span>' : ''}
          </div>
          ${pitch.rationale ? `<p class="rl-rationale">${escapeHtml(pitch.rationale)}</p>` : ''}
          <p><em>${escapeHtml(pitch.body)}</em></p>
        `;
        card.addEventListener('click', () => {
          selectedPitch = pitch;
          renderPitchCards();
        });
        pitchRoot.appendChild(card);
      }
    };
    renderPitchCards();

    const actions = document.createElement('div');
    actions.className = 'rl-card-actions rl-card-actions--3';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'rl-btn rl-btn--primary';
    copy.textContent = 'Copiar pitch';
    copy.addEventListener('click', async () => {
      const text = selectedPitch?.body || alert.salesPitch;
      await navigator.clipboard.writeText(text);
      copy.textContent = '✓ Copiado';
      setTimeout(() => {
        copy.textContent = 'Copiar pitch';
      }, 1200);
    });

    const inject = document.createElement('button');
    inject.type = 'button';
    inject.className = 'rl-btn rl-btn--ghost';
    inject.textContent = 'Inyectar en página';
    inject.addEventListener('click', async () => {
      inject.disabled = true;
      try {
        const text = selectedPitch?.body || alert.salesPitch;
        await chrome.runtime.sendMessage({
          type: 'RL_INJECT_REPLY',
          text,
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
      b.addEventListener('click', async () => {
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
    node.appendChild(actions);
    els.feed.appendChild(node);
  }
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
      return `
      <article class="rl-comp-form" data-idx="${idx}">
        <div class="rl-comp-form__head">
          <strong>Competidor ${idx + 1}</strong>
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
      </article>`;
    })
    .join('');

  root.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
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

async function loadConfigForm() {
  const data = await storageGet([STORAGE.config, STORAGE.appsync, STORAGE.detection]);
  const cfg = data[STORAGE.config] || {};
  const appsync = data[STORAGE.appsync] || {};
  const detection = data[STORAGE.detection] || {};

  document.getElementById('cfg-user-id').value = cfg.userId || 'local-user';
  document.getElementById('cfg-name').value = cfg.company?.companyName || '';
  document.getElementById('cfg-sells').value = cfg.company?.whatTheySell || '';
  document.getElementById('cfg-links').value = (cfg.company?.keyLinks || []).join('\n');
  document.getElementById('cfg-voice').value = cfg.company?.brandVoiceNotes || '';
  renderCompetitorEditor(cfg.competitors?.length ? cfg.competitors : defaultCompetitorSeed());
  document.getElementById('cfg-gql').value = appsync.graphqlUrl || '';
  document.getElementById('cfg-rt').value = appsync.realtimeUrl || '';
  document.getElementById('cfg-key').value = appsync.apiKey || '';
  document.getElementById('cfg-sensitivity').value = detection.sensitivity || 'medium';
  document.getElementById('cfg-keywords').value = (detection.extraKeywords || []).join(', ');
  document.getElementById('cfg-ignore-hosts').value = (detection.ignoreHosts || []).join('\n');
  document.getElementById('cfg-offline').checked = detection.offlineFallback !== false;
}

document.getElementById('btn-add-competitor')?.addEventListener('click', () => {
  const current = collectCompetitorsFromForm();
  current.push(emptyCompetitorDraft());
  renderCompetitorEditor(current);
  const cards = document.querySelectorAll('.rl-comp-form');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  cards[cards.length - 1]?.querySelector('[data-field="name"]')?.focus();
});

els.form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  els.status.classList.remove('is-error');
  els.status.textContent = 'Guardando…';

  const userId = document.getElementById('cfg-user-id').value.trim();
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
    return;
  }
  const appsync = {
    graphqlUrl: document.getElementById('cfg-gql').value.trim(),
    realtimeUrl: document.getElementById('cfg-rt').value.trim(),
    apiKey: document.getElementById('cfg-key').value.trim(),
  };
  const detection = {
    sensitivity: document.getElementById('cfg-sensitivity').value,
    extraKeywords: parseKeywords(document.getElementById('cfg-keywords').value),
    ignoreHosts: document
      .getElementById('cfg-ignore-hosts')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    offlineFallback: document.getElementById('cfg-offline').checked,
  };

  const config = { userId, company, competitors };

  try {
    await storageSet({
      [STORAGE.config]: config,
      [STORAGE.appsync]: appsync,
      [STORAGE.detection]: detection,
    });

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

els.manual.addEventListener('submit', async (ev) => {
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

els.refresh.addEventListener('click', refreshAlerts);
els.alertFilter.addEventListener('change', refreshAlerts);
els.scanComp?.addEventListener('click', () => {
  void scanCompetitorMarket();
});

els.loadDemo.addEventListener('click', async () => {
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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'RL_PENDING_COMPLAINT' && message.payload) {
    analyzeComplaint(message.payload);
  }
  if (message?.type === 'RL_NEW_ALERT' || message?.type === 'RL_CAPTURE_OPPORTUNITY') {
    refreshAlerts();
    activateTab('comp');
  }
});

(async function boot() {
  await loadUiZoom();
  await loadConfigForm();
  await fillRivalSelect();
  await refreshAlerts();
  await refreshKpis();

  const pending = await storageGet([STORAGE.pending]);
  if (pending[STORAGE.pending]) {
    await analyzeComplaint(pending[STORAGE.pending]);
    await storageSet({ [STORAGE.pending]: null });
  }

  const { [STORAGE.config]: config } = await storageGet([STORAGE.config]);
  if (config?.userId) {
    chrome.runtime.sendMessage({ type: 'RL_START_SUBSCRIPTION', userId: config.userId });
  }
})();
