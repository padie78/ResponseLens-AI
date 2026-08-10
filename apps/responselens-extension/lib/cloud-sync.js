/**
 * Sync cloud (AppSync → DynamoDB) ↔ cache local (chrome.storage).
 * Fuente de verdad: AWS cuando AppSync está configurado.
 */

import { gqlRequest } from './appsync-client.js';
import { hasAppSyncCloud } from './notify.js';

const STORAGE = {
  config: 'rl_user_config',
  alerts: 'rl_competitor_alerts',
  appsync: 'rl_appsync',
};

const GET_USER_CONFIG = `
  query GetUserConfig($userId: ID!) {
    getUserConfig(userId: $userId) {
      userId
      company {
        companyName
        whatTheySell
        keyLinks
        brandVoiceNotes
      }
      competitors {
        name
        aliases
        websiteUrl
        logoUrl
        description
        industry
        socialHandles
        weaknessNotes
      }
      updatedAt
    }
  }
`;

const LIST_ALERTS = `
  query ListCompetitorAlerts($userId: ID!, $limit: Int) {
    listCompetitorAlerts(userId: $userId, limit: $limit) {
      alertId
      userId
      competitorName
      originalComplaint
      sourceUrl
      channel
      severity
      frustrationScore
      salesPitch
      detectedAt
      status
      notes
      brandScope
      sentiment
      inboundSource
    }
  }
`;

const UPSERT_ALERT = `
  mutation UpsertCompetitorAlert($input: UpsertCompetitorAlertInput!) {
    upsertCompetitorAlert(input: $input) {
      alertId
      userId
      status
      detectedAt
    }
  }
`;

const UPDATE_ALERT = `
  mutation UpdateCompetitorAlert($input: UpdateCompetitorAlertInput!) {
    updateCompetitorAlert(input: $input) {
      alertId
      status
      notes
    }
  }
`;

const PUBLISH_ALERT = `
  mutation PublishCompetitorAlert($input: PublishCompetitorAlertInput!) {
    publishCompetitorAlert(input: $input) {
      alertId
      userId
    }
  }
`;

async function getAppsync() {
  const data = await chrome.storage.local.get([STORAGE.appsync]);
  return data[STORAGE.appsync] || null;
}

function cloudReady(appsync) {
  return Boolean(appsync?.graphqlUrl && appsync?.apiKey);
}

export function toCloudAlertInput(alert, userId) {
  return {
    alertId: alert.alertId,
    userId: userId || alert.userId || 'local-user',
    competitorName: alert.competitorName,
    originalComplaint: alert.originalComplaint || '',
    sourceUrl: alert.sourceUrl || 'unknown://',
    channel: alert.channel || alert._source || null,
    severity: alert.severity || 'MEDIUM',
    frustrationScore: alert.frustrationScore ?? null,
    salesPitch: alert.salesPitch || '',
    detectedAt: alert.detectedAt || new Date().toISOString(),
    status: alert.status || 'NEW',
    notes: alert.notes || null,
    brandScope: alert.brandScope || (alert._brandScope === 'own' ? 'own' : 'rival'),
    sentiment: alert.sentiment || alert._sentiment || null,
    inboundSource: alert.inboundSource || null,
  };
}

/**
 * Hidrata config + alertas desde DynamoDB vía AppSync → cache local.
 */
export async function hydrateFromCloud(userId) {
  const appsync = await getAppsync();
  if (!cloudReady(appsync) || !userId) {
    return { ok: false, reason: 'no_cloud' };
  }

  const result = { ok: true, config: false, alerts: 0 };

  try {
    const cfgData = await gqlRequest({
      url: appsync.graphqlUrl,
      apiKey: appsync.apiKey,
      query: GET_USER_CONFIG,
      variables: { userId },
    });
    const remote = cfgData.getUserConfig;
    if (remote) {
      const local = (await chrome.storage.local.get([STORAGE.config]))[STORAGE.config] || {};
      await chrome.storage.local.set({
        [STORAGE.config]: {
          ...local,
          userId: remote.userId || userId,
          company: remote.company || local.company,
          competitors: Array.isArray(remote.competitors)
            ? remote.competitors
            : local.competitors,
          updatedAt: remote.updatedAt || local.updatedAt,
          _cloudSyncedAt: new Date().toISOString(),
        },
      });
      result.config = true;
    }
  } catch (err) {
    console.warn('[RL] hydrate config', err);
  }

  try {
    const alertData = await gqlRequest({
      url: appsync.graphqlUrl,
      apiKey: appsync.apiKey,
      query: LIST_ALERTS,
      variables: { userId, limit: 100 },
    });
    const remoteAlerts = Array.isArray(alertData.listCompetitorAlerts)
      ? alertData.listCompetitorAlerts
      : [];
    const stored = await chrome.storage.local.get([STORAGE.alerts]);
    const localAlerts = Array.isArray(stored[STORAGE.alerts]) ? stored[STORAGE.alerts] : [];

    const byId = new Map();
    for (const a of localAlerts) {
      if (a?.alertId) byId.set(a.alertId, a);
    }
    for (const a of remoteAlerts) {
      if (!a?.alertId) continue;
      const prev = byId.get(a.alertId) || {};
      byId.set(a.alertId, {
        ...prev,
        ...a,
        status: a.status || prev.status || 'NEW',
        _brandScope:
          a.brandScope === 'own' || prev._brandScope === 'own' ? 'own' : prev._brandScope || a.brandScope || undefined,
        _sentiment: a.sentiment || prev._sentiment,
        _source:
          a.inboundSource ||
          (prev._source === 'appsync' || !prev._source ? 'appsync' : prev._source),
        _cloud: true,
      });
    }
    const merged = [...byId.values()]
      .sort((a, b) => new Date(b.detectedAt || 0).getTime() - new Date(a.detectedAt || 0).getTime())
      .slice(0, 100);
    await chrome.storage.local.set({ [STORAGE.alerts]: merged });
    result.alerts = remoteAlerts.length;
  } catch (err) {
    console.warn('[RL] hydrate alerts', err);
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

/** Persiste alerta en DynamoDB (+ publish realtime best-effort). */
export async function upsertAlertToCloud(alert, userId) {
  const appsync = await getAppsync();
  if (!cloudReady(appsync)) return { ok: false, reason: 'no_cloud' };
  const input = toCloudAlertInput(alert, userId);
  try {
    await gqlRequest({
      url: appsync.graphqlUrl,
      apiKey: appsync.apiKey,
      query: UPSERT_ALERT,
      variables: { input },
    });
    try {
      await gqlRequest({
        url: appsync.graphqlUrl,
        apiKey: appsync.apiKey,
        query: PUBLISH_ALERT,
        variables: { input },
      });
    } catch {
      /* subscription optional if upsert already published */
    }
    return { ok: true };
  } catch (err) {
    console.warn('[RL] upsertAlertToCloud', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertAlertsToCloud(alerts, userId) {
  const cloud = await hasAppSyncCloud();
  if (!cloud) return { ok: false, reason: 'no_cloud', synced: 0 };
  let synced = 0;
  for (const a of alerts || []) {
    if (!a || a._demo || a._synthetic) continue;
    const res = await upsertAlertToCloud(a, userId);
    if (res.ok) synced += 1;
  }
  return { ok: true, synced };
}

export async function updateAlertStatusInCloud(alertId, userId, status, notes = undefined) {
  const appsync = await getAppsync();
  if (!cloudReady(appsync)) return { ok: false, reason: 'no_cloud' };
  try {
    await gqlRequest({
      url: appsync.graphqlUrl,
      apiKey: appsync.apiKey,
      query: UPDATE_ALERT,
      variables: {
        input: {
          alertId,
          userId,
          status,
          ...(notes !== undefined ? { notes } : {}),
        },
      },
    });
    return { ok: true };
  } catch (err) {
    console.warn('[RL] updateAlertStatusInCloud', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
