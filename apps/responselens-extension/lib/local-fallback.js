/**
 * Fallback local cuando AppSync/LLM no está disponible.
 * Genera 3 tonos + triage + opción recomendada, en el idioma de la queja (ES/EN).
 */

const LEGAL_RE = /\b(abogad|demanda|legal|lawsuit|attorney|sue)\b/i;
const SAFETY_RE = /\b(amenaza|suicid|violencia|harm|danger)\b/i;
const PRIVACY_RE = /\b(gdpr|rgpd|datos personales|privacy|doxx)\b/i;
const TECH_RE = /\b(bug|error|falla|ca[ií]da|outage|api|timeout|500|técnic)\b/i;

/** Heurística liviana ES vs EN (MVP offline). */
export function detectReplyLanguage(text) {
  const t = String(text || '');
  const esHits = (
    t.match(
      /\b(el|la|los|las|de|que|no|me|se|por|con|una|está|está|muy|pero|como|más|también|gracias|horrible|estafa|falla|pésimo|nunca|cambio)\b/gi,
    ) || []
  ).length;
  const enHits = (
    t.match(
      /\b(the|and|is|are|to|of|for|with|this|that|not|have|was|very|but|from|your|scam|broken|terrible|never|switch|refund)\b/gi,
    ) || []
  ).length;
  if (enHits > esHits + 1) return 'en';
  if (esHits >= enHits) return 'es';
  // Caracteres típicos ES
  if (/[áéíóúñ¿¡]/i.test(t)) return 'es';
  return enHits >= esHits ? 'en' : 'es';
}

export function buildLocalTriage(text) {
  const lang = detectReplyLanguage(text);
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
      ? lang === 'en'
        ? `Offline mode — risk signals: ${flags.join(', ')}`
        : `Modo offline — riesgo detectado: ${flags.join(', ')}`
      : lang === 'en'
        ? 'Offline mode — operational complaint without critical escalation signals.'
        : 'Modo offline — queja operativa sin escalado crítico.',
  };
}

function pickRecommendedTone(triage, text) {
  if (
    triage.recommendedAction.startsWith('ESCALATE') ||
    triage.recommendedAction === 'PRIVATE_DM' ||
    triage.recommendedAction === 'NO_ENGAGE'
  ) {
    return 'FORMAL_CORPORATE';
  }
  if (TECH_RE.test(text || '')) return 'RESOLUTIVE_TECHNICAL';
  return 'EMPATHETIC';
}

function copyForLang(lang, brand, cautious) {
  if (lang === 'en') {
    return {
      formal: {
        label: 'Formal corporate',
        body: cautious
          ? `Thank you for your message. At ${brand} we take this seriously. A specialist will contact you privately to review it confidentially.`
          : `We're sorry about the experience you described. At ${brand} we're reviewing the case to give you an accurate answer. Could you share your order or account ID?`,
        rationale: cautious
          ? 'Recommended when legal/privacy risk is present: cautious and moves to private.'
          : 'Institutional and careful tone.',
      },
      empath: {
        label: 'Empathetic',
        body: cautious
          ? `We understand how frustrating this must be. We want to help carefully: we'll reach out privately so sensitive details stay protected.`
          : `We're really sorry you went through this. We're here to help — tell us a bit more and we'll prioritize it.`,
        rationale: 'Validates emotion and opens dialogue; usually best in public.',
      },
      tech: {
        label: 'Technical / resolutive',
        body: cautious
          ? `We've logged your report. Per protocol, next steps are internal validation and a private follow-up. We'll avoid public technical details until scope is confirmed.`
          : `Got it. Next steps: 1) confirm the symptom, 2) check service/logs, 3) share a concrete plan in this thread or via DM as soon as we have it.`,
        rationale: 'Actionable when the issue looks technical/operational.',
      },
    };
  }

  return {
    formal: {
      label: 'Formal-Corporativa',
      body: cautious
        ? `Gracias por tu mensaje. En ${brand} tomamos muy en serio este tipo de situaciones. Un especialista te contactará por canal privado para revisarlo con la debida confidencialidad.`
        : `Lamentamos la experiencia descrita. En ${brand} estamos revisando el caso para darte una respuesta precisa. ¿Puedes compartir el número de pedido o cuenta asociada?`,
      rationale: cautious
        ? 'Recomendada si hay riesgo legal/privacidad: prudente y deriva a privado.'
        : 'Tono institucional y prudente.',
    },
    empath: {
      label: 'Empática-Cercana',
      body: cautious
        ? `Entendemos lo frustrante que debe ser esto. Queremos ayudarte con cuidado: te escribimos por privado para no exponer datos sensibles y resolverlo juntos.`
        : `Sentimos mucho que hayas pasado por esto. Estamos aquí para ayudarte: cuéntanos un poco más del problema y lo priorizamos.`,
      rationale: 'Valida emoción y abre diálogo; suele funcionar mejor en público.',
    },
    tech: {
      label: 'Resolutiva-Técnica',
      body: cautious
        ? `Hemos registrado tu reporte. Por protocolo, el siguiente paso es validación interna y contacto privado. Evitaremos detalles técnicos en público hasta confirmar el alcance.`
        : `Recibido. Pasos: 1) confirmar el síntoma, 2) revisar logs/estado del servicio, 3) devolverte un plan concreto en este hilo o por DM en cuanto lo tengamos.`,
      rationale: 'Enfoque accionable cuando el problema es técnico/operativo.',
    },
  };
}

export function buildLocalReplyOptions({ text, companyName }) {
  const lang = detectReplyLanguage(text);
  const brand = companyName || (lang === 'en' ? 'our team' : 'nuestro equipo');
  const triage = buildLocalTriage(text);
  const cautious =
    triage.recommendedAction.startsWith('ESCALATE') || triage.recommendedAction === 'PRIVATE_DM';
  const recommendedTone = pickRecommendedTone(triage, text);
  const copy = copyForLang(lang, brand, cautious);

  const options = [
    {
      tone: 'FORMAL_CORPORATE',
      label: copy.formal.label,
      body: copy.formal.body,
      rationale: copy.formal.rationale,
      recommended: recommendedTone === 'FORMAL_CORPORATE',
    },
    {
      tone: 'EMPATHETIC',
      label: copy.empath.label,
      body: copy.empath.body,
      rationale: copy.empath.rationale,
      recommended: recommendedTone === 'EMPATHETIC',
    },
    {
      tone: 'RESOLUTIVE_TECHNICAL',
      label: copy.tech.label,
      body: copy.tech.body,
      rationale: copy.tech.rationale,
      recommended: recommendedTone === 'RESOLUTIVE_TECHNICAL',
    },
  ];

  return {
    originalText: text,
    options,
    triage,
    model: 'local-fallback',
    generatedAt: new Date().toISOString(),
    language: lang,
  };
}
