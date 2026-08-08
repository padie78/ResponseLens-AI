import type { CrmOpportunityPayload, CrmPushResult, ICrmPort } from '@responselens/application';

/**
 * Webhook genérico: POST JSON a la URL del cliente (Zapier, Make, Salesforce Flow, etc.).
 */
export class WebhookCrmAdapter implements ICrmPort {
  readonly providerId = 'webhook';

  constructor(
    private readonly url: string,
    private readonly secret?: string,
  ) {}

  async pushOpportunity(payload: CrmOpportunityPayload): Promise<CrmPushResult> {
    if (!this.url?.startsWith('http')) {
      return { provider: this.providerId, ok: false, detail: 'Invalid webhook URL' };
    }
    const body = {
      event: 'responselens.opportunity.push',
      version: 1,
      sentAt: new Date().toISOString(),
      payload,
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ResponseLensAI/0.6',
    };
    if (this.secret) headers['X-ResponseLens-Secret'] = this.secret;

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        provider: this.providerId,
        ok: false,
        detail: `HTTP ${res.status} ${text.slice(0, 200)}`,
      };
    }
    return { provider: this.providerId, ok: true, detail: `HTTP ${res.status}` };
  }
}
