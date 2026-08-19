/** Cuando true, no se llama a APIs externas de pago (SocialCrawl, Reddit, NewsAPI, …). */
export function isExternalApisMock(): boolean {
  const v = String(process.env.EXTERNAL_APIS_MOCK ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}
