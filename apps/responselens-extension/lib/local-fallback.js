/**
 * Fallback local cuando AppSync/LLM no está disponible.
 * Genera 3 tonos + triage heurístico para no bloquear al agente.
 */

const LEGAL_RE = /\b(abogad|demanda|legal|lawsuit|attorney|sue)\b/i;
const SAFETY_RE = /\b(amenaza|suicid|violencia|harm|danger)\b/i;
const PRIVACY_RE = /\b(gdpr|rgpd|datos personales|privacy|doxx)\b/i;

export function buildLocalTriage(text) {
  const flags = [];
  if (LEGAL_RE.test(text)) flags.push('LEGAL_THREAT');
  if (SAFETY_RE.test(text)) flags.push('SAFETY_HARM');
  if (PRIVACY_RE.test(text)) flags.push('DATA_PRIVACY');
  if (/\b(chargeback|contracargo)\b/i.test(text)) flags.push('CHARGEBACK');
  if (/\b(me cambio|cancel|switch|nunca m[aá]s)\b/i.test(text)) flags.push('CHURN_SIGNAL');

  let riskScore = Math.min(0.35 + flags.length * 0.15, 0.95);
  if (/\b(estafa|fraude|scam|horrible)\b/i.test(text)) riskScore = Math.max(riskScore, 0.7);

  const riskLevel =
    riskScore >= 0.85 ? 'CRITICAL' : riskScore >= 0.7 ? 'HIGH' : riskScore >= 0.45 ? 'MEDIUM' : 'LOW';

  let recommendedAction = 'PUBLIC_REPLY';
  if (flags.includes('SAFETY_HARM')) recommendedAction = 'ESCALATE_SAFETY';
  else if (flags.includes('LEGAL_THREAT')) recommendedAction = 'ESCALATE_LEGAL';
  else if (flags.includes('DATA_PRIVACY') || riskLevel === 'CRITICAL') recommendedAction = 'PRIVATE_DM';

  return {
    riskScore: Number(riskScore.toFixed(2)),
    riskLevel,
    escalationFlags: flags,
    recommendedAction,
    keyIssues: flags.length ? flags.map((f) => f.toLowerCase()) : ['experiencia'],
    summary: flags.length
      ? `Modo offline — riesgo detectado: ${flags.join(', ')}`
      : 'Modo offline — queja operativa sin escalado crítico.',
  };
}

export function buildLocalReplyOptions({ text, companyName }) {
  const brand = companyName || 'nuestro equipo';
  const triage = buildLocalTriage(text);
  const cautious =
    triage.recommendedAction.startsWith('ESCALATE') || triage.recommendedAction === 'PRIVATE_DM';

  const options = [
    {
      tone: 'FORMAL_CORPORATE',
      label: 'Formal-Corporativa',
      body: cautious
        ? `Gracias por tu mensaje. En ${brand} tomamos muy en serio este tipo de situaciones. Un especialista te contactará por canal privado para revisarlo con la debida confidencialidad.`
        : `Lamentamos la experiencia descrita. En ${brand} estamos revisando el caso para darte una respuesta precisa. ¿Puedes compartir el número de pedido o cuenta asociada?`,
      rationale: 'Tono institucional y prudente.',
    },
    {
      tone: 'EMPATHETIC',
      label: 'Empática-Cercana',
      body: cautious
        ? `Entendemos lo frustrante que debe ser esto. Queremos ayudarte con cuidado: te escribimos por privado para no exponer datos sensibles y resolverlo juntos.`
        : `Sentimos mucho que hayas pasado por esto. Estamos aquí para ayudarte: cuéntanos un poco más del problema y lo priorizamos.`,
      rationale: 'Valida emoción y abre diálogo.',
    },
    {
      tone: 'RESOLUTIVE_TECHNICAL',
      label: 'Resolutiva-Técnica',
      body: cautious
        ? `Hemos registrado tu reporte. Por protocolo, el siguiente paso es validación interna y contacto privado. Evitaremos detalles técnicos en público hasta confirmar el alcance.`
        : `Recibido. Pasos: 1) confirmar el síntoma, 2) revisar logs/estado del servicio, 3) devolverte un plan concreto en este hilo o por DM en cuanto lo tengamos.`,
      rationale: 'Enfoque accionable y claro.',
    },
  ];

  return {
    originalText: text,
    options,
    triage,
    model: 'local-fallback',
    generatedAt: new Date().toISOString(),
  };
}
