/**
 * Escaneo de menciones competitivas (MVP).
 * 1) Hacker News (Algolia, sin API key)
 * 2) Reddit search (best-effort; a menudo bloqueado)
 * 3) Fallback sintético etiquetado
 */

import { buildOpportunity, scoreFrustration } from './competitor-opportunity.js';

const FRUSTRATION_WORDS = [
  'scam',
  'outage',
  'broken',
  'terrible',
  'horrible',
  'refund',
  'downtime',
  'falla',
  'estafa',
];

const SYNTHETIC_TEMPLATES = [
  {
    channel: 'reddit',
    complaint: (name) =>
      `Llevo horas con ${name} caído y el soporte no responde. Si conocen una alternativa seria, avisen.`,
  },
  {
    channel: 'x',
    complaint: (name) =>
      `${name} me cobró de más otra vez. Esto es una estafa. Me cambio sí o sí.`,
  },
  {
    channel: 'web',
    complaint: (name) =>
      `La experiencia con ${name} es horrible: fallas constantes y nadie se hace cargo. ¿Recomendaciones?`,
  },
];

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Varias queries simples: Algolia no rankea bien el OR en español/inglés junto.
 * @param {string} competitorName
 * @param {{ limit?: number }} [opts]
 */
export async function fetchHnMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(competitorName || '').trim();
  if (!name) return [];

  const queries = [
    `${name} scam`,
    `${name} outage`,
    `${name} broken`,
    `${name} terrible`,
    `${name} estafa`,
    `${name} falla`,
  ];

  const byId = new Map();

  for (const query of queries) {
    if (byId.size >= limit) break;
    const url =
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
      `&tags=comment&hitsPerPage=${Math.min(8, limit)}`;

    let json;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      json = await res.json();
    } catch {
      continue;
    }

    const hits = Array.isArray(json?.hits) ? json.hits : [];
    for (const hit of hits) {
      const text = stripHtml(hit.comment_text || hit.title || hit.story_title || '');
      if (!text || text.length < 24) continue;
      if (!text.toLowerCase().includes(name.toLowerCase())) continue;
      // Umbral bajo: la query ya acotó frustración
      if (scoreFrustration(text) < 0.35 && !/\b(scam|outage|broken|terrible|horrible|estafa|falla|refund)\b/i.test(text)) {
        continue;
      }

      const objectId = hit.objectID || hit.story_id;
      if (!objectId || byId.has(String(objectId))) continue;

      const sourceUrl = hit.story_url
        || (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : 'https://news.ycombinator.com');

      byId.set(String(objectId), {
        id: `hn_${objectId}`,
        text: text.slice(0, 2000),
        sourceUrl,
        channel: 'hackernews',
        detectedAt: hit.created_at || new Date().toISOString(),
      });
    }
  }

  return [...byId.values()].slice(0, limit);
}

/**
 * @param {string} competitorName
 * @param {{ limit?: number }} [opts]
 */
export async function fetchRedditMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 5;
  const name = String(competitorName || '').trim();
  if (!name) return [];

  const q = `${name} (${FRUSTRATION_WORDS.join(' OR ')})`;
  const url =
    `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${limit}&t=month&type=link&raw_json=1`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) throw new Error('Reddit blocked JSON');

  const json = await res.json();
  const children = json?.data?.children;
  if (!Array.isArray(children)) return [];

  const mentions = [];
  for (const child of children) {
    const d = child?.data;
    if (!d) continue;
    const title = String(d.title || '').trim();
    const selftext = String(d.selftext || '').trim();
    const text = [title, selftext].filter(Boolean).join('\n').slice(0, 2000);
    if (!text) continue;
    if (!text.toLowerCase().includes(name.toLowerCase())) continue;
    if (scoreFrustration(text) < 0.5) continue;

    const permalink = d.permalink
      ? `https://www.reddit.com${d.permalink}`
      : d.url || 'https://www.reddit.com';

    mentions.push({
      id: `reddit_${d.id || Math.random().toString(36).slice(2, 9)}`,
      text,
      sourceUrl: permalink,
      channel: 'reddit',
      detectedAt: d.created_utc
        ? new Date(Number(d.created_utc) * 1000).toISOString()
        : new Date().toISOString(),
    });
  }

  return mentions;
}

function buildSyntheticMentions(competitorName) {
  const name = String(competitorName || 'el rival').trim();
  const now = Date.now();
  return SYNTHETIC_TEMPLATES.map((t, i) => ({
    id: `synth_${name.toLowerCase().replace(/\s+/g, '_')}_${i}`,
    text: t.complaint(name),
    sourceUrl: `synthetic://competitor-scan/${encodeURIComponent(name)}/${i}`,
    channel: t.channel,
    detectedAt: new Date(now - (i + 1) * 45e5).toISOString(),
    synthetic: true,
  }));
}

async function fetchLiveMentions(competitorName) {
  const collected = [];
  const errors = [];

  try {
    collected.push(...(await fetchHnMentions(competitorName, { limit: 5 })));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    collected.push(...(await fetchRedditMentions(competitorName, { limit: 4 })));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { mentions: collected, errors };
}

/**
 * Escanea un set de competidores → oportunidades con pitch.
 */
export async function runCompetitorScan({
  company,
  userId,
  competitors,
  pageMentions = [],
  preferSyntheticFallback = true,
} = {}) {
  const list = Array.isArray(competitors) && competitors.length ? competitors : [];
  const opportunities = [];
  const stats = {
    hn: 0,
    reddit: 0,
    page: 0,
    synthetic: 0,
    competitors: list.length,
  };
  const seen = new Set();

  const pushOpp = (partial, flags = {}) => {
    const key = `${partial.competitorName}::${String(partial.complaint).slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const opp = buildOpportunity({
      ...partial,
      company,
      userId,
      competitors: list,
      demo: false,
      alertId: partial.alertId || null,
      detectedAt: partial.detectedAt || null,
    });
    if (flags.synthetic) {
      opp._synthetic = true;
      opp._source = 'synthetic';
    } else if (flags.page) {
      opp._source = 'page';
    } else if (flags.hn) {
      opp._source = 'hackernews';
    } else {
      opp._source = 'reddit';
    }
    opportunities.push(opp);
  };

  for (const raw of pageMentions) {
    if (!raw?.text || !raw?.competitorName) continue;
    pushOpp(
      {
        alertId: raw.id ? `page_${raw.id}` : null,
        competitorName: raw.competitorName,
        complaint: raw.text,
        sourceUrl: raw.sourceUrl || 'page://active-tab',
        channel: raw.channel || 'web',
        detectedAt: raw.detectedAt || new Date().toISOString(),
      },
      { page: true },
    );
    stats.page += 1;
  }

  for (const competitor of list) {
    const name = competitor?.name;
    if (!name) continue;

    const { mentions } = await fetchLiveMentions(name);

    if (mentions.length) {
      for (const m of mentions) {
        const isHn = m.channel === 'hackernews';
        pushOpp(
          {
            alertId: m.id || null,
            competitorName: name,
            complaint: m.text,
            sourceUrl: m.sourceUrl,
            channel: m.channel,
            detectedAt: m.detectedAt,
          },
          isHn ? { hn: true } : { reddit: true },
        );
        if (isHn) stats.hn += 1;
        else stats.reddit += 1;
      }
    } else if (preferSyntheticFallback) {
      for (const m of buildSyntheticMentions(name)) {
        pushOpp(
          {
            alertId: m.id,
            competitorName: name,
            complaint: m.text,
            sourceUrl: m.sourceUrl,
            channel: m.channel,
            detectedAt: m.detectedAt,
          },
          { synthetic: true },
        );
        stats.synthetic += 1;
      }
    }
  }

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats };
}
