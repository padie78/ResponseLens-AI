import { createHash } from 'node:crypto';
import type { ScheduledHandler } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoKeys } from '@responselens/common';
import type { CompetitorProfile } from '@responselens/domain';
import {
  ConsoleLogger,
  DynamoDbUserConfigRepository,
  coreTableName,
  getDynamoDocClient,
} from '@responselens/infrastructure';
import { isExternalApisMock } from '../../../shared/external-apis-mock';

const logger = new ConsoleLogger({ source: 'intel_surfaces' });
const userConfigs = new DynamoDbUserConfigRepository();
const ddb = getDynamoDocClient();

const MAX_RIVALS = Math.min(Math.max(Number(process.env.COMPETITOR_SCAN_MAX_RIVALS) || 5, 1), 8);
const FETCH_MS = Math.min(Math.max(Number(process.env.INTEL_FETCH_TIMEOUT_MS) || 8000, 2000), 20000);

type RivalUrls = {
  name: string;
  websiteUrl: string;
  statusUrl: string;
  pricingUrl: string;
  careersUrl: string;
};

type SurfaceSnapshot = {
  rivalName: string;
  mock: boolean;
  ads: { source: 'connected' | 'demo'; active: number; rows: Array<{ headline: string; cta: string; startedAt: string }> };
  status: { source: 'connected' | 'demo'; state: string; summary: string };
  pricing: { source: 'connected' | 'demo'; hash: string; changed: boolean };
  careers: { source: 'connected' | 'demo'; openRoles: number };
  updatedAt: string;
};

function rivalKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'rival';
}

function hashText(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function hashName(name: string): number {
  let h = 2166136261;
  const s = String(name || '').toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function fetchPublic(url: string): Promise<{ ok: boolean; hash: string; text: string }> {
  if (!url) return { ok: false, hash: '', text: '' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'ResponseLensAI/0.8 (intel-surfaces)', accept: 'text/html,application/json,application/rss+xml' },
    });
    const text = await res.text();
    return { ok: res.ok, hash: hashText(text), text: text.slice(0, 80_000) };
  } catch (err) {
    logger.warn('fetch.failed', { url, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, hash: '', text: '' };
  } finally {
    clearTimeout(t);
  }
}

function countJobs(html: string): number {
  const jsonLd = html.match(/"title"\s*:\s*"[^"]+"/g);
  if (jsonLd && jsonLd.length >= 2) return jsonLd.length;
  const hits = html.match(/job|vacante|position|career/gi);
  if (!hits) return 0;
  return Math.min(80, Math.max(1, Math.round(hits.length / 8)));
}

function statusFromHtml(html: string, name: string): { state: string; summary: string } {
  const down = /\b(major outage|partial outage|degraded|incidente|ca[ií]da)\b/i.test(html);
  if (down) return { state: 'incident', summary: `Incidente detectado en status de ${name}.` };
  return { state: 'operational', summary: `Status page de ${name} operativa.` };
}

function mockAds(name: string): SurfaceSnapshot['ads'] {
  const h = hashName(name);
  const started = new Date(Date.now() - (7 + (h % 20)) * 86400000).toISOString().slice(0, 10);
  return {
    source: 'connected',
    active: 1 + (h % 3),
    rows: [
      { headline: `${name}: menos fricción`, cta: 'Ver planes', startedAt: started },
      { headline: `Equipos que salen de ${name}`, cta: 'Comparar', startedAt: started },
    ].slice(0, 1 + (h % 2)),
  };
}

function mockSurfaces(rival: RivalUrls): Omit<SurfaceSnapshot, 'updatedAt' | 'pricing'> & {
  pricing: { source: 'connected' | 'demo'; hash: string; changed: boolean };
} {
  const h = hashName(rival.name);
  const day = Math.floor(Date.now() / 86400000);
  const mock = isExternalApisMock();
  const statusOn = Boolean(rival.statusUrl);
  const pricingOn = Boolean(rival.pricingUrl);
  const careersOn = Boolean(rival.careersUrl);
  const incident = mock && statusOn && h % 9 === 0;
  return {
    rivalName: rival.name,
    mock,
    ads: mock || process.env.META_AD_LIBRARY_TOKEN ? mockAds(rival.name) : { source: 'demo', active: 0, rows: [] },
    status: statusOn
      ? {
          source: 'connected',
          state: incident ? 'incident' : 'operational',
          summary: incident ? `Incidente mock en ${rival.name}` : `Status operativa (${rival.statusUrl})`,
        }
      : { source: 'demo', state: 'unknown', summary: 'Sin status URL' },
    pricing: {
      source: pricingOn ? 'connected' : 'demo',
      hash: pricingOn ? hashText(`${rival.pricingUrl}|${Math.floor(day / 3)}`) : '',
      changed: false,
    },
    careers: careersOn
      ? { source: 'connected', openRoles: 4 + (h % 22) }
      : { source: 'demo', openRoles: 0 },
  };
}

async function loadPrevHash(userId: string, key: string): Promise<string> {
  const res = await ddb.send(
    new GetCommand({
      TableName: coreTableName(),
      Key: { PK: DynamoKeys.userPk(userId), SK: DynamoKeys.intelSk(key) },
    }),
  );
  const prev = res.Item as { pricing?: { hash?: string } } | undefined;
  return String(prev?.pricing?.hash || '');
}

async function saveSnapshot(userId: string, snap: SurfaceSnapshot): Promise<void> {
  const key = rivalKey(snap.rivalName);
  await ddb.send(
    new PutCommand({
      TableName: coreTableName(),
      Item: {
        PK: DynamoKeys.userPk(userId),
        SK: DynamoKeys.intelSk(key),
        entityType: 'INTEL_SNAPSHOT',
        userId,
        rivalName: snap.rivalName,
        ads: snap.ads,
        status: snap.status,
        pricing: snap.pricing,
        careers: snap.careers,
        mock: snap.mock,
        updatedAt: snap.updatedAt,
      },
    }),
  );
}

async function scanRival(userId: string, rival: RivalUrls): Promise<SurfaceSnapshot> {
  const mock = isExternalApisMock();
  const key = rivalKey(rival.name);
  const prevHash = await loadPrevHash(userId, key);

  if (mock) {
    const base = mockSurfaces(rival);
    const changed = Boolean(base.pricing.hash && prevHash && prevHash !== base.pricing.hash);
    return { ...base, pricing: { ...base.pricing, changed }, updatedAt: new Date().toISOString() };
  }

  const [statusRes, pricingRes, careersRes] = await Promise.all([
    rival.statusUrl ? fetchPublic(rival.statusUrl) : Promise.resolve({ ok: false, hash: '', text: '' }),
    rival.pricingUrl ? fetchPublic(rival.pricingUrl) : Promise.resolve({ ok: false, hash: '', text: '' }),
    rival.careersUrl ? fetchPublic(rival.careersUrl) : Promise.resolve({ ok: false, hash: '', text: '' }),
  ]);

  const statusParsed = rival.statusUrl && statusRes.ok
    ? statusFromHtml(statusRes.text, rival.name)
    : { state: 'unknown', summary: rival.statusUrl ? 'No se pudo leer status' : 'Sin status URL' };

  const priceHash = pricingRes.hash;
  const ads = process.env.META_AD_LIBRARY_TOKEN ? mockAds(rival.name) : { source: 'demo' as const, active: 0, rows: [] };

  return {
    rivalName: rival.name,
    mock: false,
    ads,
    status: {
      source: rival.statusUrl ? 'connected' : 'demo',
      state: statusParsed.state,
      summary: statusParsed.summary,
    },
    pricing: {
      source: rival.pricingUrl ? 'connected' : 'demo',
      hash: priceHash,
      changed: Boolean(priceHash && prevHash && prevHash !== priceHash),
    },
    careers: {
      source: rival.careersUrl ? 'connected' : 'demo',
      openRoles: careersRes.ok ? countJobs(careersRes.text) : 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

export const handler: ScheduledHandler = async () => {
  const configs = await userConfigs.listAll();
  let rivals = 0;
  let snapshots = 0;

  for (const cfg of configs) {
    const list = (cfg.competitors ?? [])
      .map((c: CompetitorProfile) => ({
        name: String(c.name || '').trim(),
        websiteUrl: String(c.websiteUrl || '').trim(),
        statusUrl: String(c.statusUrl || '').trim(),
        pricingUrl: String(c.pricingUrl || '').trim(),
        careersUrl: String(c.careersUrl || '').trim(),
      }))
      .filter((c) => c.name)
      .slice(0, MAX_RIVALS);

    for (const rival of list) {
      rivals += 1;
      const snap = await scanRival(cfg.userId, rival);
      await saveSnapshot(cfg.userId, snap);
      snapshots += 1;
    }

    logger.info('intel.pass', {
      userId: cfg.userId,
      rivals: list.length,
      mock: isExternalApisMock(),
    });
  }

  logger.info('intel.complete', {
    users: configs.length,
    rivals,
    snapshots,
    mock: isExternalApisMock(),
  });
  return { users: configs.length, rivals, snapshots };
};
