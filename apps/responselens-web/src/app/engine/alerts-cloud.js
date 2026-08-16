/**
 * Alertas vía AppSync → DynamoDB (fuente de verdad).
 * Misma auth que SocialCrawl (API key / Cognito en Amplify).
 */

import { generateClient } from 'aws-amplify/api';
import { environment } from '../../environments/environment';
import {
  packAlertMeta,
  unpackAlertMeta,
} from '../models/alert.model';

const ALERT_FIELDS = `
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
  metaJson
`;

export function hasAlertsCloud() {
  return Boolean(environment.appsync?.endpoint && environment.appsync?.apiKey);
}

/**
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<CompetitorAlert[]>}
 */
export async function listCompetitorAlertsCloud(userId, opts = {}) {
  if (!hasAlertsCloud() || !userId) return [];
  const limit = opts.limit ?? 100;
  const data = await appsyncRequest({
    query: `
      query ListCompetitorAlerts($userId: ID!, $limit: Int) {
        listCompetitorAlerts(userId: $userId, limit: $limit) {
          ${ALERT_FIELDS}
        }
      }
    `,
    variables: { userId, limit },
  });
  const rows = data?.listCompetitorAlerts;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => fromCloudAlert(row));
}

/**
 * @param {CompetitorAlert} alert
 * @returns {Promise<CompetitorAlert>}
 */
export async function upsertCompetitorAlertCloud(alert) {
  if (!hasAlertsCloud()) {
    throw new Error('AppSync off — no se puede persistir alerta en Dynamo');
  }
  const input = toUpsertInput(alert);
  const data = await appsyncRequest({
    query: `
      mutation UpsertCompetitorAlert($input: UpsertCompetitorAlertInput!) {
        upsertCompetitorAlert(input: $input) {
          ${ALERT_FIELDS}
        }
      }
    `,
    variables: { input },
  });
  return fromCloudAlert(data?.upsertCompetitorAlert || alert);
}

/**
 * @param {CompetitorAlert[]} alerts
 */
export async function upsertCompetitorAlertsCloud(alerts) {
  const out = [];
  for (const alert of alerts || []) {
    out.push(await upsertCompetitorAlertCloud(alert));
  }
  return out;
}

/**
 * @param {string} userId
 * @param {'own'|'rival'} brandScope
 * @returns {Promise<number>}
 */
export async function clearCompetitorAlertsCloud(userId, brandScope) {
  if (!hasAlertsCloud() || !userId) return 0;
  const data = await appsyncRequest({
    query: `
      mutation ClearCompetitorAlerts($userId: ID!, $brandScope: String!) {
        clearCompetitorAlerts(userId: $userId, brandScope: $brandScope)
      }
    `,
    variables: { userId, brandScope },
  });
  return Number(data?.clearCompetitorAlerts ?? 0);
}

/**
 * @param {{ userId: string, alertId: string, status?: string, notes?: string|null }} input
 */
export async function updateCompetitorAlertCloud(input) {
  if (!hasAlertsCloud()) {
    throw new Error('AppSync off — no se puede actualizar alerta en Dynamo');
  }
  const data = await appsyncRequest({
    query: `
      mutation UpdateCompetitorAlert($input: UpdateCompetitorAlertInput!) {
        updateCompetitorAlert(input: $input) {
          ${ALERT_FIELDS}
        }
      }
    `,
    variables: { input },
  });
  return fromCloudAlert(data?.updateCompetitorAlert);
}

/**
 * @param {CompetitorAlert} alert
 */
function toUpsertInput(alert) {
  const meta = packAlertMeta(alert);
  return {
    alertId: alert.alertId,
    userId: alert.userId,
    competitorName: alert.competitorName,
    originalComplaint: alert.originalComplaint,
    sourceUrl: alert.sourceUrl || 'unknown://',
    channel: alert.channel || null,
    severity: alert.severity || 'MEDIUM',
    frustrationScore: alert.frustrationScore ?? null,
    salesPitch: alert.salesPitch || '',
    detectedAt: alert.detectedAt || new Date().toISOString(),
    status: alert.status || 'NEW',
    notes: alert.notes || null,
    brandScope: alert.brandScope || 'rival',
    sentiment: alert.sentiment || null,
    inboundSource: alert.inboundSource || 'scan',
    // AppSync AWSJSON en variables HTTP: string JSON (no object).
    metaJson: meta ? JSON.stringify(meta) : null,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {CompetitorAlert}
 */
function fromCloudAlert(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('empty_alert');
  }
  const brandScope = row.brandScope === 'own' ? 'own' : 'rival';
  const base = {
    alertId: String(row.alertId),
    userId: String(row.userId),
    competitorName: String(row.competitorName || ''),
    originalComplaint: String(row.originalComplaint || ''),
    sourceUrl: String(row.sourceUrl || ''),
    channel: String(row.channel || 'web'),
    severity: /** @type {CompetitorAlert['severity']} */ (row.severity || 'MEDIUM'),
    frustrationScore:
      typeof row.frustrationScore === 'number' ? row.frustrationScore : null,
    salesPitch: String(row.salesPitch || ''),
    detectedAt: String(row.detectedAt || new Date().toISOString()),
    status: /** @type {CompetitorAlert['status']} */ (row.status || 'NEW'),
    notes: String(row.notes || ''),
    brandScope,
    sentiment: String(row.sentiment || ''),
    inboundSource: String(row.inboundSource || 'scan'),
    metaJson: null,
    _brandScope: brandScope,
  };
  return unpackAlertMeta(/** @type {CompetitorAlert} */ (base), row.metaJson);
}

/**
 * Escucha alertas nuevas publicadas por el backend (cron / upsert remoto).
 * @param {string} userId
 * @param {(alert: import('../models/alert.model').CompetitorAlert) => void} onAlert
 * @returns {{ unsubscribe: () => void }}
 */
export function subscribeOnNewCompetitorAlert(userId, onAlert) {
  if (!hasAlertsCloud() || !userId || typeof onAlert !== 'function') {
    return { unsubscribe() {} };
  }

  const client = generateClient();
  /** @type {{ unsubscribe: () => void } | null} */
  let sub = null;

  try {
    const observable = client.graphql({
      query: `
        subscription OnNewCompetitorAlert($userId: ID!) {
          onNewCompetitorAlert(userId: $userId) {
            ${ALERT_FIELDS}
          }
        }
      `,
      variables: { userId },
      authMode: 'apiKey',
    });

    if (observable && typeof observable.subscribe === 'function') {
      sub = observable.subscribe({
        next: (msg) => {
          const row = msg?.data?.onNewCompetitorAlert;
          if (!row) return;
          try {
            onAlert(fromCloudAlert(row));
          } catch {
            /* ignore malformed */
          }
        },
        error: () => {
          /* caller may reload periodically */
        },
      });
    }
  } catch {
    /* no-op */
  }

  return {
    unsubscribe() {
      try {
        sub?.unsubscribe();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * @param {{ query: string, variables?: Record<string, unknown> }} body
 */
async function appsyncRequest(body) {
  const endpoint = environment.appsync.endpoint;
  const apiKey = environment.appsync.apiKey;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`AppSync HTTP ${res.status}`);
  }
  if (Array.isArray(json.errors) && json.errors.length) {
    throw new Error(json.errors[0]?.message || 'appsync_error');
  }
  return json.data;
}
