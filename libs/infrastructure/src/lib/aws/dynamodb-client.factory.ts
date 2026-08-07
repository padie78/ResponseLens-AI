import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cached: DynamoDBDocumentClient | null = null;

export function getDynamoDocClient(): DynamoDBDocumentClient {
  if (!cached) {
    cached = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cached;
}

export function coreTableName(): string {
  const name = process.env.CORE_TABLE_NAME;
  if (!name) {
    throw new Error('CORE_TABLE_NAME is required');
  }
  return name;
}
