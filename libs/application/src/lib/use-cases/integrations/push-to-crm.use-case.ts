import type { CrmOpportunityPayload, CrmPushResult, ICrmPort } from '../../ports/crm.port';

export class PushOpportunityToCrmUseCase {
  constructor(private readonly adapters: ICrmPort[]) {}

  async execute(payload: CrmOpportunityPayload, providerIds?: string[]): Promise<CrmPushResult[]> {
    const selected = providerIds?.length
      ? this.adapters.filter((a) => providerIds.includes(a.providerId))
      : this.adapters;
    if (!selected.length) {
      return [{ provider: 'none', ok: false, detail: 'No CRM adapters configured' }];
    }
    const results: CrmPushResult[] = [];
    for (const adapter of selected) {
      try {
        results.push(await adapter.pushOpportunity(payload));
      } catch (err) {
        results.push({
          provider: adapter.providerId,
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}
