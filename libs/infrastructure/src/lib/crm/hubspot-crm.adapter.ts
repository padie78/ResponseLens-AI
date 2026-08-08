import type { CrmOpportunityPayload, CrmPushResult, ICrmPort } from '@responselens/application';

/**
 * HubSpot CRM (Private App token): crea Contact + Note asociada.
 * Scopes tipicos: crm.objects.contacts.write, crm.objects.contacts.read, crm.objects.notes.write
 */
export class HubSpotCrmAdapter implements ICrmPort {
  readonly providerId = 'hubspot';

  constructor(private readonly accessToken: string) {}

  async pushOpportunity(payload: CrmOpportunityPayload): Promise<CrmPushResult> {
    if (!this.accessToken?.trim()) {
      return { provider: this.providerId, ok: false, detail: 'Missing HubSpot token' };
    }

    const email =
      `rl.${payload.alertId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}@responselens.local`.toLowerCase();
    const noteBody = [
      `ResponseLens · Oportunidad vs ${payload.competitorName}`,
      '',
      `Severidad: ${payload.severity || '—'} · Canal: ${payload.channel || '—'}`,
      `Fuente: ${payload.sourceUrl || '—'}`,
      '',
      'Queja:',
      payload.originalComplaint,
      '',
      payload.salesPitch ? `Pitch sugerido:\n${payload.salesPitch}` : '',
      payload.reportMarkdown ? `\n---\n${payload.reportMarkdown.slice(0, 4000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contactRes = await hubspotFetch(this.accessToken, '/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          email,
          firstname: 'Lead',
          lastname: payload.competitorName.slice(0, 80),
          company: payload.companyName || '',
          hs_lead_status: 'NEW',
          message: payload.originalComplaint.slice(0, 65000),
        },
      }),
    });

    if (!contactRes.ok) {
      const err = await contactRes.text().catch(() => '');
      return {
        provider: this.providerId,
        ok: false,
        detail: `Contact HTTP ${contactRes.status}: ${err.slice(0, 240)}`,
      };
    }
    const contact = (await contactRes.json()) as { id?: string };
    const contactId = contact.id;
    if (!contactId) {
      return { provider: this.providerId, ok: false, detail: 'HubSpot contact without id' };
    }

    const noteRes = await hubspotFetch(this.accessToken, '/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: String(Date.now()),
          hs_note_body: noteBody.slice(0, 65000),
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          },
        ],
      }),
    });

    if (!noteRes.ok) {
      const err = await noteRes.text().catch(() => '');
      return {
        provider: this.providerId,
        ok: true,
        externalId: contactId,
        detail: `Contact OK; note failed HTTP ${noteRes.status}: ${err.slice(0, 160)}`,
      };
    }

    return {
      provider: this.providerId,
      ok: true,
      externalId: contactId,
      detail: 'Contact + note created',
    };
  }
}

async function hubspotFetch(token: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
