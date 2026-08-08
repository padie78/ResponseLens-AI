/**
 * Cliente GraphQL AppSync — Cognito (Authorization) o API_KEY.
 */

import { authHeaders, getSession } from './auth.js';

export async function gqlRequest({ url, apiKey, query, variables }) {
  if (!url) throw new Error('Missing AppSync url');

  const session = await getSession();
  const headers = authHeaders(session, apiKey);
  if (!headers.Authorization && !headers['x-api-key']) {
    throw new Error('Missing AppSync auth (login Cognito o API Key)');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
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
