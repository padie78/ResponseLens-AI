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
    /\b(scam(mer|mers)?|fraud|terrible|awful|worst|unacceptable|refund)\b/i,
    /\b(broken|doesn'?t\s+work|outage|downtime|ripoff|switch(ing)?\s+to)\b/i,
    /\b(zero\s+support|no\s+support|abysmal|shady|negligen(ce|cia)|suspend(ed|en))\b/i,
    /\b(does\s+absolutely\s+nothing|locked|nuked|harassed)\b/i,
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
    reddit: [
      '[data-testid="post-title"]',
      'shreddit-post [slot="title"]',
      '.Post h1',
      '.Comment .RichTextJSON-root',
      '[data-testid="comment"]',
      '.entry .usertext-body',
      'p',
    ],
    hackernews: [
      '.comment-tree .commtext',
      '.commtext',
      '.storytitle',
      '.titleline a',
      '.toptext',
      'td.default p',
    ],
    trustpilot: [
      '[data-service-review-text-typography]',
      '.review-content__text',
      'p',
    ],
    facebook: [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      'div[data-testid="post_message"]',
      'div[dir="auto"][style*="text-align"]',
      '[role="article"] div[dir="auto"]',
      '[role="article"] span[dir="auto"]',
    ],
    instagram: [
      'h1',
      'span[dir="auto"]',
      'div[role="button"] span',
      'ul li span',
      'article span',
    ],
    tiktok: [
      '[data-e2e="comment-level-1"]',
      '[data-e2e="comment-level-2"]',
      '[data-e2e="browse-video-desc"]',
      '[data-e2e="search-card-desc"]',
      '[data-e2e="video-desc"]',
      'p[data-e2e]',
      'span[data-e2e="comment-level-1"]',
    ],
    threads: [
      '[data-pressable-container="true"] span',
      'div[dir="auto"] span',
      '[role="article"] span[dir="auto"]',
      '[role="article"] div[dir="auto"]',
    ],
    linkedin: [
      '.comments-comment-item__main-content',
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.update-components-text',
      'span.break-words',
      '.comments-comment-item__inline-show-more-text',
    ],
    bluesky: [
      '[data-testid="postText"]',
      '[data-testid="postText"] span',
      'div[data-testid="contentHider-post"]',
      '[data-testid="reply"] div[dir="auto"]',
    ],
    glassdoor: [
      '[data-test="review-text"]',
      '[data-test="pros"]',
      '[data-test="cons"]',
      '.review-details__review--text',
      '.reviewBodyCell',
      'p.review-text',
      'span[data-test="review-text"]',
    ],
    g2: [
      '[itemprop="reviewBody"]',
      '.formatted-text',
      '.pjax',
      '.paper__text',
      'div[itemprop="reviewBody"] p',
      '.elv-tracking-normal p',
    ],
    capterra: [
      '[data-testid="review-body"]',
      '.review-content',
      '.sg-rating-full-text',
      '.i18n-translation_container p',
      'p[data-test="review-content"]',
    ],
    producthunt: [
      '[data-test="comment-body"]',
      '.styles_htmlText__',
      'div[class*="comment"] p',
      'article p',
      '[data-test="post-body"]',
    ],
    indeed: [
      '[data-testid="review-text"]',
      '.css-1cxc9zk',
      '.cmp-Review-text',
      'span[itemprop="reviewBody"]',
      '.cmp-ReviewRating-text',
    ],
    default: [
      '[role="article"] p',
      '.comment-body',
      '.review-body',
      '[data-testid="comment"]',
      'p',
    ],
  };

  const processed = new WeakSet();
  let scanTimer = null;
  let toastEl = null;
  let detection = {
    sensitivity: 'medium',
    extraKeywords: [],
    ignoreHosts: [],
    platforms: null,
  };
  let markedCount = 0;
  /** @type {Array<{ name: string, aliases?: string[] }>} */
  let competitors = [];
  let companyProfile = { companyName: 'TuMarca', whatTheySell: '' };

  const DEFAULT_RIVALS = [
    { name: 'Shopify', aliases: ['ShopFast', 'shop fast', 'shopify'] },
    { name: 'AWS', aliases: ['RivalCloud', 'rival cloud', 'Amazon Web Services', 'aws'] },
    { name: 'Mailchimp', aliases: ['MailBlast', 'mail blast', 'mailchimp'] },
  ];

  function activeCompetitors() {
    /** Fusiona semillas + config (si el form tiene rivales vacíos, no cegamos Shopify/AWS/…). */
    const byKey = new Map();
    for (const c of [...DEFAULT_RIVALS, ...(competitors || [])]) {
      const name = String(c?.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const prev = byKey.get(key);
      const aliases = [
        ...new Set([...(prev?.aliases || []), ...(c.aliases || [])].map((a) => String(a || '').trim()).filter(Boolean)),
      ];
      byKey.set(key, { name: prev?.name || name, aliases });
    }
    return [...byKey.values()];
  }

  function loadDetection() {
    try {
      chrome.storage.local.get(['rl_detection', 'rl_user_config'], (data) => {
        if (data?.rl_detection) {
          detection = {
            sensitivity: data.rl_detection.sensitivity || 'medium',
            extraKeywords: data.rl_detection.extraKeywords || [],
            ignoreHosts: data.rl_detection.ignoreHosts || [],
            platforms: data.rl_detection.platforms || null,
          };
        }
        if (data?.rl_user_config) {
          competitors = data.rl_user_config.competitors || [];
          companyProfile = data.rl_user_config.company || companyProfile;
        }
        if (isHostIgnored() || !isPlatformAllowed()) {
          reportBadge(0);
          return;
        }
        scheduleScan();
      });
    } catch {
      /* ignore */
    }
  }

  function isPlatformAllowed() {
    // Página demo propia de la extensión (fixtures/)
    if (location.protocol === 'chrome-extension:') return true;
    const prefs = detection.platforms;
    if (!prefs) return true;
    const host = location.hostname.toLowerCase().replace(/^www\./, '');

    const builtins = {
      amazon: ['amazon.com', 'amazon.es'],
      ebay: ['ebay.com', 'ebay.es'],
      youtube: ['youtube.com'],
      x: ['x.com', 'twitter.com'],
      reddit: ['reddit.com'],
      hackernews: ['news.ycombinator.com', 'ycombinator.com'],
      trustpilot: ['trustpilot.com'],
      facebook: ['facebook.com', 'fb.com'],
      instagram: ['instagram.com'],
      tiktok: ['tiktok.com'],
      threads: ['threads.net'],
      linkedin: ['linkedin.com'],
      bluesky: ['bsky.app'],
      glassdoor: ['glassdoor.com'],
      g2: ['g2.com'],
      capterra: ['capterra.com'],
      producthunt: ['producthunt.com'],
      indeed: ['indeed.com'],
    };
    for (const [id, hosts] of Object.entries(builtins)) {
      if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return prefs.pageEnabled?.[id] !== false;
      }
    }
    const custom = Array.isArray(prefs.custom) ? prefs.custom : [];
    const hit = custom.find(
      (c) => c.enabled !== false && c.host && (host === c.host || host.endsWith(`.${c.host}`)),
    );
    // Dominio custom solo si está en la lista y enabled
    if (hit) return true;
    // Host desconocido (inyección custom): permitir si hay custom enabled matching — else if injected, allow
    return custom.some((c) => c.enabled !== false && c.host && (host === c.host || host.endsWith(`.${c.host}`)));
  }

  function findCompetitorInText(text) {
    const lower = text.toLowerCase();
    for (const c of activeCompetitors()) {
      const names = [c.name, ...(c.aliases || [])].filter(Boolean);
      for (const name of names) {
        if (name && lower.includes(String(name).toLowerCase())) return c.name;
      }
    }
    return null;
  }

  function detectLang(text) {
    const t = String(text || '');
    const es = (t.match(/\b(el|la|de|que|no|me|por|con|está|falla|estafa|horrible)\b/gi) || []).length;
    const en = (t.match(/\b(the|and|is|to|of|for|not|scam|broken|terrible)\b/gi) || []).length;
    if (en > es + 1) return 'en';
    if (/[áéíóúñ¿¡]/i.test(t)) return 'es';
    return es >= en ? 'es' : 'en';
  }

  function craftPitch(competitorName, complaint) {
    const brand = companyProfile.companyName || 'TuMarca';
    const offer = companyProfile.whatTheySell || '';
    const snippet = complaint.slice(0, 100);
    const lang = detectLang(complaint);
    const theme =
      /\b(outage|downtime|ca[ií]da|falla|crash)\b/i.test(complaint)
        ? 'reliability'
        : /\b(support|soporte|ticket)\b/i.test(complaint)
          ? 'support'
          : /\b(price|precio|caro|billing|cobro|refund)\b/i.test(complaint)
            ? 'pricing'
            : /\b(scam|estafa|fraude)\b/i.test(complaint)
              ? 'trust'
              : /\b(switch|cambio|alternativa|me\s+voy)\b/i.test(complaint)
                ? 'churn'
                : 'general';
    const hookEs = {
      reliability: 'especialmente en uptime y estabilidad',
      support: 'con soporte humano que sí responde',
      pricing: 'con facturación predecible',
      trust: 'con transparencia',
      churn: 'si estás evaluando alternativas ahora',
      general: 'sin fricción innecesaria',
      product: 'con un producto más usable',
    };
    const hookEn = {
      reliability: 'especially on uptime and stability',
      support: 'with human support that actually replies',
      pricing: 'with predictable billing',
      trust: 'with transparency',
      churn: 'if you are evaluating alternatives now',
      general: 'without unnecessary friction',
      product: 'with a more usable product',
    };
    if (lang === 'en') {
      const offerEn = offer || 'a more stable alternative';
      const hook = hookEn[theme] || hookEn.general;
      return (
        `Saw your comment about ${competitorName}. ` +
        `If you're looking for ${offerEn} — ${hook}, ${brand} can help ` +
        `("${snippet}${complaint.length > 100 ? '…' : ''}"). ` +
        `Happy to support a smooth transition via DM.`
      );
    }
    const offerEs = offer || 'una alternativa más estable';
    const hook = hookEs[theme] || hookEs.general;
    return (
      `Vi tu comentario sobre ${competitorName}. ` +
      `Si buscas ${offerEs} — ${hook}, en ${brand} podemos ayudarte ` +
      `("${snippet}${complaint.length > 100 ? '…' : ''}"). ` +
      `Te acompañamos en la transición (DM).`
    );
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
    if (host.includes('reddit.')) return 'reddit';
    if (host.includes('ycombinator') || host === 'news.ycombinator.com') return 'hackernews';
    if (host.includes('trustpilot.')) return 'trustpilot';
    if (host.includes('facebook.') || host === 'fb.com' || host.endsWith('.fb.com')) return 'facebook';
    if (host.includes('instagram.')) return 'instagram';
    if (host.includes('tiktok.')) return 'tiktok';
    if (host.includes('threads.')) return 'threads';
    if (host.includes('linkedin.')) return 'linkedin';
    if (host.includes('bsky.app') || host === 'bsky.app') return 'bluesky';
    if (host.includes('glassdoor.')) return 'glassdoor';
    if (host.includes('g2.com') || host.endsWith('.g2.com')) return 'g2';
    if (host.includes('capterra.')) return 'capterra';
    if (host.includes('producthunt.')) return 'producthunt';
    if (host.includes('indeed.')) return 'indeed';
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
    const competitorName =
      payload.competitorName || findCompetitorInText(payload.text || '');
    // Queja de rival → Competencia (captación), no Control de Daños
    if (competitorName) {
      sendCaptureOpportunity({
        id: payload.id,
        text: payload.text,
        competitorName,
      });
      return;
    }
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

  function sendCaptureOpportunity(meta) {
    const frustration = scoreSeverity(meta.text) === 'low' ? 0.55 : 0.8;
    const rivals = collectRivalMentionsFromDom();
    const same = rivals.find((r) => r.name === meta.competitorName);
    chrome.runtime.sendMessage(
      {
        type: 'RL_CAPTURE_OPPORTUNITY',
        payload: {
          alertId: `cap_${Date.now().toString(36)}`,
          userId: 'local-user',
          competitorName: meta.competitorName,
          competitor: {
            name: meta.competitorName,
            websiteUrl: null,
            logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(meta.competitorName.toLowerCase().replace(/\s+/g, '') + '.com')}&sz=128`,
            description: `Competidor detectado en ${location.hostname}`,
            industry: null,
            socialHandles: [],
            weaknessNotes: 'Mencionado en queja pública con carga negativa.',
          },
          originalComplaint: meta.text,
          sourceUrl: location.href,
          channel: detectChannel(),
          severity: scoreSeverity(meta.text).toUpperCase(),
          frustrationScore: frustration,
          salesPitch: craftPitch(meta.competitorName, meta.text),
          detectedAt: new Date().toISOString(),
          status: 'NEW',
          requestRivalReport: true,
          pageMentions: same?.mentions || [
            { text: meta.text, sourceUrl: location.href, channel: detectChannel() },
          ],
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[ResponseLens]', chrome.runtime.lastError.message);
        }
      },
    );
    showToast(`Captado → Competencia: ${meta.competitorName}`);
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

  let lastRivalNotifyKey = '';
  let rivalNotifyTimer = 0;

  function collectRivalMentionsFromDom() {
    /** @type {Record<string, { name: string, mentions: object[] }>} */
    const byRival = {};
    for (const node of document.querySelectorAll(`[${RL_ATTR}].rl-highlight--capture`)) {
      if (!(node instanceof HTMLElement)) continue;
      const text = normalizeText(node.innerText || node.textContent);
      const competitorName =
        node.getAttribute('data-rl-competitor') || findCompetitorInText(text);
      if (!text || !competitorName) continue;
      if (!byRival[competitorName]) {
        byRival[competitorName] = { name: competitorName, mentions: [] };
      }
      if (byRival[competitorName].mentions.length >= 8) continue;
      byRival[competitorName].mentions.push({
        text,
        sourceUrl: location.href,
        channel: detectChannel(),
        detectedAt: new Date().toISOString(),
      });
    }
    return Object.values(byRival);
  }

  function notifyRivalsDetected() {
    window.clearTimeout(rivalNotifyTimer);
    rivalNotifyTimer = window.setTimeout(() => {
      const rivals = collectRivalMentionsFromDom();
      const key = rivals.length
        ? rivals
            .map((r) => `${r.name}:${r.mentions.length}`)
            .sort()
            .join('|')
        : `empty:${location.href}`;
      if (key === lastRivalNotifyKey) return;
      lastRivalNotifyKey = key;
      chrome.runtime
        .sendMessage({
          type: 'RL_PAGE_RIVALS_DETECTED',
          payload: {
            href: location.href,
            channel: detectChannel(),
            rivals,
            detectedAt: new Date().toISOString(),
          },
        })
        .catch(() => {});
    }, 900);
  }

  function attachCaptureButton(node, meta) {
    if (node.getAttribute('data-rl-cap') === '1') return;
    const wrap = document.createElement('span');
    wrap.className = 'rl-cap-actions';
    wrap.setAttribute(RL_BTN_ATTR, '1');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rl-action-btn rl-action-btn--capture';
    btn.title = 'ResponseLens — Captar cliente del rival (Competencia)';
    btn.setAttribute('aria-label', 'Crear oportunidad de captación en Competencia');
    btn.textContent = '🎯';
    btn.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        sendCaptureOpportunity(meta);
      },
      true,
    );

    const reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'rl-action-btn rl-action-btn--report';
    reportBtn.title = 'ResponseLens — Informe IA del rival';
    reportBtn.setAttribute('aria-label', 'Generar informe IA del rival');
    reportBtn.textContent = '📊';
    reportBtn.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rivals = collectRivalMentionsFromDom();
        const same = rivals.find((r) => r.name === meta.competitorName);
        chrome.runtime.sendMessage({
          type: 'RL_REQUEST_RIVAL_REPORT',
          payload: {
            competitorName: meta.competitorName,
            href: location.href,
            channel: detectChannel(),
            mentions: same?.mentions || [
              { text: meta.text, sourceUrl: location.href, channel: detectChannel() },
            ],
            openPanel: true,
          },
        });
        showToast(`Analizando rival: ${meta.competitorName}`);
      },
      true,
    );

    wrap.append(btn, reportBtn);
    node.appendChild(wrap);
    node.setAttribute('data-rl-cap', '1');
  }

  function markComplaint(node) {
    if (!(node instanceof HTMLElement) || processed.has(node)) return;
    if (node.closest(`[${RL_ATTR}]`)) return;

    const text = normalizeText(node.innerText || node.textContent);
    if (!isNegative(text)) return;

    processed.add(node);
    const id = uid();
    const severity = scoreSeverity(text);
    const competitorName = findCompetitorInText(text);
    node.setAttribute(RL_ATTR, id);

    if (competitorName) {
      // Módulo B: queja sobre un rival → captación
      node.classList.add('rl-highlight', 'rl-highlight--capture');
      node.setAttribute('data-rl-competitor', competitorName);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rl-sev-chip rl-sev-chip--capture';
      chip.textContent = `captar · ${competitorName}`;
      chip.title = 'Agregar a Competencia';
      chip.setAttribute(RL_BTN_ATTR, '1');
      chip.addEventListener(
        'click',
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          sendCaptureOpportunity({ id, text, competitorName });
        },
        true,
      );
      attachCaptureButton(node, { id, text, competitorName });
      if (!node.querySelector('.rl-sev-chip--capture')) node.appendChild(chip);
    } else {
      // Módulo A: canal propio
      node.classList.add('rl-highlight', `rl-highlight--${severity}`);
      const chip = document.createElement('span');
      chip.className = `rl-sev-chip rl-sev-chip--${severity}`;
      chip.textContent = severity;
      chip.setAttribute(RL_BTN_ATTR, '1');
      attachActionButton(node, { id, text, severity });
      if (!node.querySelector('.rl-sev-chip')) node.appendChild(chip);
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
    if (isHostIgnored() || !isPlatformAllowed()) {
      reportBadge(0);
      return;
    }
    const nodes = collectCandidates();
    for (const node of nodes) {
      markComplaint(node);
    }
    reportBadge(document.querySelectorAll(`[${RL_ATTR}]`).length);
    notifyRivalsDetected();
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

    if (message.type === 'RL_LIST_CAPTURE_CANDIDATES') {
      scan();
      const items = [];
      for (const node of document.querySelectorAll(`[${RL_ATTR}].rl-highlight--capture`)) {
        if (!(node instanceof HTMLElement)) continue;
        const text = normalizeText(node.innerText || node.textContent);
        const competitorName =
          node.getAttribute('data-rl-competitor') || findCompetitorInText(text);
        if (!text || !competitorName) continue;
        items.push({
          id: node.getAttribute(RL_ATTR),
          text,
          competitorName,
          sourceUrl: location.href,
          channel: detectChannel(),
          detectedAt: new Date().toISOString(),
        });
      }
      sendResponse({ ok: true, items, href: location.href, channel: detectChannel() });
      return false;
    }

    if (message.type === 'RL_DETECTION_UPDATED') {
      if (message.detection) {
        detection = {
          ...detection,
          ...message.detection,
          platforms: message.detection.platforms ?? detection.platforms,
        };
      }
      if (isHostIgnored() || !isPlatformAllowed()) {
        reportBadge(0);
        return false;
      }
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
