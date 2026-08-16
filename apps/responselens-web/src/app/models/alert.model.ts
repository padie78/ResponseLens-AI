export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertWorkflowStatus = 'NEW' | 'CONTACTED' | 'SNOOZED' | 'DISMISSED' | 'WON';
export type BrandScope = 'own' | 'rival';
export type MentionKind =
  | 'comment'
  | 'post'
  | 'video'
  | 'news'
  | 'issue'
  | 'market'
  | 'pin'
  | 'professional'
  | 'thread'
  | 'web'
  | 'media';
export type SentimentLabel = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED' | string;

export interface ReplyOption {
  tone: string;
  label: string;
  body: string;
  rationale?: string;
  recommended?: boolean;
}

/** Structured SocialCrawl payload kept on alerts for analysis + UI. */
export interface SocialCrawlTopComment {
  score: number | null;
  excerpt: string;
  author: string | null;
  url: string | null;
  date: string | null;
  /** Respuesta de marca simulada (demo, no sale a la red real). */
  kind?: 'inbound' | 'brand_mock';
}

/** Publicación outbound simulada en la plataforma de origen. */
export interface MockOutboundPost {
  demo: true;
  platformKey: string;
  platformLabel: string;
  body: string;
  postedAt: string;
  author: string;
  sourceUrl: string;
}

export interface SocialCrawlMeta {
  provider: 'socialcrawl';
  title?: string | null;
  finalScore?: number | null;
  rerankScore?: number | null;
  engagement?: {
    points: number | null;
    numComments: number | null;
  };
  topComments?: SocialCrawlTopComment[];
  sources?: string[];
  clusterId?: string | null;
  clusterTitle?: string | null;
  clusterScore?: number | null;
  thumbnailUrl?: string | null;
  transcript?: string | null;
  planIntent?: string | null;
  candidateId?: string | null;
  /** Autor de la pieza (post/video), no del comentario top. */
  author?: string | null;
  publishedAt?: string | null;
  /** Dominio de la URL (noticias). */
  domain?: string | null;
}

export interface ConquestIntel {
  analisis_metrico: {
    sentimiento: 'positivo' | 'neutral' | 'negativo';
    score_sentimiento: number;
    categoria_operativa: string;
    etiquetas: string[];
    alerta_reputacional_critica: boolean;
  };
  sales_intelligence: {
    resumen_incidente: string;
    gancho_comercial_ia: string;
    score_conversion_estimado: 'alto' | 'medio' | 'bajo';
  };
}

/** Raw opportunity shape returned by the scan engine. */
export interface ScanOpportunity {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl: string;
  channel: string;
  severity: AlertSeverity;
  frustrationScore: number;
  salesPitch: string;
  detectedAt: string;
  status?: AlertWorkflowStatus;
  notes?: string;
  _conquest?: ConquestIntel;
  _brandScope?: BrandScope;
  _sentiment?: SentimentLabel;
  _mentionKind?: MentionKind;
  _actionable?: boolean;
  _analysisSummary?: string;
  _insight?: {
    tipo?: string;
    lectura?: string;
    accion?: string;
    tip?: string;
  };
  _intel?: unknown;
  _source?: string;
  _scMeta?: SocialCrawlMeta;
  _aiScore?: number;
  _aiScoreBand?: string;
  _aiScoreLabel?: string;
  _aiScoreDrivers?: string[];
  _aiScoreKind?: 'risk' | 'opportunity' | string;
  replyOptions?: ReplyOption[];
}

export interface CompetitorAlert {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl: string;
  channel: string;
  severity: AlertSeverity;
  frustrationScore: number | null;
  salesPitch: string;
  detectedAt: string;
  status: AlertWorkflowStatus;
  notes: string;
  brandScope: BrandScope;
  sentiment: string;
  inboundSource: string;
  /** Cloud enrichment blob (Dynamo / AppSync metaJson) */
  metaJson?: Record<string, unknown> | null;
  /** Plugin-parity optional fields */
  _brandScope?: BrandScope;
  _sentiment?: SentimentLabel;
  _mentionKind?: MentionKind;
  _actionable?: boolean;
  _analysisSummary?: string;
  _intel?: unknown;
  _source?: string;
  /** SocialCrawl enrichment (scores, engagement, top comments, cluster). */
  _scMeta?: SocialCrawlMeta;
  _aiScore?: number;
  _aiScoreBand?: string;
  _aiScoreLabel?: string;
  _aiScoreDrivers?: string[];
  _aiScoreKind?: 'risk' | 'opportunity' | string;
  _insight?: {
    tipo?: string;
    lectura?: string;
    accion?: string;
    tip?: string;
  };
  _conquest?: ConquestIntel;
  replyOptions?: ReplyOption[];
  _mockPost?: MockOutboundPost;
}

export function createAlertId(): string {
  return `al_${crypto.randomUUID().slice(0, 10)}`;
}

/** Fields persisted in Dynamo metaJson (not first-class GraphQL columns). */
export function packAlertMeta(alert: Partial<CompetitorAlert>): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (alert._scMeta) meta['_scMeta'] = alert._scMeta;
  if (alert._aiScore != null) meta['_aiScore'] = alert._aiScore;
  if (alert._aiScoreBand) meta['_aiScoreBand'] = alert._aiScoreBand;
  if (alert._aiScoreLabel) meta['_aiScoreLabel'] = alert._aiScoreLabel;
  if (alert._aiScoreDrivers) meta['_aiScoreDrivers'] = alert._aiScoreDrivers;
  if (alert._aiScoreKind) meta['_aiScoreKind'] = alert._aiScoreKind;
  if (alert._mentionKind) meta['_mentionKind'] = alert._mentionKind;
  if (alert._analysisSummary) meta['_analysisSummary'] = alert._analysisSummary;
  if (alert._insight) meta['_insight'] = alert._insight;
  if (alert._intel != null) meta['_intel'] = alert._intel;
  if (alert._source) meta['_source'] = alert._source;
  if (alert._actionable != null) meta['_actionable'] = alert._actionable;
  if (alert.replyOptions) meta['replyOptions'] = alert.replyOptions;
  if (alert._conquest) meta['_conquest'] = alert._conquest;
  if (alert._mockPost) meta['_mockPost'] = alert._mockPost;
  if (alert.metaJson && typeof alert.metaJson === 'object') {
    Object.assign(meta, alert.metaJson);
  }
  return Object.keys(meta).length ? meta : null;
}

export function unpackAlertMeta(
  alert: CompetitorAlert,
  metaJson?: unknown,
): CompetitorAlert {
  let meta: Record<string, unknown> | null = null;
  const raw = metaJson ?? alert.metaJson;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      meta = null;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    meta = raw as Record<string, unknown>;
  }

  if (!meta) return { ...alert, metaJson: alert.metaJson ?? null };

  return {
    ...alert,
    metaJson: meta,
    _scMeta: (meta['_scMeta'] as SocialCrawlMeta | undefined) ?? alert._scMeta,
    _aiScore: (meta['_aiScore'] as number | undefined) ?? alert._aiScore,
    _aiScoreBand: (meta['_aiScoreBand'] as string | undefined) ?? alert._aiScoreBand,
    _aiScoreLabel: (meta['_aiScoreLabel'] as string | undefined) ?? alert._aiScoreLabel,
    _aiScoreDrivers:
      (meta['_aiScoreDrivers'] as string[] | undefined) ?? alert._aiScoreDrivers,
    _aiScoreKind: (meta['_aiScoreKind'] as string | undefined) ?? alert._aiScoreKind,
    _mentionKind: (meta['_mentionKind'] as MentionKind | undefined) ?? alert._mentionKind,
    _analysisSummary:
      (meta['_analysisSummary'] as string | undefined) ?? alert._analysisSummary,
    _insight:
      (meta['_insight'] as CompetitorAlert['_insight'] | undefined) ?? alert._insight,
    _intel: meta['_intel'] ?? alert._intel,
    _source: (meta['_source'] as string | undefined) ?? alert._source,
    _actionable: (meta['_actionable'] as boolean | undefined) ?? alert._actionable,
    replyOptions: (meta['replyOptions'] as ReplyOption[] | undefined) ?? alert.replyOptions,
    _conquest: (meta['_conquest'] as ConquestIntel | undefined) ?? alert._conquest,
    _mockPost: (meta['_mockPost'] as MockOutboundPost | undefined) ?? alert._mockPost,
    _brandScope: alert.brandScope,
  };
}

export function mapOpportunityToAlert(opp: ScanOpportunity, userId: string): CompetitorAlert {
  const brandScope: BrandScope = opp._brandScope === 'own' ? 'own' : 'rival';
  const sentiment =
    opp._sentiment ||
    (brandScope === 'own' ? 'NEUTRAL' : 'negative');

  const base: CompetitorAlert = {
    alertId: opp.alertId || createAlertId(),
    userId: opp.userId || userId,
    competitorName: opp.competitorName,
    originalComplaint: opp.originalComplaint,
    sourceUrl: opp.sourceUrl,
    channel: opp.channel || 'manual',
    severity: opp.severity || 'MEDIUM',
    frustrationScore:
      typeof opp.frustrationScore === 'number' ? opp.frustrationScore : null,
    salesPitch: opp.salesPitch || '',
    detectedAt: opp.detectedAt || new Date().toISOString(),
    status: opp.status || 'NEW',
    notes: opp.notes || '',
    brandScope,
    sentiment: String(sentiment).toLowerCase(),
    inboundSource: opp._source || 'scan',
    _brandScope: brandScope,
    _sentiment: opp._sentiment,
    _mentionKind: opp._mentionKind,
    _actionable: opp._actionable,
    _analysisSummary: opp._analysisSummary,
    _insight: opp._insight,
    _intel: opp._intel,
    _source: opp._source,
    ...(opp._scMeta ? { _scMeta: opp._scMeta } : {}),
    _aiScore: opp._aiScore,
    _aiScoreBand: opp._aiScoreBand,
    _aiScoreLabel: opp._aiScoreLabel,
    _aiScoreDrivers: opp._aiScoreDrivers,
    _aiScoreKind: opp._aiScoreKind,
    _conquest: opp._conquest,
    replyOptions: opp.replyOptions,
  };
  base.metaJson = packAlertMeta(base);
  return base;
}
