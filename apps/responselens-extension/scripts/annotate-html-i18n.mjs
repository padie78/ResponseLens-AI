#!/usr/bin/env node
/**
 * Annotates sidepanel.html with data-i18n* attributes (idempotent-ish).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sidepanel.html');
let html = fs.readFileSync(file, 'utf8');

html = html.replace('<html lang="es">', '<html lang="es">');

/** Simple textContent replacements — only when not already annotated nearby */
const swaps = [
  // Auth
  ['Iniciá sesión para sincronizar config, alertas e historial.', 'auth.lead'],
  ['Continuar en modo local (sin nube)', 'auth.local'],
  [
    'Cognito se configura en Config (región, User Pool, Client) tras el deploy de Terraform.',
    'auth.hint',
  ],
  ['Código de verificación (email)', 'auth.verifyCode'],
  ['Listo para operar', 'shell.ready'],
  ['Seleccioná un comentario en la página, o pegá el texto abajo.', 'own.empty'],
  ['Pegar queja / review', 'own.pasteSummary'],
  ['Analizar texto', 'own.analyze'],
  ['Triaging riesgo y redactando 3 enfoques…', 'own.loader'],
  ['Oportunidades de captación desde quejas reales.', 'comp.lead'],
  ['Respuestas a quejas de tu marca.', 'own.lead'],
  ['Busca menciones negativas de rivales', 'comp.scanTitle'],
  ['Actualizar lista', 'comp.refresh'],
  ['Filtros de oportunidades', 'comp.filtersAria'],
  ['Elegí un competidor y generá el análisis (gaps, crisis, leads).', 'comp.reportHint'],
  ['Informe del rival', 'comp.reportLabel'],
  ['Generar informe', 'comp.reportGenerate'],
  ['Elegir rival para el informe', 'comp.reportSelect'],
  ['En esta pestaña', 'comp.tabTitle'],
  ['Usar esta pestaña', 'comp.useTab'],
  ['Agregar queja real (texto o link)', 'comp.manualSummary'],
  ['Pegá acá el comentario negativo que viste…', 'comp.manual.textPh'],
  ['Link a la publicación (opcional)', 'comp.manual.url'],
  ['Crear oportunidad', 'comp.manual.create'],
  ['Datos de prueba (opcional)', 'comp.demoSummary'],
  ['Solo para probar la UI sin escanear. No son menciones reales.', 'comp.demoHint'],
  ['Cargar ejemplos en lista', 'comp.demoLoad'],
  ['Simular chip en página', 'comp.demoChip'],
  ['Carga oportunidades de ejemplo en la lista', 'comp.demoLoad'],
  ['Simula el chip de captar en página', 'comp.demoChip'],
  ['Priorizá rivales según su vida digital (quejas, churn, prensa).', 'rank.lead'],
  ['Actualizar ranking', 'rank.refresh'],
  [
    'Score 0–100: más alto = más fricción pública del rival. Tocá uno para abrir el informe.',
    'rank.hint',
  ],
  ['Ranking de rivales', 'rank.aria'],
  ['← Volver', 'report.back'],
  ['Exportar CSV', 'hist.export'],
  ['¿Dónde querés compartir?', 'share.title'],
  ['A un correo concreto', 'share.email.sub'],
  ['A un número (con código de país)', 'share.wa.sub'],
  ['Incoming Webhook o copiar al canal', 'share.slack.sub'],
  ['Webhook / HubSpot configurados', 'share.crm.sub'],
  ['Sin destinatario · copiar link + token', 'share.clip.sub'],
  ['Solo en esta extensión', 'share.viewer.sub'],
  ['Abrir visor', 'share.viewer.title'],
  ['Portapapeles', 'share.clip.title'],
  ['Destinatario', 'share.recipient'],
  ['Atrás', 'share.back'],
  ['Enviar', 'share.send'],
  ['Guardar', 'cfg.save'],
  ['Cerrar sesión', 'cfg.logout'],
  ['+ Agregar competidor', 'cfg.addCompetitor'],
  ['+ Agregar plataforma', 'cfg.addPlatform'],
  ['Abrir plataformas activas en Chrome', 'cfg.openPlatforms'],
  ['Usar fallback offline si falla la nube', 'cfg.offline'],
  ['Alertas de competencia activas', 'cfg.notifyEnabled'],
  ['Notificaciones de escritorio (Chrome)', 'cfg.notifyDesktop'],
  ['Badge en el icono de la extensión', 'cfg.notifyBadge'],
  ['Incluir noticias negativas de tu marca', 'cfg.notifyOwn'],
  ['Reddit OAuth habilitado', 'cfg.redditOauth'],
  ['NewsAPI habilitado', 'cfg.newsapi'],
  ['Webhook habilitado', 'cfg.crmWebhook'],
  ['HubSpot habilitado', 'cfg.crmHubspot'],
  ['Auto-push al captar (🎯)', 'cfg.crmAutopush'],
  ['Contactos para compartir', 'cfg.shareContacts'],
  ['Pega aquí el texto negativo…', 'own.textPh'],
  ['Texto en queja…', 'comp.filter.searchPh'],
  ['Restablecer 100%', 'shell.zoomReset'],
  ['Reducir zoom', 'shell.zoomOut'],
  ['Ampliar zoom', 'shell.zoomIn'],
  ['Tamaño de interfaz', 'shell.zoom'],
  ['Indicadores operativos', 'shell.kpis'],
  ['Módulos', 'nav.modules'],
];

// For title/placeholder/aria we need attribute form — handled in structured patch below.

function wrapText(tagOpenRe, key, flags = 'g') {
  // no-op helper placeholder
}

// Attribute patches
const attrPatches = [
  [/aria-label="Tamaño de interfaz"/g, 'aria-label="Tamaño de interfaz" data-i18n-aria-label="shell.zoom"'],
  [/title="Reducir" aria-label="Reducir zoom"/g, 'title="Reducir" data-i18n-title="shell.zoomOut" aria-label="Reducir zoom" data-i18n-aria-label="shell.zoomOut"'],
  [/title="Restablecer 100%"/g, 'title="Restablecer 100%" data-i18n-title="shell.zoomReset"'],
  [/title="Ampliar" aria-label="Ampliar zoom"/g, 'title="Ampliar" data-i18n-title="shell.zoomIn" aria-label="Ampliar zoom" data-i18n-aria-label="shell.zoomIn"'],
  [/aria-label="Indicadores operativos"/g, 'aria-label="Indicadores operativos" data-i18n-aria-label="shell.kpis"'],
  [/aria-label="Módulos"/g, 'aria-label="Módulos" data-i18n-aria-label="nav.modules"'],
  [/title="Busca menciones negativas de rivales"/g, 'title="Busca menciones negativas de rivales" data-i18n-title="comp.scanTitle"'],
  [/title="Actualizar lista"/g, 'title="Actualizar lista" data-i18n-title="comp.refresh"'],
  [/aria-label="Filtros de oportunidades"/g, 'aria-label="Filtros de oportunidades" data-i18n-aria-label="comp.filtersAria"'],
  [/placeholder="Pega aquí el texto negativo…"/g, 'placeholder="Pega aquí el texto negativo…" data-i18n-placeholder="own.textPh"'],
  [/placeholder="Texto en queja…"/g, 'placeholder="Texto en queja…" data-i18n-placeholder="comp.filter.searchPh"'],
  [/placeholder="Pegá acá el comentario negativo que viste…"/g, 'placeholder="Pegá acá el comentario negativo que viste…" data-i18n-placeholder="comp.manual.textPh"'],
  [/aria-label="Elegir rival para el informe"/g, 'aria-label="Elegir rival para el informe" data-i18n-aria-label="comp.reportSelect"'],
  [/title="Actualizar ranking"/g, 'title="Actualizar ranking" data-i18n-title="rank.refresh"'],
  [/aria-label="Ranking de rivales"/g, 'aria-label="Ranking de rivales" data-i18n-aria-label="rank.aria"'],
  [/aria-label="Ventana temporal"/g, 'aria-label="Ventana temporal" data-i18n-aria-label="stats.range"'],
  [/aria-label="Cerrar"/g, 'aria-label="Cerrar" data-i18n-aria-label="share.close"'],
  [/title="Carga oportunidades de ejemplo en la lista"/g, 'title="Carga oportunidades de ejemplo en la lista" data-i18n-title="comp.demoLoad"'],
  [/title="Simula el chip de captar en página"/g, 'title="Simula el chip de captar en página" data-i18n-title="comp.demoChip"'],
];

for (const [re, rep] of attrPatches) {
  html = html.replace(re, rep);
}

// Element content: add data-i18n on specific known structures via regex
const elementPatches = [
  [/<p class="rl-muted">Iniciá sesión[^<]*<\/p>/, '<p class="rl-muted" data-i18n="auth.lead">Iniciá sesión para sincronizar config, alertas e historial.</p>'],
  [/<button type="button" class="rl-auth-tab is-active" data-auth-tab="login">Entrar<\/button>/, '<button type="button" class="rl-auth-tab is-active" data-auth-tab="login" data-i18n="auth.login">Entrar</button>'],
  [/<button type="button" class="rl-auth-tab" data-auth-tab="register">Crear cuenta<\/button>/, '<button type="button" class="rl-auth-tab" data-auth-tab="register" data-i18n="auth.register">Crear cuenta</button>'],
  [/<button type="submit" class="rl-btn rl-btn--primary rl-btn--block">Entrar<\/button>/, '<button type="submit" class="rl-btn rl-btn--primary rl-btn--block" data-i18n="auth.login">Entrar</button>'],
  [/<button type="submit" class="rl-btn rl-btn--primary rl-btn--block" id="auth-reg-submit">\s*Crear cuenta\s*<\/button>/, '<button type="submit" class="rl-btn rl-btn--primary rl-btn--block" id="auth-reg-submit" data-i18n="auth.register">Crear cuenta</button>'],
  [/<button type="button" id="btn-auth-local" class="rl-btn rl-btn--ghost rl-btn--block">\s*Continuar en modo local \(sin nube\)\s*<\/button>/, '<button type="button" id="btn-auth-local" class="rl-btn rl-btn--ghost rl-btn--block" data-i18n="auth.local">Continuar en modo local (sin nube)</button>'],
  [/<p class="rl-hint">\s*Cognito se configura[\s\S]*?<\/p>/, '<p class="rl-hint" data-i18n="auth.hint">Cognito se configura en Config (región, User Pool, Client) tras el deploy de Terraform.</p>'],
  [/<span class="rl-sub" id="auth-user-label">Listo para operar<\/span>/, '<span class="rl-sub" id="auth-user-label" data-i18n="shell.ready">Listo para operar</span>'],
  [/<div class="rl-kpi"><span id="kpi-replies">0<\/span><small>Resp\.<\/small><\/div>/, '<div class="rl-kpi"><span id="kpi-replies">0</span><small data-i18n="kpi.replies">Resp.</small></div>'],
  [/<div class="rl-kpi"><span id="kpi-alerts">0<\/span><small>Abiertas<\/small><\/div>/, '<div class="rl-kpi"><span id="kpi-alerts">0</span><small data-i18n="kpi.open">Abiertas</small></div>'],
  [/<div class="rl-kpi"><span id="kpi-critical">0<\/span><small>Críticas<\/small><\/div>/, '<div class="rl-kpi"><span id="kpi-critical">0</span><small data-i18n="kpi.critical">Críticas</small></div>'],
  [/<div class="rl-kpi"><span id="kpi-winrate">0%<\/span><small>Win<\/small><\/div>/, '<div class="rl-kpi"><span id="kpi-winrate">0%</span><small data-i18n="kpi.win">Win</small></div>'],
];

for (const [re, rep] of elementPatches) {
  html = html.replace(re, rep);
}

// Tabs
html = html.replace(
  /(<button class="rl-tab is-active"[^>]*data-tab="own">\s*<span class="rl-tab__label">)Propios(<\/span>)/,
  '$1<span data-i18n="tab.own">Propios</span>$2'.replace('<span data-i18n="tab.own">Propios</span></span>', ''),
);
// Fix tabs properly
html = html
  .replace(
    /data-tab="own">\s*<span class="rl-tab__label">Propios<\/span>/,
    'data-tab="own">\n        <span class="rl-tab__label" data-i18n="tab.own">Propios</span>',
  )
  .replace(
    /data-tab="comp">\s*<span class="rl-tab__label">Competencia<\/span>/,
    'data-tab="comp">\n        <span class="rl-tab__label" data-i18n="tab.comp">Competencia</span>',
  )
  .replace(
    /data-tab="rank">\s*<span class="rl-tab__label">Ranking<\/span>/,
    'data-tab="rank">\n        <span class="rl-tab__label" data-i18n="tab.rank">Ranking</span>',
  )
  .replace(
    /data-tab="stats">\s*<span class="rl-tab__label">Stats<\/span>/,
    'data-tab="stats">\n        <span class="rl-tab__label" data-i18n="tab.stats">Stats</span>',
  )
  .replace(
    /data-tab="hist">\s*<span class="rl-tab__label">Historial<\/span>/,
    'data-tab="hist">\n        <span class="rl-tab__label" data-i18n="tab.hist">Historial</span>',
  )
  .replace(
    /data-tab="cfg">\s*<span class="rl-tab__label">Config<\/span>/,
    'data-tab="cfg">\n        <span class="rl-tab__label" data-i18n="tab.cfg">Config</span>',
  );

// Panel titles / leads
html = html
  .replace(/<h2>Propios<\/h2>/, '<h2 data-i18n="own.title">Propios</h2>')
  .replace(
    /<p class="rl-panel-lead">Respuestas a quejas de tu marca\.<\/p>/,
    '<p class="rl-panel-lead" data-i18n="own.lead">Respuestas a quejas de tu marca.</p>',
  )
  .replace(
    /<div id="own-empty" class="rl-empty">\s*Seleccioná un comentario en la página, o pegá el texto abajo\.\s*<\/div>/,
    '<div id="own-empty" class="rl-empty" data-i18n="own.empty">Seleccioná un comentario en la página, o pegá el texto abajo.</div>',
  )
  .replace(/<summary>Pegar queja \/ review<\/summary>/, '<summary data-i18n="own.pasteSummary">Pegar queja / review</summary>')
  .replace(
    /<button type="submit" class="rl-btn rl-btn--ghost">Analizar texto<\/button>/,
    '<button type="submit" class="rl-btn rl-btn--ghost" data-i18n="own.analyze">Analizar texto</button>',
  )
  .replace(
    /<p>Triaging riesgo y redactando 3 enfoques…<\/p>/,
    '<p data-i18n="own.loader">Triaging riesgo y redactando 3 enfoques…</p>',
  )
  .replace(/<h2>Competencia<\/h2>/, '<h2 data-i18n="comp.title">Competencia</h2>')
  .replace(
    /<p class="rl-panel-lead">Oportunidades de captación desde quejas reales\.<\/p>/,
    '<p class="rl-panel-lead" data-i18n="comp.lead">Oportunidades de captación desde quejas reales.</p>',
  )
  .replace(
    /(id="btn-scan-comp"[^>]*>)\s*Escanear\s*(<\/button>)/,
    '$1<span data-i18n="comp.scan">Escanear</span>$2',
  )
  .replace(/<summary>Filtros<\/summary>/, '<summary data-i18n="comp.filters">Filtros</summary>')
  .replace(
    /<p class="rl-comp-actions__label">Informe del rival<\/p>/,
    '<p class="rl-comp-actions__label" data-i18n="comp.reportLabel">Informe del rival</p>',
  )
  .replace(
    /<p class="rl-hint rl-comp-actions__hint">\s*Elegí un competidor[\s\S]*?<\/p>/,
    '<p class="rl-hint rl-comp-actions__hint" data-i18n="comp.reportHint">Elegí un competidor y generá el análisis (gaps, crisis, leads).</p>',
  )
  .replace(
    /(id="btn-open-rival-ficha"[^>]*>)\s*Generar informe\s*(<\/button>)/,
    '$1<span data-i18n="comp.reportGenerate">Generar informe</span>$2',
  )
  .replace(
    /<strong id="rival-intel-title">En esta pestaña<\/strong>/,
    '<strong id="rival-intel-title" data-i18n="comp.tabTitle">En esta pestaña</strong>',
  )
  .replace(
    /(id="btn-rival-intel"[^>]*>)Usar esta pestaña(<\/button>)/,
    '$1<span data-i18n="comp.useTab">Usar esta pestaña</span>$2',
  )
  .replace(
    /<summary>Agregar queja real \(texto o link\)<\/summary>/,
    '<summary data-i18n="comp.manualSummary">Agregar queja real (texto o link)</summary>',
  )
  .replace(
    /<p class="rl-hint rl-hint--flush">\s*No publica nada en internet[\s\S]*?<\/p>/,
    '<p class="rl-hint rl-hint--flush" data-i18n-html="comp.manualHint">No publica nada en internet. Solo importa al panel una queja que <strong>vos ya encontraste</strong> (Reddit, review, etc.) para armar pitch y seguimiento.</p>',
  )
  .replace(
    /(<button type="submit" class="rl-btn rl-btn--primary">)Crear oportunidad(<\/button>)/,
    '$1<span data-i18n="comp.manual.create">Crear oportunidad</span>$2',
  )
  .replace(
    /<summary>Datos de prueba \(opcional\)<\/summary>/,
    '<summary data-i18n="comp.demoSummary">Datos de prueba (opcional)</summary>',
  )
  .replace(
    /(<div id="comp-demo-wrap"[\s\S]*?<p class="rl-hint rl-hint--flush">)[\s\S]*?(<\/p>)/,
    '$1Solo para probar la UI sin escanear. No son menciones reales.$2',
  );

// demo hint data-i18n
html = html.replace(
  /(<details id="comp-demo-wrap"[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
  '$1 data-i18n="comp.demoHint">',
);

html = html
  .replace(
    /(id="btn-load-demo"[^>]*>)\s*Cargar ejemplos en lista\s*(<\/button>)/,
    '$1<span data-i18n="comp.demoLoad">Cargar ejemplos en lista</span>$2',
  )
  .replace(
    /(id="btn-open-capture-demo"[^>]*>)\s*Simular chip en página\s*(<\/button>)/,
    '$1<span data-i18n="comp.demoChip">Simular chip en página</span>$2',
  )
  .replace(/<h2>Ranking<\/h2>/, '<h2 data-i18n="rank.title">Ranking</h2>')
  .replace(
    /<p class="rl-panel-lead">Priorizá rivales[\s\S]*?<\/p>/,
    '<p class="rl-panel-lead" data-i18n="rank.lead">Priorizá rivales según su vida digital (quejas, churn, prensa).</p>',
  )
  .replace(
    /<p class="rl-hint rl-hint--flush">\s*Score 0–100:[\s\S]*?<\/p>/,
    '<p class="rl-hint rl-hint--flush" data-i18n="rank.hint">Score 0–100: más alto = más fricción pública del rival. Tocá uno para abrir el informe.</p>',
  )
  .replace(
    /(id="btn-report-back"[^>]*>)\s*← Volver\s*(<\/button>)/,
    '$1<span data-i18n="report.back">← Volver</span>$2',
  )
  .replace(
    /<h2 id="report-page-title">Informe del rival<\/h2>/,
    '<h2 id="report-page-title" data-i18n="report.title">Informe del rival</h2>',
  )
  .replace(/<h2>Stats<\/h2>/, '<h2 data-i18n="stats.title">Stats</h2>')
  .replace(/<summary>KPIs<\/summary>/, '<summary data-i18n="stats.kpis">KPIs</summary>')
  .replace(/<summary>Share /, '<summary><span data-i18n="stats.share">Share</span> ')
  .replace(/<summary>Embudo<\/summary>/, '<summary data-i18n="stats.funnel">Embudo</summary>')
  .replace(/<summary>Actividad diaria<\/summary>/, '<summary data-i18n="stats.daily">Actividad diaria</summary>')
  .replace(
    /<span class="rl-legend__item"><i class="rl-swatch rl-swatch--own"><\/i> Propios<\/span>/,
    '<span class="rl-legend__item"><i class="rl-swatch rl-swatch--own"></i> <span data-i18n="stats.legendOwn">Propios</span></span>',
  )
  .replace(
    /<span class="rl-legend__item"><i class="rl-swatch rl-swatch--comp"><\/i> Rival<\/span>/,
    '<span class="rl-legend__item"><i class="rl-swatch rl-swatch--comp"></i> <span data-i18n="stats.legendRival">Rival</span></span>',
  )
  .replace(/<summary>Barras apiladas<\/summary>/, '<summary data-i18n="stats.stack">Barras apiladas</summary>')
  .replace(/<summary>Riesgo<\/summary>/, '<summary data-i18n="stats.risk">Riesgo</summary>')
  .replace(/<summary>Severidad rivales<\/summary>/, '<summary data-i18n="stats.severity">Severidad rivales</summary>')
  .replace(/<summary>Top rivales<\/summary>/, '<summary data-i18n="stats.topRivals">Top rivales</summary>')
  .replace(/<summary>Canales<\/summary>/, '<summary data-i18n="stats.channels">Canales</summary>')
  .replace(/<summary>Tonos usados<\/summary>/, '<summary data-i18n="stats.tones">Tonos usados</summary>')
  .replace(/<summary>Acciones<\/summary>/, '<summary data-i18n="stats.actions">Acciones</summary>')
  .replace(/<h2>Historial<\/h2>/, '<h2 data-i18n="hist.title">Historial</h2>')
  .replace(
    /(id="btn-export-history"[^>]*>)Exportar CSV(<\/button>)/,
    '$1<span data-i18n="hist.export">Exportar CSV</span>$2',
  );

// Filter labels & options
html = html
  .replace(/<span>Estado<\/span>/, '<span data-i18n="comp.filter.status">Estado</span>')
  .replace(/<span>Fecha<\/span>/, '<span data-i18n="comp.filter.date">Fecha</span>')
  .replace(/<span>Plataforma<\/span>/, '<span data-i18n="comp.filter.platform">Plataforma</span>')
  .replace(/<span>Rival<\/span>/, '<span data-i18n="comp.filter.rival">Rival</span>')
  .replace(/<span>Severidad<\/span>/, '<span data-i18n="comp.filter.severity">Severidad</span>')
  .replace(/<span>Buscar<\/span>/, '<span data-i18n="comp.filter.search">Buscar</span>')
  .replace(/<option value="OPEN">Abiertas<\/option>/, '<option value="OPEN" data-i18n="status.open">Abiertas</option>')
  .replace(/<option value="ALL">Todas<\/option>/, '<option value="ALL" data-i18n="status.all">Todas</option>')
  .replace(/<option value="CONTACTED">Contactadas<\/option>/, '<option value="CONTACTED" data-i18n="status.contacted">Contactadas</option>')
  .replace(/<option value="WON">Ganadas<\/option>/, '<option value="WON" data-i18n="status.won">Ganadas</option>')
  .replace(/<option value="DISMISSED">Descartadas<\/option>/, '<option value="DISMISSED" data-i18n="status.dismissed">Descartadas</option>');

html = html.replace(
  /(<select id="alert-filter-date"[\s\S]*?<option value="all")(?![^>]*data-i18n)([^>]*>)Todas(<\/option>)/,
  '$1 data-i18n="date.all"$2Todas$3',
);
html = html
  .replace(/<option value="1">Hoy<\/option>/, '<option value="1" data-i18n="date.today">Hoy</option>')
  .replace(/<option value="7" selected>7 días<\/option>/, '<option value="7" selected data-i18n="date.7">7 días</option>')
  .replace(/<option value="14">14 días<\/option>/, '<option value="14" data-i18n="date.14">14 días</option>')
  .replace(/<option value="30">30 días<\/option>/, '<option value="30" data-i18n="date.30">30 días</option>')
  .replace(
    /(<select id="alert-filter-platform"[\s\S]*?<option value="all")(?![^>]*data-i18n)([^>]*>)Todas(<\/option>)/,
    '$1 data-i18n="platform.all"$2Todas$3',
  )
  .replace(/<option value="news">Noticias<\/option>/, '<option value="news" data-i18n="platform.news">Noticias</option>')
  .replace(/<option value="page">Página<\/option>/, '<option value="page" data-i18n="platform.page">Página</option>')
  .replace(/<option value="manual">Manual<\/option>/, '<option value="manual" data-i18n="platform.manual">Manual</option>')
  .replace(/<option value="all">Todos<\/option>/, '<option value="all" data-i18n="rival.all">Todos</option>')
  .replace(
    /(<select id="alert-filter-severity"[\s\S]*?<option value="all")(?![^>]*data-i18n)([^>]*>)Todas(<\/option>)/,
    '$1 data-i18n="sev.all"$2Todas$3',
  )
  .replace(/<option value="HIGH">Alta \/ crítica<\/option>/g, '<option value="HIGH" data-i18n="sev.high">Alta / crítica</option>')
  .replace(/<option value="MEDIUM">Media<\/option>/g, '<option value="MEDIUM" data-i18n="sev.medium">Media</option>')
  .replace(/<option value="LOW">Baja<\/option>/g, '<option value="LOW" data-i18n="sev.low">Baja</option>');

// Config summaries & share modal
html = html
  .replace(/<summary>Perfil de la empresa<\/summary>/, '<summary data-i18n="cfg.profile">Perfil de la empresa</summary>')
  .replace(/<summary>Competidores<\/summary>/, '<summary data-i18n="cfg.competitors">Competidores</summary>')
  .replace(/<summary>Fuentes de escaneo<\/summary>/, '<summary data-i18n="cfg.scanSources">Fuentes de escaneo</summary>')
  .replace(/<summary>Plataformas en página<\/summary>/, '<summary data-i18n="cfg.pagePlatforms">Plataformas en página</summary>')
  .replace(/<summary>Detección en página<\/summary>/, '<summary data-i18n="cfg.detection">Detección en página</summary>')
  .replace(/<summary>Alertas y notificaciones<\/summary>/, '<summary data-i18n="cfg.notify">Alertas y notificaciones</summary>')
  .replace(/<summary>AppSync \(cloud\)<\/summary>/, '<summary data-i18n="cfg.appsync">AppSync (cloud)</summary>')
  .replace(/<summary>Amazon Cognito<\/summary>/, '<summary data-i18n="cfg.cognito">Amazon Cognito</summary>')
  .replace(/<summary>Fuentes profesionales \(API\)<\/summary>/, '<summary data-i18n="cfg.proSources">Fuentes profesionales (API)</summary>')
  .replace(/<summary>Integraciones CRM<\/summary>/, '<summary data-i18n="cfg.crm">Integraciones CRM</summary>')
  .replace(
    /(<button type="submit" class="rl-btn rl-btn--primary">)Guardar(<\/button>)/,
    '$1<span data-i18n="cfg.save">Guardar</span>$2',
  )
  .replace(
    /(id="btn-logout"[^>]*>)Cerrar sesión(<\/button>)/,
    '$1<span data-i18n="cfg.logout">Cerrar sesión</span>$2',
  )
  .replace(
    /<h2 id="share-modal-title">¿Dónde querés compartir\?<\/h2>/,
    '<h2 id="share-modal-title" data-i18n="share.title">¿Dónde querés compartir?</h2>',
  )
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="email"[\s\S]*?<strong>)Email(<\/strong>\s*<span>)A un correo concreto(<\/span>)/,
    '$1<span data-i18n="share.email.title">Email</span>$2<span data-i18n="share.email.sub">A un correo concreto</span>',
  );

// Language block insertion in config form (first details)
const langBlock = `
          <details class="rl-disclosure rl-cfg-panel" open>
            <summary data-i18n="cfg.language">Idioma de la interfaz</summary>
            <div class="rl-cfg-panel__body">
              <p class="rl-hint rl-hint--flush" data-i18n="cfg.languageHint">
                Afecta paneles, botones y textos de la extensión. Los informes largos usan ES o EN.
              </p>
              <label>
                <span data-i18n="cfg.language">Idioma de la interfaz</span>
                <select id="cfg-locale" class="rl-select" aria-label="Language">
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="it">Italiano</option>
                  <option value="de">Deutsch</option>
                </select>
              </label>
            </div>
          </details>
`;

if (!html.includes('id="cfg-locale"')) {
  html = html.replace(
    /(<form id="cfg-form" class="rl-form rl-cfg-form">)/,
    `$1\n${langBlock}`,
  );
}

// Manual form labels — wrap first text via crude replacements
html = html
  .replace(
    /(<form id="own-manual"[\s\S]*?<label>\s*)Texto(\s*<textarea)/,
    '$1<span data-i18n="own.text">Texto</span>$2',
  )
  .replace(
    /(<form id="comp-manual"[\s\S]*?<label>\s*)Competidor(\s*<select)/,
    '$1<span data-i18n="comp.manual.rival">Competidor</span>$2',
  )
  .replace(
    /(<form id="comp-manual"[\s\S]*?<label>\s*)Texto de la queja(\s*<textarea)/,
    '$1<span data-i18n="comp.manual.text">Texto de la queja</span>$2',
  )
  .replace(
    /(<form id="comp-manual"[\s\S]*?<label>\s*)Link a la publicación \(opcional\)(\s*<input)/,
    '$1<span data-i18n="comp.manual.url">Link a la publicación (opcional)</span>$2',
  );

// Auth labels
html = html
  .replace(
    /(<form id="auth-login-form"[\s\S]*?<label>\s*)Email(\s*<input id="auth-login-email")/,
    '$1<span data-i18n="auth.email">Email</span>$2',
  )
  .replace(
    /(<form id="auth-login-form"[\s\S]*?<label>\s*)Contraseña(\s*<input id="auth-login-pass")/,
    '$1<span data-i18n="auth.password">Contraseña</span>$2',
  )
  .replace(
    /(<form id="auth-register-form"[\s\S]*?<label>\s*)Email(\s*<input id="auth-reg-email")/,
    '$1<span data-i18n="auth.email">Email</span>$2',
  )
  .replace(
    /(<form id="auth-register-form"[\s\S]*?<label>\s*)Contraseña(\s*<input id="auth-reg-pass")/,
    '$1<span data-i18n="auth.password">Contraseña</span>$2',
  )
  .replace(
    /(<label id="auth-confirm-wrap"[^>]*>\s*)Código de verificación \(email\)(\s*<input)/,
    '$1<span data-i18n="auth.verifyCode">Código de verificación (email)</span>$2',
  );

// Share remaining buttons
html = html
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="whatsapp"[\s\S]*?<strong>)WhatsApp(<\/strong>\s*<span>)A un número \(con código de país\)(<\/span>)/,
    '$1<span data-i18n="share.wa.title">WhatsApp</span>$2<span data-i18n="share.wa.sub">A un número (con código de país)</span>',
  )
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="slack"[\s\S]*?<strong>)Slack(<\/strong>\s*<span>)Incoming Webhook o copiar al canal(<\/span>)/,
    '$1<span data-i18n="share.slack.title">Slack</span>$2<span data-i18n="share.slack.sub">Incoming Webhook o copiar al canal</span>',
  )
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="crm"[\s\S]*?<strong>)CRM(<\/strong>\s*<span>)Webhook \/ HubSpot configurados(<\/span>)/,
    '$1<span data-i18n="share.crm.title">CRM</span>$2<span data-i18n="share.crm.sub">Webhook / HubSpot configurados</span>',
  )
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="clipboard"[\s\S]*?<strong>)Portapapeles(<\/strong>\s*<span>)Sin destinatario · copiar link \+ token(<\/span>)/,
    '$1<span data-i18n="share.clip.title">Portapapeles</span>$2<span data-i18n="share.clip.sub">Sin destinatario · copiar link + token</span>',
  )
  .replace(
    /(<button type="button" class="rl-share-dest" data-share-dest="viewer"[\s\S]*?<strong>)Abrir visor(<\/strong>\s*<span>)Solo en esta extensión(<\/span>)/,
    '$1<span data-i18n="share.viewer.title">Abrir visor</span>$2<span data-i18n="share.viewer.sub">Solo en esta extensión</span>',
  )
  .replace(
    /<span id="share-contact-label-text">Destinatario<\/span>/,
    '<span id="share-contact-label-text" data-i18n="share.recipient">Destinatario</span>',
  )
  .replace(
    /(id="btn-share-back"[^>]*>)Atrás(<\/button>)/,
    '$1<span data-i18n="share.back">Atrás</span>$2',
  )
  .replace(
    /(id="btn-share-send"[^>]*>)Enviar(<\/button>)/,
    '$1<span data-i18n="share.send">Enviar</span>$2',
  );

// Config hint blocks with html
html = html
  .replace(
    /(<details class="rl-disclosure rl-cfg-panel">\s*<summary data-i18n="cfg.competitors">[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
    '$1 data-i18n="cfg.competitorsHint">',
  )
  .replace(
    /(<summary data-i18n="cfg.scanSources">[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
    '$1 data-i18n-html="cfg.scanSourcesHint">',
  )
  .replace(
    /(<summary data-i18n="cfg.pagePlatforms">[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
    '$1 data-i18n-html="cfg.pagePlatformsHint">',
  )
  .replace(
    /(<summary data-i18n="cfg.notify">[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
    '$1 data-i18n-html="cfg.notifyHint">',
  )
  .replace(
    /(<summary data-i18n="cfg.proSources">[\s\S]*?<p class="rl-hint rl-hint--flush")>/,
    '$1 data-i18n-html="cfg.proSourcesHint">',
  )
  .replace(
    /(<summary data-i18n="cfg.crm">[\s\S]*?<p class="rl-hint rl-hint--flush")(?![^>]*data-i18n)/,
    '$1 data-i18n="cfg.crmHint"',
  );

fs.writeFileSync(file, html);
console.log('Annotated', file);
console.log('data-i18n count', (html.match(/data-i18n/g) || []).length);
