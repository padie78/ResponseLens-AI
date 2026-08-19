/**
 * F4.5 — AI visibility (Prism / Otterly).
 * Mock-first: presencia en respuestas de LLMs (ChatGPT, Gemini, Perplexity).
 */

import { isExternalApisMock } from './external-apis-mock.js';

function hashKey(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LLMS = ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot'];
const QUERY_TEMPLATES = [
  'mejor alternativa a {name}',
  '{name} vs competencia',
  'qué es {name}',
  'review de {name}',
  'precio de {name}',
];

/**
 * @param {{
 *   competitor: { name: string },
 *   aiVisibilityProvider?: string,
 * }} opts
 */
export function buildAiVisibilityIntel(opts) {
  const name = String(opts.competitor?.name || '').trim();
  const provider = String(opts.aiVisibilityProvider || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean(provider && (mock || provider));
  const source = connected ? 'connected' : 'demo';

  const h = hashKey(`${name}|${provider}|aiv`);

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer: 'Sin proveedor de AI visibility. Cargá "prism" u "otterly" en Config → Integraciones.',
      provider: '',
      presenceScore: 0,
      llmMentions: [],
      queries: [],
    };
  }

  const presenceScore = 10 + (h % 80);

  const llmMentions = LLMS.map((llm, i) => {
    const mentioned = ((h + i * 19) % 3) !== 0;
    const rank = mentioned ? 1 + ((h + i * 7) % 5) : null;
    return { llm, mentioned, rank, sentiment: mentioned ? (rank <= 2 ? 'positivo' : 'neutro') : null };
  });

  const queries = QUERY_TEMPLATES.map((tpl, i) => {
    const query = tpl.replace('{name}', name);
    const appears = ((h + i * 23) % 4) !== 0;
    const position = appears ? 1 + ((h + i * 11) % 5) : null;
    return { query, appears, position };
  });

  return {
    source,
    connected: true,
    disclaimer: mock
      ? `AI visibility en mock (proveedor: ${provider}; 0 queries reales).`
      : `Conectado con ${provider}.`,
    provider,
    presenceScore,
    llmMentions,
    queries,
  };
}
