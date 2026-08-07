const FRUSTRATION_WORDS = [
  'falla',
  'caída',
  'estafa',
  'outage',
  'scam',
  'horrible',
  'terrible',
  'broken',
  'refund',
  'downtime',
];

const FRUSTRATION_RE =
  /\b(falla|fall[oó]|ca[ií]da|outage|downtime|estafa|me\s+cambio|no\s+funciona|terrible|awful|scam|refund|horrible|pésim|basura|caro|broken)\b/i;

export type ExternalMention = {
  id?: string;
  text: string;
  sourceUrl: string;
  channel?: string;
  detectedAt?: string;
};

function scoreFrustration(text: string): number {
  const hits = text.match(new RegExp(FRUSTRATION_RE.source, 'gi'));
  if (!hits?.length) return 0;
  return Number(Math.min(0.35 + hits.length * 0.2, 0.95).toFixed(2));
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hacker News via Algolia — queries simples (OR compuesto devolvía 0 hits). */
export async function fetchHnMentions(
  competitorName: string,
  limit = 6,
): Promise<ExternalMention[]> {
  const name = competitorName.trim();
  if (!name) return [];

  const queries = [
    `${name} scam`,
    `${name} outage`,
    `${name} broken`,
    `${name} terrible`,
    `${name} estafa`,
    `${name} falla`,
  ];

  const byId = new Map<string, ExternalMention>();

  for (const query of queries) {
    if (byId.size >= limit) break;
    const url =
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
      `&tags=comment&hitsPerPage=${Math.min(8, limit)}`;

    let json: { hits?: Array<Record<string, unknown>> };
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ResponseLensAI/0.1 (competitor-scan; B2B SaaS)',
        },
      });
      if (!res.ok) continue;
      json = (await res.json()) as { hits?: Array<Record<string, unknown>> };
    } catch {
      continue;
    }

    const hits = Array.isArray(json.hits) ? json.hits : [];
    for (const hit of hits) {
      const text = stripHtml(
        String(hit.comment_text || hit.title || hit.story_title || ''),
      );
      if (!text || text.length < 24) continue;
      if (!text.toLowerCase().includes(name.toLowerCase())) continue;
      if (
        scoreFrustration(text) < 0.35 &&
        !/\b(scam|outage|broken|terrible|horrible|estafa|falla|refund)\b/i.test(text)
      ) {
        continue;
      }

      const objectId = String(hit.objectID || hit.story_id || '');
      if (!objectId || byId.has(objectId)) continue;

      const sourceUrl = hit.story_url
        ? String(hit.story_url)
        : `https://news.ycombinator.com/item?id=${objectId}`;

      byId.set(objectId, {
        id: `hn_${objectId}`,
        text: text.slice(0, 2000),
        sourceUrl,
        channel: 'hackernews',
        detectedAt: hit.created_at ? String(hit.created_at) : new Date().toISOString(),
      });
    }
  }

  return [...byId.values()].slice(0, limit);
}

/** Reddit search público (best-effort; a menudo 403 desde cloud). */
export async function fetchRedditMentions(
  competitorName: string,
  limit = 6,
): Promise<ExternalMention[]> {
  const name = competitorName.trim();
  if (!name) return [];

  const q = `${name} (${FRUSTRATION_WORDS.join(' OR ')})`;
  const url =
    `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${limit}&t=month&type=link&raw_json=1`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ResponseLensAI/0.1 (competitor-scan; B2B SaaS)',
    },
  });

  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) throw new Error('Reddit blocked JSON');

  const json = (await res.json()) as {
    data?: { children?: Array<{ data?: Record<string, unknown> }> };
  };

  const children = json?.data?.children;
  if (!Array.isArray(children)) return [];

  const out: ExternalMention[] = [];
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
      ? `https://www.reddit.com${String(d.permalink)}`
      : String(d.url || 'https://www.reddit.com');

    const created = Number(d.created_utc);
    out.push({
      id: d.id ? `reddit_${String(d.id)}` : undefined,
      text,
      sourceUrl: permalink,
      channel: 'reddit',
      detectedAt: Number.isFinite(created)
        ? new Date(created * 1000).toISOString()
        : new Date().toISOString(),
    });
  }

  return out;
}

export async function fetchLiveMentions(competitorName: string): Promise<ExternalMention[]> {
  const out: ExternalMention[] = [];
  try {
    out.push(...(await fetchHnMentions(competitorName, 5)));
  } catch {
    /* continue */
  }
  try {
    out.push(...(await fetchRedditMentions(competitorName, 4)));
  } catch {
    /* continue */
  }
  return out;
}

export function buildSyntheticMentions(competitorName: string): ExternalMention[] {
  const name = competitorName.trim() || 'el rival';
  const now = Date.now();
  const templates = [
    `Llevo horas con ${name} caído y el soporte no responde. Si conocen una alternativa seria, avisen.`,
    `${name} me cobró de más otra vez. Esto es una estafa. Me cambio sí o sí.`,
    `La experiencia con ${name} es horrible: fallas constantes y nadie se hace cargo. ¿Recomendaciones?`,
  ];
  return templates.map((text, i) => ({
    id: `synth_${name.toLowerCase().replace(/\s+/g, '_')}_${i}`,
    text,
    sourceUrl: `synthetic://competitor-scan/${encodeURIComponent(name)}/${i}`,
    channel: i === 1 ? 'x' : 'reddit',
    detectedAt: new Date(now - (i + 1) * 45e5).toISOString(),
  }));
}
