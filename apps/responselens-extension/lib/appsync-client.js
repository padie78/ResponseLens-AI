/**
 * Cliente GraphQL mínimo para AppSync (API_KEY) — fetch nativo.
 */

export async function gqlRequest({ url, apiKey, query, variables }) {
  if (!url || !apiKey) {
    throw new Error('Missing AppSync url or apiKey');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'GraphQL error');
  }
  return json.data;
}
