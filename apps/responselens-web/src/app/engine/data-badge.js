/** F2.6 — origen de dato en UI. */

export function dataBadgeKind(source) {
  if (source === 'feed') return 'feed';
  if (source === 'connected') return 'connected';
  return 'demo';
}

export function dataBadgeLabel(source) {
  if (source === 'feed') return 'Feed';
  if (source === 'connected') return 'Conectado';
  return 'Demo';
}
