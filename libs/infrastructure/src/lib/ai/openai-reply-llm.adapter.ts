import type { AnalyzeReplyInputDto, AnalyzeRivalReportInputDto, IReplyLlmPort, LlmReplyResult, RivalReportDto } from '@responselens/application';
import {
  REPLY_TONE_LABELS,
  REPLY_TONES,
  type ComplaintTriage,
  type EscalationFlag,
  type RecommendedAction,
  type ReplyOption,
  type ReplyTone,
  type RiskLevel,
} from '@responselens/domain';

const SYSTEM_PROMPT = `Eres el motor de redacción y triage de ResponseLens AI para equipos de soporte B2B.
Tu ÚNICA salida debe ser un objeto JSON válido (UTF-8) SIN markdown, SIN fences, SIN comentarios ni texto extra.

Contrato JSON obligatorio:
{
  "triage": {
    "riskScore": 0.0,
    "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
    "escalationFlags": ["LEGAL_THREAT|SAFETY_HARM|DATA_PRIVACY|CHARGEBACK|INFLUENCER_REACH|CHURN_SIGNAL"],
    "recommendedAction": "PUBLIC_REPLY|PRIVATE_DM|ESCALATE_LEGAL|ESCALATE_SAFETY|NO_ENGAGE",
    "keyIssues": ["tema1", "tema2"],
    "summary": "1 frase del riesgo reputacional"
  },
  "options": [
    { "tone": "FORMAL_CORPORATE", "label": "Formal-Corporativa", "body": "...", "rationale": "...", "recommended": false },
    { "tone": "EMPATHETIC", "label": "Empática-Cercana", "body": "...", "rationale": "...", "recommended": true },
    { "tone": "RESOLUTIVE_TECHNICAL", "label": "Resolutiva-Técnica", "body": "...", "rationale": "...", "recommended": false }
  ]
}

Reglas:
- IDIOMA OBLIGATORIO: escribe body, rationale, label y triage.summary en el MISMO idioma que la queja original (detecta ES, EN, PT, FR, etc.). Si la queja está en inglés, TODO el texto generado va en inglés; si en español, en español. No mezcles idiomas.
- No inventes políticas, plazos ni compensaciones.
- Si hay amenaza legal/seguridad/privacidad: recommendedAction debe ser ESCALATE_* o PRIVATE_DM; body debe ser prudente.
- riskScore entre 0 y 1.
- body autónomo 2–5 frases.
- Marca EXACTAMENTE una opción con "recommended": true (la mejor para publicar/usar ahora) y justifica en rationale por qué esa.`;

const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ACTIONS: RecommendedAction[] = [
  'PUBLIC_REPLY',
  'PRIVATE_DM',
  'ESCALATE_LEGAL',
  'ESCALATE_SAFETY',
  'NO_ENGAGE',
];
const FLAGS: EscalationFlag[] = [
  'LEGAL_THREAT',
  'SAFETY_HARM',
  'DATA_PRIVACY',
  'CHARGEBACK',
  'INFLUENCER_REACH',
  'CHURN_SIGNAL',
];

function buildUserPrompt(input: AnalyzeReplyInputDto): string {
  return [
    'Analiza el riesgo y genera 3 respuestas para esta queja pública.',
    'CRÍTICO: las 3 respuestas (body) y rationale deben estar en el mismo idioma que la queja.',
    `Canal: ${input.channel || 'unknown'}`,
    `URL: ${input.sourceUrl || 'n/a'}`,
    `Marca: ${input.companyName || 'n/a'}`,
    `Qué vende: ${input.whatTheySell || 'n/a'}`,
    `Notas de voz: ${input.brandVoiceNotes || 'n/a'}`,
    '',
    'Queja original:',
    input.text.trim(),
  ].join('\n');
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeOptions(parsed: unknown): ReplyOption[] {
  const options =
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray((parsed as { options?: unknown }).options)
      ? (parsed as { options: unknown[] }).options
      : [];

  const byTone = new Map<ReplyTone, ReplyOption>();
  for (const item of options) {
    if (!item || typeof item !== 'object') continue;
    const tone = String((item as { tone?: string }).tone || '').toUpperCase() as ReplyTone;
    if (!REPLY_TONES.includes(tone)) continue;
    const body = String((item as { body?: string }).body || '').trim();
    if (!body) continue;
    byTone.set(tone, {
      tone,
      label: REPLY_TONE_LABELS[tone],
      body,
      rationale: (item as { rationale?: string }).rationale
        ? String((item as { rationale?: string }).rationale).trim()
        : null,
      recommended: Boolean((item as { recommended?: unknown }).recommended),
    });
  }

  const missing = REPLY_TONES.filter((t) => !byTone.has(t));
  if (missing.length) {
    throw new Error(`LLM_MISSING_TONES: ${missing.join(',')}`);
  }

  const ordered = REPLY_TONES.map((t) => byTone.get(t)!);
  if (!ordered.some((o) => o.recommended)) {
    for (const o of ordered) {
      o.recommended = o.tone === 'EMPATHETIC';
    }
  } else {
    let seen = false;
    for (const o of ordered) {
      if (o.recommended && !seen) {
        seen = true;
      } else {
        o.recommended = false;
      }
    }
  }
  return ordered;
}

function heuristicTriage(text: string): ComplaintTriage {
  const lower = text.toLowerCase();
  const flags: EscalationFlag[] = [];
  if (/\b(abogad|demanda|legal|lawsuit|attorney|sue)\b/i.test(lower)) flags.push('LEGAL_THREAT');
  if (/\b(amenaza|suicid|violencia|harm|danger)\b/i.test(lower)) flags.push('SAFETY_HARM');
  if (/\b(gdpr|rgpd|datos personales|doxx|privacy)\b/i.test(lower)) flags.push('DATA_PRIVACY');
  if (/\b(chargeback|contracargo|paypal|dispute)\b/i.test(lower)) flags.push('CHARGEBACK');
  if (/\b(followers|seguidores|viral|influencer)\b/i.test(lower)) flags.push('INFLUENCER_REACH');
  if (/\b(me cambio|cancel|switch|never again|nunca m[aá]s)\b/i.test(lower)) flags.push('CHURN_SIGNAL');

  let riskScore = Math.min(0.35 + flags.length * 0.15, 0.95);
  if (/\b(estafa|fraude|scam|horrible|pésim)\b/i.test(lower)) riskScore = Math.max(riskScore, 0.7);

  const riskLevel: RiskLevel =
    riskScore >= 0.85 ? 'CRITICAL' : riskScore >= 0.7 ? 'HIGH' : riskScore >= 0.45 ? 'MEDIUM' : 'LOW';

  let recommendedAction: RecommendedAction = 'PUBLIC_REPLY';
  if (flags.includes('SAFETY_HARM')) recommendedAction = 'ESCALATE_SAFETY';
  else if (flags.includes('LEGAL_THREAT')) recommendedAction = 'ESCALATE_LEGAL';
  else if (flags.includes('DATA_PRIVACY')) recommendedAction = 'PRIVATE_DM';
  else if (riskLevel === 'CRITICAL') recommendedAction = 'PRIVATE_DM';

  return {
    riskScore: Number(riskScore.toFixed(2)),
    riskLevel,
    escalationFlags: flags,
    recommendedAction,
    keyIssues: flags.length ? flags.map((f) => f.toLowerCase()) : ['satisfacción'],
    summary: flags.length
      ? `Señal de riesgo: ${flags.join(', ')}`
      : 'Queja operativa sin señales de escalado crítico.',
  };
}

function normalizeTriage(parsed: unknown, fallbackText: string): ComplaintTriage {
  const raw =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { triage?: Record<string, unknown> }).triage
      : undefined;

  if (!raw || typeof raw !== 'object') {
    return heuristicTriage(fallbackText);
  }

  const riskScore = Math.min(1, Math.max(0, Number(raw.riskScore) || 0));
  const riskLevel = RISK_LEVELS.includes(String(raw.riskLevel).toUpperCase() as RiskLevel)
    ? (String(raw.riskLevel).toUpperCase() as RiskLevel)
    : riskScore >= 0.85
      ? 'CRITICAL'
      : riskScore >= 0.7
        ? 'HIGH'
        : riskScore >= 0.45
          ? 'MEDIUM'
          : 'LOW';

  const recommendedAction = ACTIONS.includes(
    String(raw.recommendedAction).toUpperCase() as RecommendedAction,
  )
    ? (String(raw.recommendedAction).toUpperCase() as RecommendedAction)
    : 'PUBLIC_REPLY';

  const escalationFlags = Array.isArray(raw.escalationFlags)
    ? raw.escalationFlags
        .map((f) => String(f).toUpperCase() as EscalationFlag)
        .filter((f) => FLAGS.includes(f))
    : [];

  const keyIssues = Array.isArray(raw.keyIssues)
    ? raw.keyIssues.map((k) => String(k)).filter(Boolean).slice(0, 6)
    : [];

  return {
    riskScore: Number(riskScore.toFixed(2)),
    riskLevel,
    escalationFlags,
    recommendedAction,
    keyIssues,
    summary: String(raw.summary || '').trim() || heuristicTriage(fallbackText).summary,
  };
}

async function callOpenAI(system: string, user: string): Promise<{ raw: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('MISSING_OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OPENAI_HTTP_${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OPENAI_EMPTY_CONTENT');
  return { raw: content, model: data.model || model };
}

async function callGemini(system: string, user: string): Promise<{ raw: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('MISSING_GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GEMINI_HTTP_${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('GEMINI_EMPTY_CONTENT');
  return { raw: content, model };
}

const RIVAL_SYSTEM_PROMPT = `Eres el motor de inteligencia competitiva de ResponseLens AI.
Tu ÚNICA salida debe ser un objeto JSON válido (UTF-8) SIN markdown fences ni texto extra.

Contrato JSON:
{
  "competitorName": "string",
  "mentionCount": 0,
  "avgFrustration": 0.0,
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "themes": [{ "id": "reliability", "label": "Confiabilidad" }],
  "conclusions": ["...", "...", "..."],
  "opportunities": ["...", "..."],
  "reportMarkdown": "# Informe...\\n...",
  "sources": ["url opcional"]
}

Reglas:
- Idioma del informe = idioma dominante de las menciones.
- conclusions: 4–6 bullets accionables (dolor del rival, ventana de captación).
- opportunities: 3–5 ángulos de outreach (sin spam, sin inventar precios).
- reportMarkdown: informe corto en Markdown (títulos + listas).
- No inventes hechos no presentes en menciones o perfil; podés inferir temas.
- avgFrustration entre 0 y 1.`;

function buildRivalUserPrompt(input: AnalyzeRivalReportInputDto): string {
  return [
    'Generá un informe de inteligencia competitiva del rival a partir de menciones públicas negativas.',
    `Rival: ${input.competitorName}`,
    `Marca propia: ${input.companyName || 'n/a'}`,
    `Qué vende la marca propia: ${input.whatTheySell || 'n/a'}`,
    `Notas de voz: ${input.brandVoiceNotes || 'n/a'}`,
    `Canal: ${input.channel || 'web'}`,
    `URL: ${input.sourceUrl || 'n/a'}`,
    '',
    'Menciones:',
    ...input.mentions.map((m, i) => `${i + 1}. ${m}`),
  ].join('\n');
}

function normalizeRivalReport(parsed: unknown, input: AnalyzeRivalReportInputDto, model: string): RivalReportDto {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const conclusions = Array.isArray(obj.conclusions) ? obj.conclusions.map(String) : [];
  const opportunities = Array.isArray(obj.opportunities) ? obj.opportunities.map(String) : [];
  const themes = Array.isArray(obj.themes)
    ? obj.themes.map((t) => {
        if (typeof t === 'string') return { id: t, label: t };
        const row = t as Record<string, unknown>;
        return { id: String(row.id || row.label || ''), label: String(row.label || row.id || '') };
      })
    : [];
  return {
    competitorName: String(obj.competitorName || input.competitorName),
    mentionCount: Number(obj.mentionCount) || input.mentions.length,
    avgFrustration: Number(obj.avgFrustration) || 0.5,
    riskLevel: String(obj.riskLevel || 'MEDIUM'),
    conclusions: conclusions.length ? conclusions : ['Señales de fricción pública detectadas.'],
    opportunities: opportunities.length ? opportunities : ['Outreach empático con propuesta de valor clara.'],
    reportMarkdown: String(obj.reportMarkdown || `# Informe — ${input.competitorName}`),
    model,
    generatedAt: new Date().toISOString(),
    themes,
    sources: Array.isArray(obj.sources)
      ? obj.sources.map(String)
      : input.sourceUrl
        ? [String(input.sourceUrl)]
        : [],
  };
}

export class OpenAiReplyLlmAdapter implements IReplyLlmPort {
  async generateReplyOptions(input: AnalyzeReplyInputDto): Promise<LlmReplyResult> {
    const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
    const user = buildUserPrompt(input);
    const llm =
      provider === 'gemini'
        ? await callGemini(SYSTEM_PROMPT, user)
        : await callOpenAI(SYSTEM_PROMPT, user);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(llm.raw));
    } catch (err) {
      throw new Error(`LLM_INVALID_JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      options: normalizeOptions(parsed),
      triage: normalizeTriage(parsed, input.text),
      model: llm.model,
    };
  }

  async generateRivalReport(input: AnalyzeRivalReportInputDto): Promise<RivalReportDto> {
    const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
    const user = buildRivalUserPrompt(input);
    const llm =
      provider === 'gemini'
        ? await callGemini(RIVAL_SYSTEM_PROMPT, user)
        : await callOpenAI(RIVAL_SYSTEM_PROMPT, user);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(llm.raw));
    } catch (err) {
      throw new Error(`LLM_INVALID_JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    return normalizeRivalReport(parsed, input, llm.model);
  }
}

/** Exportado para fallback local / tests. */
export { heuristicTriage };
