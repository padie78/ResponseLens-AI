import {
  IngestInboundMentionUseCase,
  PersistAndPublishAlertUseCase,
  type InboundMentionPayload,
} from '@responselens/application';
import {
  AppSyncCompetitorAlertPublisher,
  ConsoleLogger,
  DynamoDbCompetitorAlertRepository,
} from '@responselens/infrastructure';
import { ValidationError } from '@responselens/domain';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { timingSafeEqual } from 'crypto';

const logger = new ConsoleLogger({ source: 'mention_webhook' });
const alerts = new DynamoDbCompetitorAlertRepository();
const publisher = new AppSyncCompetitorAlertPublisher();
const persistAndPublish = new PersistAndPublishAlertUseCase(alerts, publisher);
const ingest = new IngestInboundMentionUseCase(persistAndPublish);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-responselens-secret',
  'access-control-allow-methods': 'POST,OPTIONS',
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function readSecret(headers: Record<string, string | undefined> | undefined): string {
  if (!headers) return '';
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v != null) lower[k.toLowerCase()] = v;
  }
  return (
    lower['x-responselens-secret'] ||
    lower['x-webhook-secret'] ||
    ''
  ).trim();
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const expected = (process.env.INBOUND_WEBHOOK_SECRET || '').trim();
  if (!expected) {
    logger.error('INBOUND_WEBHOOK_SECRET missing');
    return json(503, { ok: false, error: 'webhook_not_configured' });
  }

  const provided = readSecret(event.headers as Record<string, string | undefined>);
  if (!secretsMatch(provided, expected)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  let payload: InboundMentionPayload;
  try {
    const raw = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '{}';
    payload = JSON.parse(raw) as InboundMentionPayload;
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  try {
    const saved = await ingest.execute(payload);
    logger.info('mention.ingested', {
      alertId: saved.alertId,
      userId: saved.userId,
      brandScope: saved.brandScope,
      source: saved.inboundSource,
    });
    return json(202, {
      ok: true,
      alertId: saved.alertId,
      userId: saved.userId,
      brandScope: saved.brandScope || 'rival',
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { ok: false, error: err.message });
    }
    logger.error('mention.ingest_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return json(500, { ok: false, error: 'internal_error' });
  }
};
