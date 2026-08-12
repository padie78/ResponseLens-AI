import type { ICompetitorAlertPublisher } from '@responselens/application';
import type { CompetitorAlert } from '@responselens/domain';
import { ConsoleLogger } from '../utils/console-logger';

const PUBLISH_MUTATION = `
  mutation PublishCompetitorAlert($input: PublishCompetitorAlertInput!) {
    publishCompetitorAlert(input: $input) {
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
    }
  }
`;

export class AppSyncCompetitorAlertPublisher implements ICompetitorAlertPublisher {
  private readonly logger = new ConsoleLogger({ source: 'appsync_alert_publisher' });

  async publish(alert: CompetitorAlert): Promise<void> {
    const url = process.env.APPSYNC_GRAPHQL_URL || '';
    const apiKey = process.env.APPSYNC_API_KEY || '';
    if (!url || !apiKey) {
      this.logger.warn('AppSync URL/API key missing; skip realtime publish', {
        alertId: alert.alertId,
      });
      return;
    }

    const input = {
      alertId: alert.alertId,
      userId: alert.userId,
      competitorName: alert.competitorName,
      originalComplaint: alert.originalComplaint,
      sourceUrl: alert.sourceUrl,
      channel: alert.channel ?? null,
      severity: alert.severity,
      frustrationScore: alert.frustrationScore ?? null,
      salesPitch: alert.salesPitch,
      detectedAt: alert.detectedAt,
      status: alert.status || 'NEW',
      notes: alert.notes ?? null,
      brandScope: alert.brandScope ?? null,
      sentiment: alert.sentiment ?? null,
      inboundSource: alert.inboundSource ?? null,
      // AppSync AWSJSON over HTTP variables expects a JSON string.
      metaJson: alert.metaJson != null ? JSON.stringify(alert.metaJson) : null,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: PUBLISH_MUTATION,
        variables: { input },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`APPSYNC_HTTP_${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`APPSYNC_GRAPHQL: ${json.errors[0].message}`);
    }
  }
}
