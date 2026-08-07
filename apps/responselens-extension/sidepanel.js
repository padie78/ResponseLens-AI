/**
 * Side Panel — Ops KPIs, triage, historial, workflow de alertas, fallback offline.
 */

import { gqlRequest } from './lib/appsync-client.js';
import { buildLocalReplyOptions } from './lib/local-fallback.js';
import { DEMO_ALERTS, computeOpsStats } from './lib/ops-stats.js';

const STORAGE = {
  config: 'rl_user_config',
  alerts: 'rl_competitor_alerts',
  pending: 'rl_pending_complaint',
  appsync: 'rl_appsync',
  history: 'rl_reply_history',
  detection: 'rl_detection',
};

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
  alertFilter: document.getElementById('alert-filter'),
  manual: document.getElementById('own-manual'),
  exportHist: document.getElementById('btn-export-history'),
  kpis: {
    replies: document.getElementById('kpi-replies'),
    alerts: document.getElementById('kpi-alerts'),
    critical: document.getElementById('kpi-critical'),
    escalations: document.getElementById('kpi-escalations'),
  },
};

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

function renderCards(result) {
  const options = result.options || [];
  const complaintId = result.complaintId;
  const blockPublic =
    result.triage?.recommendedAction === 'ESCALATE_LEGAL' ||
    result.triage?.recommendedAction === 'ESCALATE_SAFETY' ||
    result.triage?.recommendedAction === 'NO_ENGAGE';

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
    card.className = 'rl-card';
    card.innerHTML = `
      <h3>${escapeHtml(opt.label)}</h3>
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
    injectBtn.className = 'rl-btn rl-btn--primary';
    injectBtn.textContent = blockPublic ? 'Inyectar igual' : 'Inyectar';
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
          label: opt.label,
          body: opt.body,
          channel: result.channel || currentComplaint?.channel,
          sourceUrl: result.sourceUrl || currentComplaint?.sourceUrl,
          originalText: result.originalText || currentComplaint?.text,
          recommendedAction: result.triage?.recommendedAction,
          riskLevel: result.triage?.riskLevel,
          injectResult: res?.reason || (res?.ok ? 'ok' : 'unknown'),
          model: result.model,
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
      '<div class="rl-empty">Aún no hay respuestas inyectadas/copiadas registradas.</div>';
    return;
  }
  for (const item of list) {
    const node = document.createElement('article');
    node.className = 'rl-alert';
    node.innerHTML = `
      <header>
        <strong>${escapeHtml(item.label || item.tone || 'Respuesta')}</strong>
        <span class="rl-badge">${escapeHtml(item.riskLevel || '—')}</span>
      </header>
      <p class="rl-muted">${escapeHtml(item.at || '')} · ${escapeHtml(item.channel || '')}</p>
      <p>${escapeHtml((item.body || '').slice(0, 220))}${(item.body || '').length > 220 ? '…' : ''}</p>
      <p class="rl-muted">${escapeHtml(ACTION_LABELS[item.recommendedAction] || item.recommendedAction || '')}</p>
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
  const data = await storageGet([STORAGE.alerts]);
  const filter = els.alertFilter?.value || 'OPEN';
  let alerts = data[STORAGE.alerts] || [];
  alerts = alerts.filter((a) => matchesAlertFilter(a, filter));
  renderAlerts(alerts);
  await refreshKpis();
}

function renderAlerts(alerts) {
  els.feed.innerHTML = '';
  if (!alerts?.length) {
    els.feed.innerHTML =
      '<div class="rl-empty">Sin oportunidades. Usa <strong>Demo</strong> para simular captación o espera el cron AppSync.</div>';
    return;
  }

  for (const alert of alerts) {
    const node = document.createElement('article');
    node.className = 'rl-alert';
    node.dataset.alertId = alert.alertId;
    node.innerHTML = `
      <header>
        <strong>${escapeHtml(alert.competitorName)}</strong>
        <span class="rl-badge rl-badge--${escapeHtml(String(alert.severity || 'HIGH').toLowerCase())}">
          ${escapeHtml(alert.severity || 'HIGH')} · ${escapeHtml(alert.status || 'NEW')}
        </span>
      </header>
      <p>${escapeHtml(alert.originalComplaint)}</p>
      <p><em>${escapeHtml(alert.salesPitch)}</em></p>
      <p class="rl-muted">
        <a href="${escapeHtml(alert.sourceUrl)}" target="_blank" rel="noopener">Fuente</a>
        · ${escapeHtml(alert.detectedAt || '')}
        ${alert._demo ? ' · demo' : ''}
      </p>
    `;

    const actions = document.createElement('div');
    actions.className = 'rl-card-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'rl-btn rl-btn--ghost';
    copy.textContent = 'Copiar pitch';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(alert.salesPitch);
      copy.textContent = 'Copiado';
      setTimeout(() => {
        copy.textContent = 'Copiar pitch';
      }, 1000);
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
      mkStatusBtn('Contactado', 'CONTACTED'),
      mkStatusBtn('Ganado', 'WON'),
      mkStatusBtn('Descartar', 'DISMISSED'),
    );
    node.appendChild(actions);
    els.feed.appendChild(node);
  }
}

async function updateAlertStatus(alertId, status) {
  const data = await storageGet([STORAGE.alerts]);
  const list = Array.isArray(data[STORAGE.alerts]) ? data[STORAGE.alerts] : [];
  const next = list.map((a) => (a.alertId === alertId ? { ...a, status } : a));
  await storageSet({ [STORAGE.alerts]: next });
  await refreshAlerts();
}

function parseCompetitors(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, aliasesPart] = line.split('|').map((s) => s.trim());
      return {
        name: namePart,
        aliases: aliasesPart
          ? aliasesPart.split(',').map((a) => a.trim()).filter(Boolean)
          : [],
      };
    });
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
  document.getElementById('cfg-competitors').value = (cfg.competitors || [])
    .map((c) => (c.aliases?.length ? `${c.name} | ${c.aliases.join(',')}` : c.name))
    .join('\n');
  document.getElementById('cfg-gql').value = appsync.graphqlUrl || '';
  document.getElementById('cfg-rt').value = appsync.realtimeUrl || '';
  document.getElementById('cfg-key').value = appsync.apiKey || '';
  document.getElementById('cfg-sensitivity').value = detection.sensitivity || 'medium';
  document.getElementById('cfg-keywords').value = (detection.extraKeywords || []).join(', ');
  document.getElementById('cfg-ignore-hosts').value = (detection.ignoreHosts || []).join('\n');
  document.getElementById('cfg-offline').checked = detection.offlineFallback !== false;
}

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
  const competitors = parseCompetitors(document.getElementById('cfg-competitors').value);
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
    els.status.textContent = 'Configuración guardada (local + cloud + detección).';
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

els.refresh.addEventListener('click', refreshAlerts);
els.alertFilter.addEventListener('change', refreshAlerts);

els.loadDemo.addEventListener('click', async () => {
  const data = await storageGet([STORAGE.alerts]);
  const existing = data[STORAGE.alerts] || [];
  const merged = [
    ...DEMO_ALERTS,
    ...existing.filter((a) => !DEMO_ALERTS.some((d) => d.alertId === a.alertId)),
  ];
  await storageSet({ [STORAGE.alerts]: merged });
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
  if (message?.type === 'RL_NEW_ALERT') {
    refreshAlerts();
    activateTab('comp');
  }
});

(async function boot() {
  await loadConfigForm();
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
