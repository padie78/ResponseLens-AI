import {
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { craftSalesPitchVariants } from '../../../engine/competitor-opportunity.js';
import { buildLocalReplyOptions } from '../../../engine/local-fallback.js';
import { ensureItemIntel } from '../../../engine/mention-intelligence.js';
import {
  buildCapturePlaybook,
  buildDefensePlaybook,
} from '../../../engine/playbooks.js';
import {
  platformDisplayLabel,
} from '../../../engine/platforms.js';
import { detectThemes, primaryTheme } from '../../../engine/theme-rules.js';
import type { CompetitorAlert, ReplyOption, SocialCrawlMeta } from '../../../models/alert.model';
import { UserConfigStore } from '../../../stores/user-config.store';

type PitchOption = {
  id?: string;
  tone?: string;
  label: string;
  body: string;
  rationale?: string;
  recommended?: boolean;
};

type PlaybookStep = { id: string; title: string; body: string };
type PlaybookView = {
  oneLiner: string;
  steps: PlaybookStep[];
  donts: string[];
};

/**
 * UX híbrido (plugin parity + feed usable):
 * - Colapsado: escanear lista (score, badges, snippet, CTA rápida).
 * - Expandido: operar (texto, KPIs, borradores/pitch, acciones).
 * - Modal: análisis profundo (insight, drivers, playbook, respuesta sugerida).
 */
@Component({
  standalone: true,
  selector: 'rl-alert-card',
  encapsulation: ViewEncapsulation.None,
  imports: [DialogModule, ButtonModule, TagModule, PrimeTemplate],
  template: `
    <article
      class="rl-alert rl-alert--accordion"
      [class.is-expanded]="expanded()"
      [class.rl-alert--selected]="selected()"
      [class.rl-alert--mention]="!actionable()"
      [class.rl-alert--moderation]="needsModeration()"
      [attr.data-severity]="alert().severity"
      [attr.data-score-band]="scoreBand()"
    >
      <button
        type="button"
        class="rl-alert__summary"
        [attr.aria-expanded]="expanded()"
        (click)="toggle()"
      >
        <span
          class="rl-score"
          [attr.data-band]="scoreBand()"
          [style.--rl-score]="score()"
          [attr.title]="scoreLabel()"
        >
          <span class="rl-score__ring" aria-hidden="true"></span>
          <span class="rl-score__value">{{ score() }}</span>
        </span>

        <span class="rl-alert__summary-text">
          <span class="rl-alert__title-row">
            <strong>{{ alert().competitorName || (isOwn() ? 'Tu marca' : 'Rival') }}</strong>
            <span class="rl-alert__title-badges">
              <span class="rl-badge" [attr.data-band]="scoreBand()">{{ score() }}</span>
              @if (needsModeration()) {
                <span class="rl-badge rl-badge--moderation">Moderación</span>
              }
              @if (isOwn()) {
                <span class="rl-badge" [class.rl-badge--comment]="actionable()" [class.rl-badge--mention]="!actionable()">
                  {{ actionable() ? 'Comentario' : 'Mención' }}
                </span>
                <span class="rl-badge" [class]="sentimentClass()">{{ sentimentLabelEs() }}</span>
              } @else {
                <span class="rl-badge" [class]="'rl-badge--' + severityKey()">{{ severityShort() }}</span>
              }
              @if (platformLabel()) {
                <span class="rl-badge rl-badge--platform">{{ platformLabel() }}</span>
              }
              @if (engagementLabel(); as eng) {
                <span class="rl-badge rl-badge--reach">{{ eng }}</span>
              }
              @if (clusterLabel(); as cl) {
                <span class="rl-badge rl-badge--cluster" [title]="cl">Cluster</span>
              }
            </span>
          </span>
          <span class="rl-alert__snippet">{{ snippet() }}</span>
          <span class="rl-alert__meta-line">{{ metaLine() }}</span>
        </span>

        <span class="rl-alert__side">
          <span
            class="rl-alert__quick"
            role="button"
            tabindex="0"
            title="Abrir análisis IA"
            (click)="openAnalysis($event)"
            (keydown.enter)="openAnalysis($event)"
          >
            <i class="pi pi-sparkles"></i>
          </span>
          <span class="rl-alert__chevron" aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
        </span>
      </button>

      @if (expanded()) {
        <div class="rl-alert__body" (click)="$event.stopPropagation()">
          <div class="rl-kpi-strip">
            <div class="rl-kpi-strip__item">
              <span class="rl-kpi-strip__label">{{ scoreKindShort() }}</span>
              <strong>{{ score() }}/100</strong>
            </div>
            @if (frictionPct() != null) {
              <div class="rl-kpi-strip__item">
                <span class="rl-kpi-strip__label">Fricción</span>
                <strong>{{ frictionPct() }}%</strong>
              </div>
            }
            <div class="rl-kpi-strip__item">
              <span class="rl-kpi-strip__label">Acción</span>
              <strong>{{ recommendedActionShort() }}</strong>
            </div>
            <div class="rl-kpi-strip__item">
              <span class="rl-kpi-strip__label">SLA</span>
              <strong>{{ slaLabel() }}</strong>
            </div>
            @if (engagementLabel(); as eng) {
              <div class="rl-kpi-strip__item">
                <span class="rl-kpi-strip__label">Alcance</span>
                <strong>{{ eng }}</strong>
              </div>
            }
          </div>

          <div class="rl-alert__toolbar">
            <div class="rl-alert__meta-row">
              <span class="rl-badge rl-badge--status">{{ alert().status || 'NEW' }}</span>
              @if (themeLabel()) {
                <span class="rl-badge rl-badge--theme">{{ themeLabel() }}</span>
              }
              @for (t of themeLabels().slice(0, 2); track t) {
                @if (t !== themeLabel()) {
                  <span class="rl-badge rl-badge--theme">{{ t }}</span>
                }
              }
              @if (relativeTime()) {
                <span class="rl-muted">{{ relativeTime() }}</span>
              }
            </div>
            <div class="rl-alert__toolbar-actions">
              <p-button label="Análisis IA" icon="pi pi-sparkles" size="small" (onClick)="openAnalysis()" />
              @if (hasSourceUrl()) {
                <a class="rl-alert__link-btn" [href]="alert().sourceUrl" target="_blank" rel="noopener">Fuente</a>
              }
            </div>
          </div>

          <p class="rl-alert__complaint">{{ alert().originalComplaint }}</p>

          <button type="button" class="rl-analysis-teaser" (click)="openAnalysis()">
            <span class="rl-analysis-teaser__label">Insight · {{ recommendedActionShort() }}</span>
            <span class="rl-analysis-teaser__text">{{ analysisPreview() }}</span>
            <span class="rl-analysis-teaser__cta">Ver análisis completo, playbook y respuesta →</span>
          </button>

          @if (isOwn() && actionable()) {
            <p class="rl-muted rl-alert__section-label">Borradores de respuesta</p>
            <div class="rl-pitch-tabs">
              @for (opt of draftOptions(); track opt.tone || opt.label) {
                <button
                  type="button"
                  class="rl-pitch-tab"
                  [class.is-active]="selectedDraft()?.tone === opt.tone"
                  [class.is-rec]="opt.recommended"
                  (click)="selectDraft(opt)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
            @if (selectedDraft(); as draft) {
              <div class="rl-pitch-preview">
                @if (draft.rationale) {
                  <p class="rl-rationale">{{ draft.rationale }}</p>
                }
                <p><em>{{ draft.body }}</em></p>
              </div>
            }
            <div class="rl-action-bar">
              <p-button label="Copiar" icon="pi pi-copy" severity="secondary" [outlined]="true" size="small" (onClick)="copyDraft()" />
              <p-button label="Workspace" icon="pi pi-bolt" severity="secondary" [outlined]="true" size="small" (onClick)="analyze.emit(alert().alertId)" />
              <p-button label="Respondido" icon="pi pi-check" size="small" (onClick)="markResponded()" />
              <p-button label="Descartar" severity="danger" [text]="true" size="small" (onClick)="dismiss.emit(alert().alertId)" />
            </div>
          } @else if (isOwn()) {
            <p class="rl-hint rl-alert__mention-hint">
              Mención en medio / noticia: monitorear reputación, no responder en hilo.
            </p>
            <div class="rl-action-bar">
              <p-button label="Marcar vista" size="small" (onClick)="markResponded()" />
              <p-button label="Descartar" severity="danger" [text]="true" size="small" (onClick)="dismiss.emit(alert().alertId)" />
            </div>
          } @else {
            <p class="rl-muted rl-alert__section-label">Pitch de captación</p>
            <div class="rl-pitch-tabs">
              @for (opt of pitchOptions(); track opt.id || opt.label) {
                <button
                  type="button"
                  class="rl-pitch-tab"
                  [class.is-active]="selectedPitch()?.id === opt.id"
                  [class.is-rec]="opt.recommended"
                  (click)="selectPitch(opt)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
            @if (selectedPitch(); as pitch) {
              <div class="rl-pitch-preview">
                @if (pitch.rationale) {
                  <p class="rl-rationale">{{ pitch.rationale }}</p>
                }
                <p><em>{{ pitch.body }}</em></p>
              </div>
            }
            <div class="rl-action-bar">
              <p-button label="Copiar pitch" icon="pi pi-copy" severity="secondary" [outlined]="true" size="small" (onClick)="copyPitch()" />
              @if (showCapture()) {
                <p-button label="Contactado" size="small" (onClick)="contact.emit(alert().alertId)" />
                <p-button label="Ganado" severity="success" size="small" (onClick)="won.emit(alert().alertId)" />
              }
              <p-button label="Descartar" severity="danger" [text]="true" size="small" (onClick)="dismiss.emit(alert().alertId)" />
            </div>
          }
        </div>
      }
    </article>

    <p-dialog
      [(visible)]="analysisOpen"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(640px, 96vw)' }"
      styleClass="rl-analysis-dialog"
      [header]="analysisTitle()"
      (onHide)="analysisOpen = false"
    >
      <div class="rl-analysis-modal">
        <div class="rl-analysis-modal__score">
          <span class="rl-score rl-score--lg" [attr.data-band]="scoreBand()" [style.--rl-score]="score()">
            <span class="rl-score__ring" aria-hidden="true"></span>
            <span class="rl-score__value">{{ score() }}</span>
          </span>
          <div>
            <p class="rl-analysis-modal__score-label">{{ scoreLabel() }}</p>
            <p class="rl-muted">{{ scoreKindLabel() }} · SLA {{ slaLabel() }}</p>
            <p class="rl-analysis-modal__action">{{ recommendedAction() }}</p>
          </div>
        </div>

        @if (needsModeration()) {
          <div class="rl-analysis-modal__warn">
            Requiere moderación humana antes de cualquier respuesta pública.
          </div>
        }

        <div class="rl-analysis-modal__tags">
          <p-tag [value]="sentimentLabelEs()" [severity]="sentimentSeverity()" />
          <p-tag [value]="severityShort()" severity="warn" />
          @if (intelCategory()) {
            <p-tag [value]="intelCategory()" severity="secondary" />
          }
          @if (platformLabel()) {
            <p-tag [value]="platformLabel()" severity="info" />
          }
          @if (frictionPct() != null) {
            <p-tag [value]="'Fricción ' + frictionPct() + '%'" severity="contrast" />
          }
          @for (t of themeLabels(); track t) {
            <p-tag [value]="t" severity="secondary" />
          }
          @if (engagementLabel(); as eng) {
            <p-tag [value]="eng" severity="info" />
          }
          @if (scRankLabel(); as rk) {
            <p-tag [value]="rk" severity="contrast" />
          }
        </div>

        @if (scMeta(); as sc) {
          <section class="rl-analysis-modal__block rl-sc-signal">
            <h3>Señal SocialCrawl</h3>
            <div class="rl-sc-signal__grid">
              @if (sc.title) {
                <div>
                  <span>Título</span>
                  <strong>{{ sc.title }}</strong>
                </div>
              }
              @if (engagementLabel(); as eng) {
                <div>
                  <span>Engagement</span>
                  <strong>{{ eng }}</strong>
                </div>
              }
              @if (sc.finalScore != null) {
                <div>
                  <span>Final score</span>
                  <strong>{{ formatScore(sc.finalScore) }}</strong>
                </div>
              }
              @if (sc.rerankScore != null) {
                <div>
                  <span>Rerank</span>
                  <strong>{{ sc.rerankScore }}</strong>
                </div>
              }
              @if (sc.sources?.length) {
                <div>
                  <span>Fuentes</span>
                  <strong>{{ sourcesLabel() }}</strong>
                </div>
              }
              @if (sc.planIntent) {
                <div>
                  <span>Intent</span>
                  <strong>{{ sc.planIntent }}</strong>
                </div>
              }
              @if (sc.clusterTitle) {
                <div class="rl-sc-signal__wide">
                  <span>Cluster</span>
                  <strong>{{ sc.clusterTitle }}</strong>
                </div>
              }
            </div>
            @if (sc.thumbnailUrl) {
              <img class="rl-sc-signal__thumb" [src]="sc.thumbnailUrl" alt="" loading="lazy" />
            }
          </section>
        }

        @if (topComments().length) {
          <section class="rl-analysis-modal__block">
            <h3>Top comments</h3>
            <ul class="rl-sc-comments">
              @for (c of topComments(); track c.excerpt) {
                <li>
                  <div class="rl-sc-comments__head">
                    <strong>{{ c.author || 'anónimo' }}</strong>
                    @if (c.score != null) {
                      <span class="rl-muted">{{ c.score }} pts</span>
                    }
                    @if (c.url) {
                      <a [href]="c.url" target="_blank" rel="noopener">ver</a>
                    }
                  </div>
                  <p>{{ c.excerpt }}</p>
                </li>
              }
            </ul>
          </section>
        }

        <section class="rl-analysis-modal__block">
          <h3>Análisis estratégico</h3>
          <p>{{ analysisText() }}</p>
        </section>

        @if (suggestedReply()) {
          <section class="rl-analysis-modal__block">
            <div class="rl-analysis-modal__block-head">
              <h3>Respuesta sugerida</h3>
              <p-button
                label="Copiar"
                icon="pi pi-copy"
                size="small"
                severity="secondary"
                [outlined]="true"
                (onClick)="copySuggested()"
              />
            </div>
            <p class="rl-analysis-modal__quote">{{ suggestedReply() }}</p>
          </section>
        }

        @if (scoreDrivers().length) {
          <section class="rl-analysis-modal__block">
            <h3>Drivers del score</h3>
            <ul class="rl-analysis-modal__drivers">
              @for (d of scoreDrivers(); track d) {
                <li>{{ d }}</li>
              }
            </ul>
          </section>
        }

        @if (playbook(); as pb) {
          <section class="rl-analysis-modal__block">
            <h3>Playbook</h3>
            <p class="rl-playbook__line">{{ pb.oneLiner }}</p>
            <ol class="rl-playbook__steps">
              @for (s of pb.steps; track s.id; let i = $index) {
                <li><strong>{{ i + 1 }}. {{ s.title }}</strong> — {{ s.body }}</li>
              }
            </ol>
            @if (pb.donts.length) {
              <p class="rl-muted rl-alert__section-label">No hacer</p>
              <ul class="rl-playbook__donts">
                @for (d of pb.donts; track d) {
                  <li>{{ d }}</li>
                }
              </ul>
            }
          </section>
        }

        <section class="rl-analysis-modal__block">
          <div class="rl-analysis-modal__block-head">
            <h3>Texto original</h3>
            @if (hasSourceUrl()) {
              <a [href]="alert().sourceUrl" target="_blank" rel="noopener">Abrir fuente</a>
            }
          </div>
          <p class="rl-analysis-modal__quote">{{ alert().originalComplaint }}</p>
        </section>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cerrar" severity="secondary" [outlined]="true" (onClick)="analysisOpen = false" />
        @if (isOwn() && actionable()) {
          <p-button label="Ir a borradores" icon="pi pi-bolt" (onClick)="focusDraftsFromModal()" />
        }
      </ng-template>
    </p-dialog>
  `,
})
export class AlertCardComponent {
  private readonly config = inject(UserConfigStore);

  readonly alert = input.required<CompetitorAlert>();
  readonly showCapture = input(false);
  readonly showAnalyze = input(false);
  readonly selected = input(false);
  readonly companyName = input('');

  readonly dismiss = output<string>();
  readonly contact = output<string>();
  readonly won = output<string>();
  readonly analyze = output<string>();
  readonly select = output<string>();
  readonly responded = output<string>();

  readonly expanded = signal(false);
  readonly draftOptions = signal<ReplyOption[]>([]);
  readonly selectedDraft = signal<ReplyOption | null>(null);
  readonly pitchOptions = signal<PitchOption[]>([]);
  readonly selectedPitch = signal<PitchOption | null>(null);
  analysisOpen = false;

  private readonly enriched = signal<CompetitorAlert | null>(null);
  private readonly brandName = signal('');

  readonly isOwn = computed(() => {
    const a = this.enriched() || this.alert();
    return a.brandScope === 'own' || this.showAnalyze();
  });

  readonly actionable = computed(() => {
    const a = this.enriched() || this.alert();
    if (a._actionable === false || a._mentionKind === 'media') return false;
    if (a._actionable === true || a._mentionKind === 'comment') return true;
    return this.isOwn();
  });

  readonly platformLabel = computed(() => platformDisplayLabel(this.enriched() || this.alert()));

  readonly snippet = computed(() => {
    const text = String((this.enriched() || this.alert()).originalComplaint || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 110 ? `${text.slice(0, 110)}…` : text;
  });

  readonly analysisText = computed(() => {
    const a = this.enriched() || this.alert();
    const intel = a._intel as {
      analisis_estrategico?: { resumen_insight?: string };
    } | null;
    return (
      String(a._analysisSummary || intel?.analisis_estrategico?.resumen_insight || '').trim() ||
      'Sin análisis disponible para este ítem.'
    );
  });

  readonly analysisPreview = computed(() => {
    const t = this.analysisText();
    return t.length > 150 ? `${t.slice(0, 150)}…` : t;
  });

  readonly intelCategory = computed(() => {
    const intel = (this.enriched() || this.alert())._intel as {
      analisis_estrategico?: { categoria_queja_o_elogio?: string };
    } | null;
    return String(intel?.analisis_estrategico?.categoria_queja_o_elogio || '').trim();
  });

  readonly needsModeration = computed(() => {
    const intel = (this.enriched() || this.alert())._intel as {
      requiere_moderacion_humana?: boolean;
    } | null;
    return Boolean(intel?.requiere_moderacion_humana);
  });

  readonly suggestedReply = computed(() => {
    const intel = (this.enriched() || this.alert())._intel as {
      respuesta_sugerida_publica?: string | null;
    } | null;
    return String(intel?.respuesta_sugerida_publica || '').trim();
  });

  readonly themeLabel = computed(() => {
    const text = (this.enriched() || this.alert()).originalComplaint || '';
    const theme = primaryTheme(text, 'es') as { es?: string; label?: string };
    return theme?.es || theme?.label || '';
  });

  readonly themeLabels = computed(() => {
    const text = (this.enriched() || this.alert()).originalComplaint || '';
    const themes = detectThemes(text, 'es') as Array<{ label?: string; es?: string }>;
    return themes.map((t) => t.es || t.label || '').filter(Boolean).slice(0, 4);
  });

  readonly relativeTime = computed(() =>
    formatRelativeTime((this.enriched() || this.alert()).detectedAt),
  );

  readonly frictionPct = computed(() => {
    const n = (this.enriched() || this.alert()).frustrationScore;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    return Math.round(Math.min(1, Math.max(0, n)) * 100);
  });

  readonly metaLine = computed(() =>
    [
      this.relativeTime(),
      this.engagementLabel(),
      this.themeLabel(),
      this.recommendedActionShort(),
      this.slaLabel(),
    ]
      .filter((x) => Boolean(x))
      .join(' · '),
  );

  readonly scMeta = computed((): SocialCrawlMeta | null => {
    const a = this.enriched() || this.alert();
    return a._scMeta?.provider === 'socialcrawl' ? a._scMeta : null;
  });

  readonly engagementLabel = computed(() => {
    const eng = this.scMeta()?.engagement;
    if (!eng) return '';
    const pts = typeof eng.points === 'number' ? eng.points : null;
    const cmts = typeof eng.numComments === 'number' ? eng.numComments : null;
    if (pts == null && cmts == null) return '';
    if (pts != null && cmts != null) return `${formatCompact(pts)} pts · ${formatCompact(cmts)} cmts`;
    if (pts != null) return `${formatCompact(pts)} pts`;
    return `${formatCompact(cmts!)} cmts`;
  });

  readonly clusterLabel = computed(() => {
    const t = this.scMeta()?.clusterTitle;
    return t ? String(t) : '';
  });

  readonly topComments = computed(() => {
    const list = this.scMeta()?.topComments;
    return Array.isArray(list) ? list.slice(0, 5) : [];
  });

  readonly scRankLabel = computed(() => {
    const sc = this.scMeta();
    if (!sc) return '';
    if (typeof sc.finalScore === 'number') return `SC ${Math.round(sc.finalScore)}`;
    if (typeof sc.rerankScore === 'number') return `Rerank ${Math.round(sc.rerankScore)}`;
    return '';
  });

  readonly sourcesLabel = computed(() => (this.scMeta()?.sources || []).join(', '));

  readonly score = computed(() => {
    const n = (this.enriched() || this.alert())._aiScore;
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  });

  readonly scoreBand = computed(() =>
    String((this.enriched() || this.alert())._aiScoreBand || 'medium').toLowerCase(),
  );

  readonly scoreLabel = computed(() =>
    String(
      (this.enriched() || this.alert())._aiScoreLabel ||
        (this.isOwn() ? 'Riesgo' : 'Oportunidad'),
    ),
  );

  readonly scoreDrivers = computed(() => {
    const a = this.enriched() || this.alert();
    return Array.isArray(a._aiScoreDrivers) ? a._aiScoreDrivers : [];
  });

  readonly playbook = computed((): PlaybookView | null => {
    const a = this.enriched() || this.alert();
    const brand = this.brandName() || this.config.companyName() || a.competitorName;
    const raw = this.isOwn()
      ? buildDefensePlaybook({
          complaint: a.originalComplaint || '',
          companyName: brand,
          lang: 'es',
        })
      : buildCapturePlaybook({
          complaint: a.originalComplaint || '',
          competitorName: a.competitorName,
          companyName: brand,
          whatTheySell: this.config.config()?.company?.whatTheySell,
          lang: 'es',
        });
    if (!raw) return null;
    return {
      oneLiner: String(raw.oneLiner || ''),
      steps: (raw.steps || []) as PlaybookStep[],
      donts: (raw.donts || []) as string[],
    };
  });

  constructor() {
    effect(() => {
      const raw = this.alert();
      const brand =
        this.companyName() ||
        this.config.companyName() ||
        (raw.brandScope === 'own' ? raw.competitorName : this.config.companyName());
      this.brandName.set(brand);

      const target = raw as CompetitorAlert & { _brandScope?: string };
      target._brandScope = raw.brandScope;
      ensureItemIntel(target, { companyName: brand });
      this.enriched.set(target);

      if (raw.brandScope === 'own' || this.showAnalyze()) {
        this.buildDrafts(target, brand);
      } else {
        this.buildPitches(target, brand);
      }
    });
  }

  analysisTitle(): string {
    return this.isOwn() ? 'Análisis de reputación' : 'Análisis de oportunidad';
  }

  scoreKindLabel(): string {
    return this.isOwn() ? 'Score de riesgo' : 'Score de oportunidad';
  }

  scoreKindShort(): string {
    return this.isOwn() ? 'Riesgo' : 'Oportunidad';
  }

  recommendedAction(): string {
    if (this.needsModeration()) {
      return 'Escalar a moderación / legal. No publicar respuesta automática.';
    }
    if (!this.actionable() && this.isOwn()) {
      return 'Monitorear mención en medio. Registrar en informe de reputación.';
    }
    if (this.isOwn()) {
      if (this.score() >= 80) return 'Responder ya en público + pasar detalle a DM.';
      if (this.score() >= 60) return 'Responder en el hilo con tono empático y dueño del fix.';
      return 'Responder o archivar según prioridad del día.';
    }
    if (this.score() >= 80) return 'Priorizar captación: pitch suave + DM en < 2 h.';
    if (this.score() >= 60) return 'Contactar con pitch de valor alineado al dolor.';
    return 'Observar; contactar solo si hay intención de cambio.';
  }

  recommendedActionShort(): string {
    if (this.needsModeration()) return 'Escalar';
    if (!this.actionable() && this.isOwn()) return 'Monitorear';
    if (this.isOwn()) {
      if (this.score() >= 80) return 'Responder ya';
      if (this.score() >= 60) return 'Responder';
      return 'Revisar';
    }
    if (this.score() >= 80) return 'Captar ya';
    if (this.score() >= 60) return 'Contactar';
    return 'Observar';
  }

  slaLabel(): string {
    if (this.needsModeration()) return 'Inmediato';
    if (this.score() >= 80) return '< 2 h';
    if (this.score() >= 60) return '< 8 h';
    if (this.score() >= 35) return '24 h';
    return '48 h';
  }

  severityKey(): string {
    return String((this.enriched() || this.alert()).severity || 'medium').toLowerCase();
  }

  severityShort(): string {
    const s = String((this.enriched() || this.alert()).severity || 'MEDIUM').toUpperCase();
    if (s === 'CRITICAL') return 'CRIT';
    if (s === 'HIGH') return 'ALTA';
    if (s === 'LOW') return 'BAJA';
    return 'MEDIA';
  }

  sentimentLabelEs(): string {
    const s = String(
      (this.enriched() || this.alert())._sentiment ||
        (this.enriched() || this.alert()).sentiment ||
        'NEUTRAL',
    ).toUpperCase();
    if (s === 'POSITIVE') return 'Positivo';
    if (s === 'NEGATIVE') return 'Negativo';
    if (s === 'MIXED') return 'Mixto';
    return 'Neutral';
  }

  sentimentClass(): string {
    const s = String(
      (this.enriched() || this.alert())._sentiment ||
        (this.enriched() || this.alert()).sentiment ||
        'NEUTRAL',
    ).toUpperCase();
    if (s === 'POSITIVE') return 'rl-badge--sent-pos';
    if (s === 'NEGATIVE') return 'rl-badge--sent-neg';
    return 'rl-badge--sent-neu';
  }

  sentimentSeverity(): 'success' | 'danger' | 'warn' | 'info' | 'secondary' | 'contrast' {
    const s = this.sentimentLabelEs();
    if (s === 'Positivo') return 'success';
    if (s === 'Negativo') return 'danger';
    if (s === 'Mixto') return 'warn';
    return 'secondary';
  }

  hasSourceUrl(): boolean {
    const url = String((this.enriched() || this.alert()).sourceUrl || '');
    return Boolean(url) && !url.startsWith('manual://');
  }

  formatScore(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  toggle(): void {
    const next = !this.expanded();
    this.expanded.set(next);
    if (next) this.select.emit(this.alert().alertId);
  }

  openAnalysis(ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.analysisOpen = true;
    this.select.emit(this.alert().alertId);
  }

  focusDraftsFromModal(): void {
    this.analysisOpen = false;
    this.expanded.set(true);
    this.analyze.emit(this.alert().alertId);
  }

  copySuggested(): void {
    void navigator.clipboard?.writeText(this.suggestedReply());
  }

  selectDraft(opt: ReplyOption): void {
    this.selectedDraft.set(opt);
  }

  selectPitch(opt: PitchOption): void {
    this.selectedPitch.set(opt);
  }

  copyDraft(): void {
    void navigator.clipboard?.writeText(this.selectedDraft()?.body || '');
  }

  copyPitch(): void {
    void navigator.clipboard?.writeText(
      this.selectedPitch()?.body || this.alert().salesPitch || '',
    );
  }

  markResponded(): void {
    this.responded.emit(this.alert().alertId);
  }

  private buildDrafts(alert: CompetitorAlert, brand: string): void {
    if (alert._actionable === false || alert._mentionKind === 'media') {
      this.draftOptions.set([]);
      this.selectedDraft.set(null);
      return;
    }

    if (alert.replyOptions?.length) {
      this.draftOptions.set(alert.replyOptions);
      this.selectedDraft.set(alert.replyOptions.find((o) => o.recommended) || alert.replyOptions[0]);
      return;
    }

    const drafts = buildLocalReplyOptions({
      text: alert.originalComplaint || '',
      companyName: brand,
    }) as { options?: ReplyOption[] };

    let options = drafts.options || [];
    const intel = alert._intel as { respuesta_sugerida_publica?: string } | null;
    if (intel?.respuesta_sugerida_publica && options[0]) {
      options = options.map((o, i) =>
        i === 0
          ? {
              ...o,
              body: intel.respuesta_sugerida_publica as string,
              rationale: o.rationale || 'Tono adaptado a la plataforma',
            }
          : o,
      );
    }
    this.draftOptions.set(options);
    this.selectedDraft.set(options.find((o) => o.recommended) || options[0] || null);
  }

  private buildPitches(alert: CompetitorAlert, brand: string): void {
    const variants = craftSalesPitchVariants({
      companyName: brand,
      whatTheySell: this.config.config()?.company?.whatTheySell,
      keyLinks: this.config.config()?.company?.keyLinks,
      competitorName: alert.competitorName,
      complaint: alert.originalComplaint,
    }) as PitchOption[];

    let pitches = variants?.length ? variants : [];
    if (alert.salesPitch && pitches[0]) {
      pitches = pitches.map((p, i) =>
        i === 0 ? { ...p, body: alert.salesPitch, recommended: true } : { ...p, recommended: false },
      );
    }
    if (!pitches.length && alert.salesPitch) {
      pitches = [{ id: 'soft', label: 'Suave', body: alert.salesPitch, recommended: true }];
    }
    this.pitchOptions.set(pitches);
    this.selectedPitch.set(pitches.find((p) => p.recommended) || pitches[0] || null);
  }
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 45) return `hace ${days} d`;
  try {
    return new Date(ts).toLocaleDateString('es');
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}
