import { DynamoKeys } from '@responselens/common';
import type { ICompetitorAlertRepository } from '@responselens/application';
import { NotFoundError, type AlertWorkflowStatus, type CompetitorAlert } from '@responselens/domain';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { coreTableName, getDynamoDocClient } from '../aws/dynamodb-client.factory';

type AlertItem = CompetitorAlert & {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entityType: string;
};

export class DynamoDbCompetitorAlertRepository implements ICompetitorAlertRepository {
  private readonly ddb = getDynamoDocClient();

  async listByUserId(userId: string, limit = 25): Promise<CompetitorAlert[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: coreTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.userPk(userId),
          ':prefix': DynamoKeys.alertSkPrefix(),
        },
        ScanIndexForward: false,
        Limit: safeLimit,
      }),
    );
    return (res.Items ?? []).map((item) => this.toEntity(item as AlertItem));
  }

  async findByAlertId(alertId: string, userId: string): Promise<CompetitorAlert | null> {
    const item = await this.findItem(alertId, userId);
    return item ? this.toEntity(item) : null;
  }

  async save(alert: CompetitorAlert): Promise<CompetitorAlert> {
    const existing = await this.findItem(alert.alertId, alert.userId);
    const skDetectedAt = existing?.detectedAt || alert.detectedAt || new Date().toISOString();
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
    };
  }
}
