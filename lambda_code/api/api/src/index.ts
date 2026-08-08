import type { AppSyncResolverHandler } from 'aws-lambda';
import {
  analyzeReply,
  analyzeRivalReport,
  getUserConfig,
  listCompetitorAlerts,
  saveUserConfig,
  updateCompetitorAlert,
  upsertCompetitorAlert,
} from './composition-root';

type Args = Record<string, unknown>;

function fieldName(event: { info?: { fieldName?: string }; fieldName?: string }): string {
  return event.info?.fieldName || event.fieldName || '';
}

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const op = fieldName(event);
  const args = (event.arguments || {}) as Args;

  switch (op) {
    case 'analyzeReply':
      return analyzeReply.execute(args.input as Parameters<typeof analyzeReply.execute>[0]);

    case 'analyzeRivalReport':
      return analyzeRivalReport.execute(
        args.input as Parameters<typeof analyzeRivalReport.execute>[0],
      );

    case 'getUserConfig':
      return getUserConfig.execute({ userId: String(args.userId) });

    case 'saveUserConfig':
      return saveUserConfig.execute(args.input as Parameters<typeof saveUserConfig.execute>[0]);

    case 'listCompetitorAlerts':
      return listCompetitorAlerts.execute({
        userId: String(args.userId),
        limit: args.limit as number | null | undefined,
      });

    case 'upsertCompetitorAlert':
      return upsertCompetitorAlert.execute(
        args.input as Parameters<typeof upsertCompetitorAlert.execute>[0],
      );

    case 'updateCompetitorAlert':
      return updateCompetitorAlert.execute(
        args.input as Parameters<typeof updateCompetitorAlert.execute>[0],
      );

    case 'ping':
      return `pong:${String(args.message ?? '')}`;

    default:
      throw new Error(`UNSUPPORTED_FIELD: ${op}`);
  }
};
