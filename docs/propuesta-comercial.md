# ResponseLens AI — Propuesta de solución para clientes

Documento comercial y de alcance. Describe **qué hace el producto hoy**, **de dónde salen los datos**, **qué se publica (y qué no)** en las redes, y **qué necesita el cliente para contratar y arrancar**.

---

## 1. Objetivo de la solución

ResponseLens AI es un software B2B para marcas que necesitan **controlar su reputación en público** y, al mismo tiempo, **captar clientes insatisfechos de la competencia**.

El problema que resuelve:

- Las quejas sobre la marca (y sobre los rivales) están dispersas en Reddit, X, YouTube, noticias, foros y otros canales.
- El equipo de CX, community o ventas **llega tarde**, responde sin criterio o no ve la oportunidad comercial.
- Las herramientas de “social listening” suelen listar menciones; no cierran el ciclo: **priorizar → redactar → asignar → registrar**.

ResponseLens concentra esa operación en un solo espacio de trabajo:

1. **Escucha** menciones de la marca y de rivales (vía SocialCrawl).
2. **Triage** automático: riesgo, SLA, tema de dolor, si se puede responder en el hilo.
3. **Acción**: borradores de respuesta o pitch de captación, cola de trabajo y auditoría de marca.
4. **Inteligencia**: radar competitivo, fichas de batalla y comparativas.

No reemplaza al community manager ni al CRM corporativo: **los alimenta** con evidencia, texto listo y prioridad.

---

## 2. Beneficios para el cliente

| Beneficio | Qué gana el equipo |
|---|---|
| **Menos crisis silenciosas** | Una bandeja unificada de menciones propias, con urgentes y SLA vencido a la vista. |
| **Respuesta consistente** | Plantillas y borradores en el idioma del comentario, alineados al tono de marca. |
| **Captación con evidencia** | Leads de rivales cuando hay intención de cambio (no insultos genéricos). |
| **Menos tiempo de briefing** | Fichas de batalla y auditoría armadas a partir del feed, no de slides inventados. |
| **Trabajo en equipo** | Dueño de cada alerta, cola “mías”, aprobación junior → lead, digest para stand-up. |
| **Trazabilidad** | Historial de respuestas/captaciones y registro local de quién abrió textos sensibles. |
| **Sin key de escucha en el browser** | La API de SocialCrawl vive en el backend (AWS). El usuario no pega secretos en el SPA. |

En una frase: **el cliente deja de cazar menciones a mano y pasa a operar una cola de reputación y captación, con IA de apoyo y datos de escucha reales.**

---

## 3. Funcionalidades de la solución

### 3.1 Escucha y bandeja (marca propia)

- Escaneo de la marca (nombre + aliases como queries independientes — permite monitorear productos, sub-marcas o servicios específicos además de la empresa).
- Bandeja única con filtros: todas, urgentes, pendientes, pospuestas, respondidas, resueltas, descartadas, **SLA vencido** y **mías** (asignadas al usuario logueado).
- Tarjeta por mención: tipo de contenido (hilo vs. solo seguir), score de riesgo, fricción, alcance, playbook y borradores.
- Análisis profundo (informe copiable / Markdown / PDF).
- SLA heurístico: 2 h crisis, 8 h alta, 24 h resto.
- Operación de cola: dueño, “asignarme”, flujo de aprobación, URL de ticket (Jira/Linear u otro), “se usó esta respuesta”.

### 3.2 Auditoría de marca

Inteligencia sobre **el propio feed**, no sobre la bandeja operativa:

- **Diagnóstico:** veredicto y cobertura de reputación.
- **Sentimiento:** evolución y pulse.
- **Temas:** categorías de dolor (precio, soporte, caída, producto, confianza, churn).

Sirve a dirección / brand; la bandeja sirve a quien responde el día a día.

### 3.3 Inteligencia competitiva

- **Radar de menciones:** quejas de rivales, leads con intención de cambio, umbral de crisis (menciones/24 h). Los aliases del rival también se escanean (permite rastrear productos o servicios puntuales del competidor).
- Pipeline CRM-lite en la alerta: etapa, secuencia público → DM → follow-up 48 h, nota, motivo de pérdida.
- **Fichas de batalla:** ficha competitiva derivada del feed (y capas demo de ads/talento/web cuando no hay API propia).
- **Ranking e Insights:** score relativo de rivales y comparativa propios vs. competencia.

### 3.4 Digest y control

- **Digest diario:** texto Markdown (urgentes + leads) para copiar a Slack o mail. **No se envía solo.**
- **Centro de alertas:** llegadas del scanner.
- **Historial:** respuestas y captaciones registradas.
- **Configuración:** empresa, rivales, umbral de crisis, fuentes, credenciales opcionales, espacios multi-marca locales, export de log de vistas PII.

### 3.5 IA

- Respuestas propias: varios tonos + recomendada (LLM en nube o fallback local si no hay modelo).
- Captación: pitches suave / directo / técnico.
- Playbooks de defensa o conquista, con un paso extra según canal (LinkedIn, Reddit, X, YouTube, etc.).
- Idioma del borrador alineado al del comentario (heurística ES/EN).

### 3.6 Lo que está en menú pero aún no es producto vivo

- **Feed global** y **Tendencias del mercado:** alcance de industria más allá de marca y rivales. Marcados como *próximamente*.
- **Radar de anuncios, talento y visibilidad web:** pantallas de trabajo con datos **demo** (no Meta Ads Library, Glassdoor ni Similarweb en vivo). El valor real de competencia hoy es el **radar de menciones** (SocialCrawl + feed).

---

## 4. Estructura de menús (uno por uno)

La app se organiza en **cinco bloques** del menú lateral.

### 4.1 Inicio

**Inicio** — Tablero del día: KPIs de urgentes y SLA, recorte de “hoy” (urgentes, leads, ficha caliente) y atajos al resto del producto. Es el punto de entrada del turno, no el feed completo.

### 4.2 Mi empresa

| Ítem | Para qué sirve |
|---|---|
| **Bandeja** | Cola operativa de menciones **sobre la marca del cliente**. Acá se responde, se pospone, se resuelve o se descarta. Incluye el filtro **Mías** (asignadas a tu usuario) dentro de la misma pantalla, no como otro módulo. |
| **Digest diario** | Resumen copiable de urgentes + leads rivales para el daily del equipo. |
| **Auditoría → Diagnóstico** | Lectura ejecutiva: cómo está la reputación con la evidencia del feed propio. |
| **Auditoría → Sentimiento** | Evolución del tono (positivo / negativo / mixto) en el tiempo. |
| **Auditoría → Temas** | En qué se queja la gente (categorías y dolor). |

### 4.3 Inteligencia competitiva

| Ítem | Para qué sirve |
|---|---|
| **Radar de menciones** | Feed de **rivales**: quejas, captación, crisis si se supera el umbral. Es el módulo comercial vivo. |
| **Fichas de batalla** | Una ficha por rival para ventas/CS: ángulos, dolor, qué decir y qué no. |
| **Radar de anuncios** | Creatividades / campañas de rivales. **Hoy: capa demo.** |
| **Reputación y talento** | Señales de empleo / employer brand. **Hoy: capa demo.** |
| **Visibilidad web** | Tráfico / SEO relativo. **Hoy: capa demo.** |
| **Ranking** | Orden de rivales por score de “vida digital” a partir del feed. |
| **Insights** | Comparativa agregada propios vs. competencia. |

### 4.4 Descubrimiento e industria

| Ítem | Para qué sirve |
|---|---|
| **Feed global** | Conversación de industria más allá de marca y rivales. **Próximamente.** |
| **Tendencias del mercado** | Keywords y temas emergentes de categoría. **Próximamente.** |

### 4.5 Control y ajustes

| Ítem | Para qué sirve |
|---|---|
| **Centro de alertas** | Inbox técnico de lo que acaba de entrar del scanner (llegadas). |
| **Historial** | Qué se respondió o captó, para KPIs y auditoría interna. |
| **Configuración** | Nombre de marca, aliases, website, tono, URLs de canales, lista de rivales, umbral de crisis, fuentes de escaneo, APIs opcionales, espacios multi-cliente (agencia) y export compliance. |

---

## 5. De dónde obtiene la data (SocialCrawl)

### 5.1 Fuente principal de escucha

El scan automático **1× al día** y el botón **Forzar ahora** (marca propia o rivales) usan **SocialCrawl** (`GET /v1/search/everywhere`). Hoy el stack corre en **mock** (mismo formato, 0 créditos) hasta activar la API real.

No es un crawler propio de Meta/Glassdoor. Es un proveedor de búsqueda multi-plataforma. ResponseLens:

1. Un cron diario (o **Forzar ahora**) dispara el scan.
2. El **backend (Lambda)** llama a SocialCrawl con la API key. Esa key **nunca** viaja al navegador ni se guarda en Config del SPA.
3. Los resultados vuelven al workspace (AppSync / cola) y se convierten en **alertas** de bandeja o radar.
4. Cada ítem trae texto, canal, URL de origen, autor cuando existe, comentarios destacados y metadatos de engagement.

**Scan demo** en la UI usa el mismo formato de datos **sin gastar créditos** de SocialCrawl. Sirve para capacitación y demos; no sustituye el scan real en producción.

### 5.2 Plataformas que cubre la escucha (SocialCrawl)

El fan-out típico incluye, entre otras:

Reddit, X (búsqueda), YouTube, TikTok, Instagram, Hacker News, LinkedIn, Threads, GitHub, Pinterest, Rumble, más **noticias** vía conectores tipo Tavily / Perplexity, y fuentes adicionales del catálogo del proveedor.

La cobertura **real** de cada red depende del plan y de las fuentes habilitadas en SocialCrawl, no de un scrape en el browser del cliente.

### 5.3 Qué no es SocialCrawl

| Dato | Origen |
|---|---|
| Perfil de empresa y rivales | Lo carga el cliente en **Configuración**. |
| Dueño, SLA operativo, CRM-lite, tickets, digest | Operación **dentro de ResponseLens** (persistido con la alerta). |
| Ads / Glassdoor / Similarweb “en vivo” | **No** están conectados. Las pantallas de anuncios/talento/web son **demo** hasta que exista contrato e integración. |
| Publicación en la red social | Ver sección 6. **No** sale por SocialCrawl. |

### 5.4 Otras entradas (opcionales, no el núcleo)

- Webhook inbound (Mention, Zapier, Meltwater, etc.) hacia API de ResponseLens, si se habilita en el despliegue.
- Reddit OAuth / NewsAPI / YouTube Data API en Config: capas complementarias; el scan del SPA está diseñado para **SocialCrawl como fuente canónica**.

---

## 6. Qué se impacta en las plataformas (publicación)

Esta sección es crítica para el contrato: **escuchar no es lo mismo que publicar.**

### 6.1 Estado actual (lo que el cliente debe asumir)

Al pulsar **Responder en [plataforma]** o **Enviar en [plataforma]**:

1. ResponseLens **copia el texto** al portapapeles.
2. Marca la alerta como contactada/respondida **dentro del producto**.
3. Muestra una **publicación simulada** (demo) en la tarjeta: “publicado en X · demo”.

**No se crea un comentario, reply ni DM real** en Reddit, X, YouTube, LinkedIn, Instagram, TikTok ni ninguna otra red. No hay OAuth de publicación ni posting API contratada en este alcance.

El flujo de trabajo previsto para el equipo es:

> Redactar en ResponseLens → copiar → pegar en el hilo original (sesión del community en esa red) → volver y marcar estado.

Eso **sí impacta** la plataforma, pero **lo hace la persona**, con el texto generado o editado en ResponseLens. El producto no actúa como bot de posting.

### 6.2 Qué se “impacta” entonces

| En | Impacto |
|---|---|
| **ResponseLens** | Estados, historial, dueño, mock de publicación, informe, digest. |
| **Red social de origen** | Solo si un humano pega el comentario/DM. El enlace al hilo está en la alerta (`sourceUrl`). |
| **CRM del cliente** | Solo si se configura webhook/HubSpot (integración opcional) o se copia el JSON. |
| **Jira / Linear** | Solo una **URL** guardada en la alerta. No crea tickets solo. |
| **Slack / mail** | El digest se **copia**; no hay envío automático. |

### 6.3 Roadmap de publicación (si se contrata aparte)

Publicar de verdad en cada red implica:

- Apps oficiales (X API, Reddit, YouTube, LinkedIn, Meta, etc.).
- Permisos, revisión de las plataformas, límites de ToS.
- Moderación humana (legal / safety: ResponseLens ya recomienda **no** auto-publicar esos casos).

Hasta que eso esté en el contrato, el compromiso de producto es: **borrador + copiar + registro interno**, no “el software postea por vos”.

---

## 7. Qué necesita el cliente para contratar y arrancar

### 7.1 Perfil de comprador

Típico: **marca o agencia** con community, CX, brand o un equipo comercial que captura churn de rivales. Un usuario puede operar; el valor crece con 2–10 personas (dueño, aprobación, digest).

### 7.2 Datos que debe entregar el cliente (onboarding)

Sin esto el scan no tiene foco:

1. **Nombre público** de la marca (cómo la mencionan en redes, no el legal) y **aliases**.
2. **Website** y **URLs de canales** oficiales (X, LinkedIn, YouTube, etc.). El website **no** es query de escucha.
3. **Qué venden** (una frase) y **tono de marca** (cercano, técnico, formal).
4. **Lista de rivales** (3 a 5): nombre público, aliases, website. El cron ignora aliases y website como query.
5. **Umbral de crisis** (menciones de un rival en 24 h) y **lookback** de Forzar ahora.
6. **Usuarios** (emails) que van a entrar con login (Cognito).
7. Si es agencia: **espacio local por cliente** en el mismo browser, o **cuenta Cognito por cliente** para aislar datos. Multi-tenant AWS no está incluido.

### 7.3 Qué provee / opera ResponseLens (lado servicio)

- Aplicación web (SPA) + identidad (Cognito).
- Backend serverless (escucha, persistencia de alertas, tiempo real).
- **Cuenta y créditos SocialCrawl** (o el cliente aporta su key al despliegue, según el modelo comercial). Sin créditos de SocialCrawl **no hay escucha en vivo**.
- Hosting (CloudFront / AWS) en el plan cloud.

El volumen de scan (lookback en días, fuentes, frecuencia cron) se acuerda: cada scan consume cuota del proveedor.

### 7.4 Requisitos técnicos del cliente

- Navegador actual (Chrome, Edge, Safari, Firefox).
- Usuarios con email corporativo.
- Para **pegar** respuestas: cuentas y sesión en las redes donde opera el community (eso no lo administra ResponseLens).
- Opcional: webhook CRM, HubSpot, ticket tracker con URL pública.

No hace falta instalar extensión de Chrome. El producto es la **aplicación web**.

### 7.5 Límites y condiciones que deben quedar en el contrato

- **ToS de las redes:** se indexa lo que SocialCrawl entrega; no se promete cobertura 100 % de Instagram/Facebook/LinkedIn.
- **No hay menciones inventadas** en el feed de producción. Vacío = vacío. El scan demo es explícito y no gasta créditos.
- **PII:** los comentarios son datos de terceros. El log de “quién abrió el informe” es local al workspace; un SIEM corporativo se cotiza aparte.
- **IA:** los textos son asistencia. El cliente es responsable de lo que un humano publica en la red.
- **Legal / amenazas / datos personales:** el producto sugiere escalar, no auto-responder.
- **Ads, talento y web en vivo:** fuera de alcance salvo add-on y proveedores adicionales.
- **Publicación automática en redes:** fuera de alcance salvo add-on y apps oficiales de cada plataforma.
- **Feed global / tendencias:** no forman parte del entregable actual.

### 7.6 Modelo de uso esperado (para dimensionar)

| Uso | Qué implica |
|---|---|
| Turno de community | Bandeja + digest + 1–N scans/día de marca. |
| Captación | Radar de rivales + leads + fichas. Más rivales = más queries SocialCrawl. |
| Dirección | Auditoría + ranking + insights (sobre el mismo feed, sin scan extra obligatorio). |

Preguntas para cotizar: cantidad de marcas, cantidad de rivales, frecuencia de scan, número de usuarios, si hay cron 24/7, si hace falta webhook inbound o CRM.

### 7.7 Criterio de éxito (90 días)

El cliente debería poder mostrar:

- Tiempo de primera respuesta a menciones HIGH/CRITICAL medido en la bandeja.
- % de urgentes con dueño asignado.
- Número de leads rivales contactados (estado CONTACTED / WON) con evidencia de URL.
- Una auditoría de marca usable en comité (diagnóstico + temas).
- Equipo operando **copiar → pegar en el hilo**, sin esperar un bot de posting.

---

## 8. Resumen ejecutivo para la decisión de compra

ResponseLens AI es **escucha (SocialCrawl) + cola de reputación + captación competitiva + IA de redacción**, en un workspace web.

**Incluye hoy:** bandeja propia, auditoría, radar de rivales, operación de equipo, digest, historial y config.

**No incluye hoy, salvo que se contrate explícitamente:** posteo automático en redes, Meta Ads / Glassdoor / Similarweb reales, feed global de industria.

**El cliente contrata** el software, los usuarios, y la **capacidad de escucha** (créditos SocialCrawl). **El impacto en X, Reddit, YouTube, etc.** lo ejecuta el equipo del cliente con el texto generado, hasta que exista un módulo de publicación nativa.

Para una demo: Configurar marca + un rival → **Scan demo** (0 créditos, no cuenta en el tope) o **Forzar ahora** → trabajar la Bandeja. La bandeja también se llena sola 1× al día.

**Roadmap de datos e integraciones:** [`evolucion-producto-fuentes-datos.md`](evolucion-producto-fuentes-datos.md).  
**Plan de implementación (fases):** [`plan-evolucion.md`](plan-evolucion.md).
