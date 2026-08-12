import { DynamoKeys } from '@responselens/common';
import type { ICompetitorAlertRepository } from '@responselens/application';
import { NotFoundError, type AlertWorkflowStatus, type CompetitorAlert } from '@responselens/domain';
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { coreTableName, getDynamoDocClient } from '../aws/dynamodb-client.factory';

type AlertItem = CompetitorAlert & {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entityType: string;
};

function normalizeMetaJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export class DynamoDbCompetitorAlertRepository implements ICompetitorAlertRepository {
  private readonly ddb = getDynamoDocClient();

  async listByUserId(userId: string, limit = 100): Promise<CompetitorAlert[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const items: AlertItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    while (items.length < safeLimit) {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: coreTableName(),
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': DynamoKeys.userPk(userId),
            ':prefix': DynamoKeys.alertSkPrefix(),
          },
          ScanIndexForward: false,
          Limit: Math.min(100, safeLimit - items.length),
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const row of res.Items ?? []) {
        items.push(row as AlertItem);
      }
      exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
      if (!exclusiveStartKey) break;
    }

    return items.slice(0, safeLimit).map((item) => this.toEntity(item));
  }

  async findByAlertId(alertId: string, userId: string): Promise<CompetitorAlert | null> {
    const item = await this.findItem(alertId, userId);
    return item ? this.toEntity(item) : null;
  }

  async save(alert: CompetitorAlert): Promise<CompetitorAlert> {
    const existing = await this.findItem(alert.alertId, alert.userId);
    const skDetectedAt = existing?.detectedAt || alert.detectedAt || new Date().toISOString();
    const metaJson =
      alert.metaJson !== undefined
        ? normalizeMetaJson(alert.metaJson)
        : normalizeMetaJson(existing?.metaJson) ?? null;
    const merged: CompetitorAlert = {
      alertId: alert.alertId,
      userId: alert.userId,
      competitorName: alert.competitorName || existing?.competitorName || 'Rival',
      originalComplaint: alert.originalComplaint || existing?.originalComplaint || '',
      sourceUrl: alert.sourceUrl || existing?.sourceUrl || 'unknown://',
      channel: alert.channel ?? existing?.channel ?? null,
      severity: alert.severity || existing?.severity || 'MEDIUM',
      frustrationScore: alert.frustrationScore ?? existing?.frustrationScore ?? null,
      salesPitch: alert.salesPitch || existing?.salesPitch || '',
      detectedAt: skDetectedAt,
      status: alert.status || existing?.status || 'NEW',
      notes: alert.notes !== undefined ? alert.notes : existing?.notes ?? null,
      brandScope: alert.brandScope ?? existing?.brandScope ?? null,
      sentiment: alert.sentiment ?? existing?.sentiment ?? null,
      inboundSource: alert.inboundSource ?? existing?.inboundSource ?? null,
      metaJson,
    };
    const item: AlertItem = {
      PK: DynamoKeys.userPk(merged.userId),
      SK: DynamoKeys.alertSk(skDetectedAt, merged.alertId),
      GSI1PK: DynamoKeys.alertGsi1Pk(merged.alertId),
      GSI1SK: DynamoKeys.alertGsi1Sk(merged.userId),
      entityType: 'COMPETITOR_ALERT',
      ...merged,
    };
    await this.ddb.send(
      new PutCommand({
        TableName: coreTableName(),
        Item: item,
      }),
    );
    return this.toEntity(item);
  }

  async updateWorkflow(input: {
    alertId: string;
    userId: string;
    status?: AlertWorkflowStatus;
    notes?: string | null;
  }): Promise<CompetitorAlert> {
    const item = await this.findItem(input.alertId, input.userId);
    if (!item) {
      throw new NotFoundError(`Alert ${input.alertId} not found`);
    }

    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];

    if (input.status) {
      names['#status'] = 'status';
      values[':status'] = input.status;
      sets.push('#status = :status');
    }
    if (input.notes !== undefined) {
      names['#notes'] = 'notes';
      values[':notes'] = input.notes;
      sets.push('#notes = :notes');
    }

    const res = await this.ddb.send(
      new UpdateCommand({
        TableName: coreTableName(),
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return this.toEntity(res.Attributes as AlertItem);
  }

  async clearByBrandScope(userId: string, brandScope: 'own' | 'rival'): Promise<number> {
    const keys: { PK: string; SK: string }[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: coreTableName(),
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': DynamoKeys.userPk(userId),
            ':prefix': DynamoKeys.alertSkPrefix(),
          },
          ProjectionExpression: 'PK, SK, brandScope',
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const row of res.Items ?? []) {
        const scope = String((row as { brandScope?: string }).brandScope || 'rival');
        const normalized = scope === 'own' ? 'own' : 'rival';
        if (normalized === brandScope) {
          keys.push({ PK: String(row.PK), SK: String(row.SK) });
        }
      }
      exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    for (const key of keys) {
      await this.ddb.send(
        new DeleteCommand({
          TableName: coreTableName(),
          Key: key,
        }),
      );
    }

    return keys.length;
  }

  private async findItem(alertId: string, userId: string): Promise<AlertItem | null> {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: coreTableName(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.alertGsi1Pk(alertId),
          ':sk': DynamoKeys.alertGsi1Sk(userId),
        },
        Limit: 1,
      }),
    );
    const raw = res.Items?.[0] as AlertItem | undefined;
    return raw || null;
  }

  private toEntity(item: AlertItem): CompetitorAlert {
    return {
      alertId: item.alertId,
      userId: item.userId,
      competitorName: item.competitorName,
      originalComplaint: item.originalComplaint,
      sourceUrl: item.sourceUrl,
      channel: item.channel ?? null,
      severity: item.severity,
      frustrationScore: item.frustrationScore ?? null,
      salesPitch: item.salesPitch,
      detectedAt: item.detectedAt,
      status: item.status || 'NEW',
      notes: item.notes ?? null,
      brandScope: item.brandScope ?? null,
      sentiment: item.sentiment ?? null,
      inboundSource: item.inboundSource ?? null,
      metaJson: normalizeMetaJson(item.metaJson),
    };
  }
}
