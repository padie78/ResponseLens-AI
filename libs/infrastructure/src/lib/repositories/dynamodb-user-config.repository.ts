import { DynamoKeys } from '@responselens/common';
import type { IUserConfigRepository } from '@responselens/application';
import type { UserConfig } from '@responselens/domain';
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { coreTableName, getDynamoDocClient } from '../aws/dynamodb-client.factory';

type ConfigItem = UserConfig & { PK: string; SK: string; entityType: string };

export class DynamoDbUserConfigRepository implements IUserConfigRepository {
  private readonly ddb = getDynamoDocClient();

  async findByUserId(userId: string): Promise<UserConfig | null> {
    const res = await this.ddb.send(
      new GetCommand({
        TableName: coreTableName(),
        Key: { PK: DynamoKeys.userPk(userId), SK: DynamoKeys.configSk() },
      }),
    );
    if (!res.Item) return null;
    return this.toEntity(res.Item as ConfigItem);
  }

  async save(config: UserConfig): Promise<UserConfig> {
    const item: ConfigItem = {
      PK: DynamoKeys.userPk(config.userId),
      SK: DynamoKeys.configSk(),
      entityType: 'USER_CONFIG',
      ...config,
    };
    await this.ddb.send(
      new PutCommand({
        TableName: coreTableName(),
        Item: item,
      }),
    );
    return config;
  }

  async listAll(): Promise<UserConfig[]> {
    const items: UserConfig[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new ScanCommand({
          TableName: coreTableName(),
          FilterExpression: 'SK = :sk AND entityType = :et',
          ExpressionAttributeValues: {
            ':sk': DynamoKeys.configSk(),
            ':et': 'USER_CONFIG',
          },
          ExclusiveStartKey,
        }),
      );
      for (const raw of res.Items ?? []) {
        items.push(this.toEntity(raw as ConfigItem));
      }
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return items;
  }

  private toEntity(item: ConfigItem): UserConfig {
    return {
      userId: item.userId,
      company: item.company,
      competitors: item.competitors ?? [],
      updatedAt: item.updatedAt,
    };
  }
}
