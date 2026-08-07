/**
 * ResponseLens AI — Content Script (Manifest V3)
 * Módulo A: detección pasiva de carga semántica negativa + inyección nativa.
 * No altera el flujo de la página salvo highlight/botón y escritura en el composer.
 */
(() => {
  'use strict';

  const RL_ATTR = 'data-rl-id';
  const RL_BTN_ATTR = 'data-rl-btn';
  const SCAN_DEBOUNCE_MS = 400;
  const MAX_NODES_PER_PASS = 80;

  /** Lexicón MVP (ES/EN) — heurística léxica; el LLM refina en el Side Panel. */
  const NEGATIVE_PATTERNS = [
    /\b(estafa|timo|fraude|horrible|pésim[oa]|peor|inaceptable)\b/i,
    /\b(queja|reclamo|reclamaci[oó]n|decepci[oó]n|indignad[oa])\b/i,
    /\b(no\s+funciona|no\s+sirve|falla|fall[oó]|bug|error|ca[ií]da)\b/i,
    /\b(reembolso|devolver|devuelvan|cancel(ar|aci[oó]n)|me\s+cambio)\b/i,
    /\b(nunca\s+m[aá]s|basura|robo|estafadores|verg[uü]enza)\b/i,
    /\b(scam|fraud|terrible|awful|worst|unacceptable|refund)\b/i,
    /\b(broken|doesn'?t\s+work|outage|downtime|ripoff|switch(ing)?\s+to)\b/i,
  ];

  /** Selectores por canal (conservadores; se amplían sin tocar la lógica core). */
  const CHANNEL_SELECTORS = {
    amazon: [
      '[data-hook="review-body"] span',
      '.review-text-content span',
      '.cr-original-review-content',
    ],
    ebay: ['.review-item-content', '.fdbk-container__details-section--item'],
    youtube: [
      '#content-text.ytd-comment-renderer',
      'yt-formatted-string#content-text',
    ],
    x: [
      '[data-testid="tweetText"]',
      'article [lang] span',
    ],
    default: [
      '[role="article"] p',
      '.comment-body',
      '.review-body',
      '[data-testid="comment"]',
    ],
  };

  const processed = new WeakSet();
  let scanTimer = null;
  let toastEl = null;
  let detection = {
    sensitivity: 'medium',
    extraKeywords: [],
    ignoreHosts: [],
  };
  let markedCount = 0;

  function loadDetection() {
    try {
      chrome.storage.local.get(['rl_detection'], (data) => {
        if (data?.rl_detection) {
          detection = {
            sensitivity: data.rl_detection.sensitivity || 'medium',
            extraKeywords: data.rl_detection.extraKeywords || [],
            ignoreHosts: data.rl_detection.ignoreHosts || [],
          };
        }
        if (isHostIgnored()) {
          reportBadge(0);
          return;
        }
        scheduleScan();
      });
    } catch {
      /* ignore */
    }
  }

  function isHostIgnored() {
    const host = location.hostname;
    return (detection.ignoreHosts || []).some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  }

  function minLenForSensitivity() {
    if (detection.sensitivity === 'high') return 8;
    if (detection.sensitivity === 'low') return 24;
    return 12;
  }

  function scoreSeverity(text) {
    let score = 0.35;
    if (/\b(estafa|fraude|scam|demanda|abogad|lawsuit)\b/i.test(text)) score += 0.35;
    if (/\b(horrible|pésim|awful|terrible|nunca m[aá]s)\b/i.test(text)) score += 0.2;
    if (/\b(reembolso|refund|chargeback|me cambio|switch)\b/i.test(text)) score += 0.15;
    if ((detection.extraKeywords || []).some((k) => k && text.toLowerCase().includes(k.toLowerCase()))) {
      score += 0.15;
    }
    score = Math.min(score, 0.98);
    if (score >= 0.85) return 'critical';
    if (score >= 0.7) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  function isNegative(text) {
    const minLen = minLenForSensitivity();
    if (!text || text.length < minLen || text.length > 4000) return false;
    if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return true;
    return (detection.extraKeywords || []).some(
      (k) => k && text.toLowerCase().includes(String(k).toLowerCase()),
    );
  }

  function reportBadge(count) {
    try {
      chrome.runtime.sendMessage({ type: 'RL_PAGE_SCAN_STATS', count, href: location.href });
    } catch {
      /* ignore */
    }
  }

  function detectChannel() {
    const host = location.hostname;
    if (host.includes('amazon.')) return 'amazon';
    if (host.includes('ebay.')) return 'ebay';
    if (host.includes('youtube.')) return 'youtube';
    if (host === 'x.com' || host.includes('twitter.')) return 'x';
    return 'default';
  }

  function uid() {
    return `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeText(raw) {
    return String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'rl-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('rl-toast--visible');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      toastEl.classList.remove('rl-toast--visible');
    }, 2800);
  }

  function getIconUrl() {
    try {
      return chrome.runtime.getURL('icons/icon16.png');
    } catch {
      return '';
    }
  }

  /**
   * Dispara eventos nativos en cascada para frameworks controlados (React/Angular/Vue).
   */
  function dispatchInputCascade(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : el instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : null;

    if (proto) {
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
    }

    const opts = { bubbles: true, cancelable: true };
    el.dispatchEvent(new Event('focus', opts));
    el.dispatchEvent(new InputEvent('beforeinput', { ...opts, inputType: 'insertText', data: value }));
    el.dispatchEvent(new InputEvent('input', { ...opts, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', opts));
    el.dispatchEvent(new KeyboardEvent('keydown', { ...opts, key: 'Unidentified' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: 'Unidentified' }));
  }

  function setContentEditable(el, text) {
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('insertText', false, text);
      if (!ok) {
        el.textContent = text;
      }
    } catch {
      el.textContent = text;
    }

    const opts = { bubbles: true, cancelable: true };
    el.dispatchEvent(new InputEvent('input', { ...opts, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', opts));
  }

  function findComposerNear(anchor) {
    const scopes = [anchor?.closest('form'), anchor?.closest('[role="dialog"]'), document];

    const selectors = [
      'textarea:not([disabled]):not([readonly])',
      'input[type="text"]:not([disabled]):not([readonly])',
      'div[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
    ];

    for (const scope of scopes) {
      if (!scope) continue;
      for (const sel of selectors) {
        const candidates = scope.querySelectorAll(sel);
        for (const el of candidates) {
          if (!(el instanceof HTMLElement)) continue;
          if (el.closest('[data-rl-ignore]')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 18) continue;
          if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
          return el;
        }
      }
    }
    return null;
  }

  async function copyFallback(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('No se encontró el editor. Texto copiado al portapapeles.');
      return true;
    } catch {
      showToast('No se pudo inyectar ni copiar. Copia manualmente desde el panel.');
      return false;
    }
  }

  async function injectReply(text, complaintId) {
    const safe = normalizeText(text);
    if (!safe) return { ok: false, reason: 'empty' };

    const anchor =
      (complaintId && document.querySelector(`[${RL_ATTR}="${CSS.escape(complaintId)}"]`)) ||
      document.activeElement;

    const composer = findComposerNear(anchor instanceof HTMLElement ? anchor : null);
    if (!composer) {
      const copied = await copyFallback(safe);
      return { ok: copied, reason: copied ? 'clipboard' : 'no_target' };
    }

    try {
      if (composer.isContentEditable || composer.getAttribute('contenteditable') === 'true') {
        setContentEditable(composer, safe);
      } else if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
        dispatchInputCascade(composer, safe);
      } else {
        setContentEditable(composer, safe);
      }
      composer.focus();
      showToast('Respuesta inyectada en el editor nativo.');
      return { ok: true, reason: 'injected' };
    } catch (err) {
      console.warn('[ResponseLens] inject failed', err);
      const copied = await copyFallback(safe);
      return { ok: copied, reason: copied ? 'clipboard' : 'error' };
    }
  }

  function openSidePanelWithComplaint(payload) {
    chrome.runtime.sendMessage(
      {
        type: 'RL_OPEN_DAMAGE_CONTROL',
        payload: {
          complaintId: payload.id,
          text: payload.text,
          sourceUrl: location.href,
          channel: detectChannel(),
          detectedAt: new Date().toISOString(),
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[ResponseLens]', chrome.runtime.lastError.message);
        }
      },
    );
  }

  function attachActionButton(node, meta) {
    if (node.getAttribute(RL_BTN_ATTR) === '1') return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rl-action-btn';
    btn.title = 'ResponseLens — Control de Daños';
    btn.setAttribute('aria-label', 'Abrir ResponseLens para responder esta queja');
    btn.setAttribute(RL_BTN_ATTR, '1');

    const img = document.createElement('img');
    img.alt = '';
    img.src = getIconUrl();
    img.width = 16;
    img.height = 16;
    btn.appendChild(img);

    btn.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        node.classList.add('rl-highlight--active');
        openSidePanelWithComplaint(meta);
      },
      true,
    );

    // Preferir sibling inline sin romper layouts flex/grid agresivos.
    if (node.parentElement && getComputedStyle(node.parentElement).display.includes('flex')) {
      node.insertAdjacentElement('afterend', btn);
    } else {
      node.appendChild(btn);
    }
    node.setAttribute(RL_BTN_ATTR, '1');
  }

  function markComplaint(node) {
    if (!(node instanceof HTMLElement) || processed.has(node)) return;
    if (node.closest(`[${RL_ATTR}]`)) return;

    const text = normalizeText(node.innerText || node.textContent);
    if (!isNegative(text)) return;

    processed.add(node);
    const id = uid();
    const severity = scoreSeverity(text);
    node.setAttribute(RL_ATTR, id);
    node.classList.add('rl-highlight', `rl-highlight--${severity}`);

    const chip = document.createElement('span');
    chip.className = `rl-sev-chip rl-sev-chip--${severity}`;
    chip.textContent = severity;
    chip.setAttribute(RL_BTN_ATTR, '1');

    attachActionButton(node, { id, text, severity });
    if (!node.querySelector('.rl-sev-chip')) {
      node.appendChild(chip);
    }
    markedCount += 1;
  }

  function collectCandidates() {
    const channel = detectChannel();
    const selectors = [
      ...(CHANNEL_SELECTORS[channel] || []),
      ...CHANNEL_SELECTORS.default,
    ];
    const seen = new Set();
    const nodes = [];

    for (const sel of selectors) {
      let list;
      try {
        list = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const el of list) {
        if (!(el instanceof HTMLElement) || seen.has(el)) continue;
        seen.add(el);
        nodes.push(el);
        if (nodes.length >= MAX_NODES_PER_PASS) return nodes;
      }
    }
    return nodes;
  }

  function scan() {
    if (isHostIgnored()) {
      reportBadge(0);
      return;
    }
    const nodes = collectCandidates();
    for (const node of nodes) {
      markComplaint(node);
    }
    reportBadge(document.querySelectorAll(`[${RL_ATTR}]`).length);
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, SCAN_DEBOUNCE_MS);
  }

  function startObserver() {
    const root = document.body || document.documentElement;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
          scheduleScan();
          return;
        }
        if (m.type === 'characterData') {
          scheduleScan();
          return;
        }
      }
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return undefined;

    if (message.type === 'RL_INJECT_REPLY') {
      injectReply(message.text, message.complaintId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    if (message.type === 'RL_PING') {
      sendResponse({
        ok: true,
        channel: detectChannel(),
        href: location.href,
        marked: document.querySelectorAll(`[${RL_ATTR}]`).length,
      });
      return false;
    }

    if (message.type === 'RL_DETECTION_UPDATED') {
      if (message.detection) detection = { ...detection, ...message.detection };
      scheduleScan();
      sendResponse({ ok: true });
      return false;
    }

    return undefined;
  });

  loadDetection();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startObserver();
      scheduleScan();
    });
  } else {
    startObserver();
    scheduleScan();
  }
})();
