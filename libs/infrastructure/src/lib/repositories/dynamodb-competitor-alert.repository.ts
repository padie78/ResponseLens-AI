import { DynamoKeys } from '@responselens/common';
import type { ICompetitorAlertRepository } from '@responselens/application';
import type { CompetitorAlert } from '@responselens/domain';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

  async save(alert: CompetitorAlert): Promise<CompetitorAlert> {
    const item: AlertItem = {
      PK: DynamoKeys.userPk(alert.userId),
      SK: DynamoKeys.alertSk(alert.detectedAt, alert.alertId),
      GSI1PK: DynamoKeys.alertGsi1Pk(alert.alertId),
      GSI1SK: DynamoKeys.alertGsi1Sk(alert.userId),
      entityType: 'COMPETITOR_ALERT',
      ...alert,
    };
    await this.ddb.send(
      new PutCommand({
        TableName: coreTableName(),
        Item: item,
      }),
    );
    return alert;
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
    };
  }
}
