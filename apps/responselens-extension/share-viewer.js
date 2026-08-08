import { decodeShareToken, getSharePackage } from './lib/integrations.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPack(pack) {
  const view = document.getElementById('share-view');
  const meta = document.getElementById('share-meta');
  const err = document.getElementById('share-error');
  if (err) err.hidden = true;
  if (!pack) {
    if (view) view.hidden = true;
    if (err) {
      err.hidden = false;
      err.textContent = 'Paquete no encontrado o expirado.';
    }
    return;
  }
  if (meta) {
    meta.textContent = `${pack.kind} · expira ${pack.expiresAt || '—'} · ${pack.shareId}`;
  }
  const d = pack.data || {};
  let body = '';
  if (pack.kind === 'rival_ficha') {
    body = `
      <h1 style="font-size:18px;margin:0 0 8px">${escapeHtml(pack.title)}</h1>
      <p class="rl-muted">${escapeHtml(d.voiceLine || '')}</p>
      <p><strong>Percepción</strong> ${escapeHtml(String(d.perceptionScore ?? '—'))}
         · <strong>Frustración</strong> ${escapeHtml(String(d.avgFrustration ?? '—'))}
         · <strong>Churn</strong> ${escapeHtml(String(d.switchIntentPct ?? '—'))}%</p>
      <h3>Conclusiones</h3>
      <ul>${(d.conclusions || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      <h3>Informe</h3>
      <pre>${escapeHtml(d.reportMarkdown || JSON.stringify(d, null, 2))}</pre>
    `;
  } else {
    body = `
      <h1 style="font-size:18px;margin:0 0 8px">${escapeHtml(pack.title)}</h1>
      <p><strong>Rival:</strong> ${escapeHtml(d.competitorName || '—')}</p>
      <p><strong>Estado:</strong> ${escapeHtml(d.status || '—')}
         · <strong>Severidad:</strong> ${escapeHtml(d.severity || '—')}</p>
      <p class="rl-muted">${escapeHtml(d.channel || '')} · ${escapeHtml(d.sourceUrl || '')}</p>
      <h3>Queja</h3>
      <p>${escapeHtml(d.originalComplaint || '')}</p>
      ${d.salesPitch ? `<h3>Pitch</h3><pre>${escapeHtml(d.salesPitch)}</pre>` : ''}
    `;
  }
  if (view) {
    view.hidden = false;
    view.innerHTML = body;
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const tokenParam = params.get('token');
  if (id) {
    renderPack(await getSharePackage(id));
  } else if (tokenParam) {
    renderPack(decodeShareToken(tokenParam));
  } else {
    document.getElementById('share-meta').textContent = 'Pegá un token o abrí un link con ?id=';
  }

  document.getElementById('btn-load-token')?.addEventListener('click', () => {
    const raw = document.getElementById('share-token')?.value?.trim();
    renderPack(decodeShareToken(raw));
  });
}

void boot();
