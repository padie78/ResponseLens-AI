import { NgClass } from '@angular/common';
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
  platformIconClass,
  resolvePlatformKey,
} from '../../../engine/platforms.js';
import { contentKindLabel as labelForContentKind, isReplyableContent, normalizeContentKind } from '../../../engine/content-kind.js';
import { detectThemes, primaryTheme } from '../../../engine/theme-rules.js';
import type { CompetitorAlert, MockOutboundPost, ReplyOption, SocialCrawlMeta } from '../../../models/alert.model';
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
  imports: [NgClass, DialogModule, ButtonModule, TagModule, PrimeTemplate],
  template: `
    <article
      class="rl-alert rl-alert--accordion"
      [class.is-expanded]="selected()"
      [class.rl-alert--selected]="selected()"
      [class.rl-alert--mention]="!actionable()"
      [class.rl-alert--moderation]="needsModeration()"
      [attr.data-severity]="alert().severity"
      [attr.data-kind]="contentKindKey()"
    >
      <button
        type="button"
        class="rl-alert__summary"
        [attr.aria-expanded]="selected()"
        (click)="toggle()"
      >
        <span class="rl-score-wrap">
          <span
            class="rl-score"
            [attr.data-band]="scoreBand()"
            [style.--rl-score]="score()"
            [attr.title]="scoreKindLabel() + ': ' + score() + '/100'"
          >
            <span class="rl-score__value">
              {{ score() }}<span class="rl-score__max">/100</span>
            </span>
            <span class="rl-score__meter" aria-hidden="true">
              <span class="rl-score__fill"></span>
            </span>
          </span>
          <span class="rl-score-wrap__label">{{ scoreKindShort() }}</span>
        </span>

        <span class="rl-alert__summary-text">
          <span class="rl-alert__main">
            <span class="rl-alert__who-row">
              <span
                class="rl-kind-chip"
                [attr.data-kind]="contentKindKey()"
                [attr.data-reply]="actionable() ? '1' : '0'"
                [attr.title]="actionable() ? 'Se puede responder en el hilo' : 'No hace falta responder: solo seguimiento'"
              >
                <i class="pi {{ contentKindIcon() }}" aria-hidden="true"></i>
                {{ contentKindLabel() }}
                <span class="rl-kind-chip__hint">{{ actionable() ? 'hilo' : 'seguir' }}</span>
              </span>
              <span class="rl-alert__who">{{ pieceTitle() }}</span>
            </span>
            <span class="rl-alert__snippet">{{ snippet() }}</span>
          </span>

          <span class="rl-alert__aside">
            @if (relativeTime()) {
              <span class="rl-alert__when">{{ relativeTime() }}</span>
            }
            @if (platformLabel()) {
              <span
                class="rl-platform-mark"
                [attr.data-platform]="platformKey()"
                [attr.title]="platformLabel()"
                [attr.aria-label]="platformLabel()"
              >
                <i
                  class="rl-platform-icon pi"
                  [ngClass]="platformIcon()"
                  [attr.data-platform]="platformKey()"
                  aria-hidden="true"
                ></i>
              </span>
            }
          </span>
        </span>
      </button>

      <div class="rl-alert__foot" (click)="$event.stopPropagation()">
            <span class="rl-alert__signals-inline">
              @if (isOwn()) {
                <span class="rl-alert__kv rl-alert__kv--sent" [attr.title]="'Sentimiento: ' + sentimentLabelEs()">
                  <span class="rl-alert__kv-k">Tono</span>
                  <span
                    class="rl-sent pi"
                    [class.pi-arrow-up]="sentimentTone() === 'pos'"
                    [class.pi-arrow-down]="sentimentTone() === 'neg'"
                    [class.pi-minus]="sentimentTone() === 'neu' || sentimentTone() === 'mix'"
                    [attr.data-tone]="sentimentTone()"
                    [attr.aria-label]="sentimentLabelEs()"
                  ></span>
                </span>
              } @else {
                <span class="rl-alert__kv" [attr.title]="'Urgencia: ' + severityLabelEs()">
                  <span class="rl-alert__kv-k">Urgencia</span>
                  <span class="rl-alert__kv-v">{{ severityLabelEs() }}</span>
                </span>
                @if (conquestConversion(); as conv) {
                  <span class="rl-alert__kv" title="Probabilidad de captar a este cliente">
                    <span class="rl-alert__kv-k">Captación</span>
                    <span class="rl-alert__kv-v">{{ conv }}</span>
                  </span>
                }
                @if (conquestCritical()) {
                  <span class="rl-alert__kv rl-alert__kv--warn">
                    <span class="rl-alert__kv-k">Alerta</span>
                    <span class="rl-alert__kv-v">Crítica</span>
                  </span>
                }
              }
              @for (fact of footFacts(); track fact.k) {
                <span class="rl-alert__kv" [attr.title]="fact.v">
                  <span class="rl-alert__kv-k">{{ fact.k }}</span>
                  <span class="rl-alert__kv-v">{{ fact.v }}</span>
                </span>
              }
              @if (needsModeration()) {
                <span class="rl-alert__kv rl-alert__kv--warn">
                  <span class="rl-alert__kv-k">Atención</span>
                  <span class="rl-alert__kv-v">Moderar</span>
                </span>
              }
              @if (mockPost(); as post) {
                <span class="rl-alert__kv rl-alert__kv--posted" [attr.title]="'Demo: publicado en ' + post.platformLabel">
                  <span class="rl-alert__kv-k">Demo</span>
                  <span class="rl-alert__kv-v">En {{ post.platformLabel }}</span>
                </span>
              }
              <span class="rl-alert__kv" [attr.title]="recommendedAction()">
                <span class="rl-alert__kv-k">Acción</span>
                <span class="rl-alert__kv-v">{{ recommendedActionShort() }}</span>
              </span>
              <span class="rl-alert__kv" [attr.title]="actionable() ? 'Responder dentro de ' + slaLabel() : 'No hay plazo de hilo'">
                <span class="rl-alert__kv-k">Plazo</span>
                <span class="rl-alert__kv-v">{{ slaLabel() }}</span>
              </span>
            </span>
            <button
              type="button"
              class="rl-alert__quick"
              title="Abrir reporte"
              aria-label="Abrir reporte"
              (click)="openAnalysis($event)"
            >
              <i class="pi pi-file" aria-hidden="true"></i>
            </button>
      </div>

      @if (selected()) {
        <div class="rl-alert__body" (click)="$event.stopPropagation()">
          <section class="rl-alert__section">
            <header class="rl-alert__section-head">
              <h3 class="rl-alert__section-title">{{ pieceSectionTitle() }}</h3>
              <div class="rl-alert__section-meta">
                <span class="rl-alert__kv">
                  <span class="rl-alert__kv-k">Estado</span>
                  <span class="rl-alert__kv-v">{{ statusLabelEs() }}</span>
                </span>
              </div>
            </header>
            @if (pieceTitle(); as title) {
              <h4 class="rl-alert__piece-title">{{ title }}</h4>
            }
            @if (contentKindKey() === 'comment' || contentKindKey() === 'post' || contentKindKey() === 'thread') {
              <blockquote class="rl-alert__complaint rl-alert__complaint--quote">{{ pieceBody() }}</blockquote>
            } @else {
              <p class="rl-alert__complaint">{{ pieceBody() }}</p>
            }
            @if (contentKindKey() === 'video' && scMeta()?.thumbnailUrl; as thumb) {
              <img class="rl-alert__piece-thumb" [src]="thumb" alt="" loading="lazy" />
            }
            @if (contentKindKey() === 'video' && scMeta()?.transcript; as tr) {
              <p class="rl-alert__transcript"><span>Lo que se dice · </span>{{ tr }}</p>
            }
            @if (contentKindKey() === 'pin' && scMeta()?.thumbnailUrl; as thumb) {
              <img class="rl-alert__piece-thumb" [src]="thumb" alt="" loading="lazy" />
            }
            @if (!isOwn() && conquestResumen(); as resumen) {
              <p class="rl-alert__conquest-summary">{{ resumen }}</p>
            }
            <dl class="rl-alert__brief rl-alert__brief--piece">
              @for (row of pieceFacts(); track row.k) {
                <div class="rl-alert__brief-row">
                  <dt>{{ row.k }}</dt>
                  <dd>{{ row.v }}</dd>
                </div>
              }
            </dl>
            @if (highlightComments().length) {
              <ul class="rl-alert__top-comments">
                @for (c of highlightComments(); track c.excerpt) {
                  <li>
                    <span class="rl-alert__top-comments__meta">
                      {{ c.author || 'Anónimo' }}
                      @if (c.score != null) {
                        · {{ c.score }} votos
                      }
                    </span>
                    <p>{{ c.excerpt }}</p>
                  </li>
                }
              </ul>
            }
            @if (hasSourceUrl()) {
              <a class="rl-alert__source-link" [href]="alert().sourceUrl" target="_blank" rel="noopener">
                {{ sourceCta() }} <i class="pi pi-external-link" aria-hidden="true"></i>
              </a>
            }
          </section>

          <section class="rl-alert__section">
            <header class="rl-alert__section-head">
              <h3 class="rl-alert__section-title">
                Señales
                <button
                  type="button"
                  class="rl-help-btn"
                  [class.is-open]="signalsHelpOpen()"
                  [attr.aria-expanded]="signalsHelpOpen()"
                  aria-label="Qué significan estas señales"
                  title="Qué significan estas señales"
                  (click)="toggleSignalsHelp($event)"
                >
                  <i class="pi pi-question-circle" aria-hidden="true"></i>
                </button>
              </h3>
            </header>
            @if (signalsHelpOpen()) {
              <div class="rl-kpi-help" role="region" aria-label="Explicación de señales">
                @for (row of signalsHelpRows(); track row.key) {
                  <div class="rl-kpi-help__row">
                    <div class="rl-kpi-help__head">
                      <strong>{{ row.label }}</strong>
                      <span class="rl-kpi-help__value">{{ row.value }}</span>
                    </div>
                    <p class="rl-kpi-help__meaning">{{ row.meaning }}</p>
                    <p class="rl-kpi-help__read">{{ row.howToRead }}</p>
                  </div>
                }
              </div>
            }
            <ul class="rl-alert__signals">
              <li class="rl-alert__signal" [attr.data-band]="scoreBand()">
                <span class="rl-alert__signal-label">{{ scoreKindShort() }}</span>
                <strong>{{ score() }}<small>/100</small></strong>
                <span class="rl-alert__signal-hint">{{ scoreLabel() }}</span>
              </li>
              @if (frictionPct() != null) {
                <li class="rl-alert__signal">
                  <span class="rl-alert__signal-label">Fricción</span>
                  <strong>{{ frictionPct() }}%</strong>
                  <span class="rl-alert__signal-hint">Tono</span>
                </li>
              }
              <li class="rl-alert__signal">
                <span class="rl-alert__signal-label">Acción</span>
                <strong>{{ recommendedActionShort() }}</strong>
                <span class="rl-alert__signal-hint">Plazo {{ slaLabel() }}</span>
              </li>
              <li class="rl-alert__signal">
                <span class="rl-alert__signal-label">Alcance</span>
                <strong>{{ engagementCompact() || '—' }}</strong>
                <span class="rl-alert__signal-hint">{{ commentsLabel() }}</span>
              </li>
            </ul>
          </section>

          <section class="rl-alert__section">
            <header class="rl-alert__section-head">
              <h3 class="rl-alert__section-title">En pocas palabras</h3>
              <button type="button" class="rl-alert__text-btn" (click)="openAnalysis()">
                Ver reporte <i class="pi pi-arrow-right" aria-hidden="true"></i>
              </button>
            </header>
            <dl class="rl-alert__brief">
              <div class="rl-alert__brief-row">
                <dt>Qué es</dt>
                <dd>{{ insightTipo() || contentKindLabel() }}</dd>
              </div>
              <div class="rl-alert__brief-row">
                <dt>Por qué importa</dt>
                <dd>{{ insightLectura() || analysisPreview() }}</dd>
              </div>
              <div class="rl-alert__brief-row rl-alert__brief-row--action">
                <dt>Qué hacer</dt>
                <dd>{{ insightAccion() || recommendedAction() }}</dd>
              </div>
              @if (insightTip(); as tip) {
                <div class="rl-alert__brief-row">
                  <dt>Ojo</dt>
                  <dd>{{ tip }}</dd>
                </div>
              }
            </dl>
          </section>

          @if (isOwn() && actionable()) {
            <section class="rl-alert__section rl-alert__section--compose">
              <header class="rl-alert__section-head">
                <h3 class="rl-alert__section-title">Cómo responder</h3>
              </header>
              <p class="rl-alert__compose-lead">{{ replyLead() }}</p>

              <div class="rl-reply-step">
                <p class="rl-reply-step__label">1 · Tono</p>
                <div class="rl-pitch-tabs" role="tablist" aria-label="Tono de respuesta">
                  @for (opt of draftOptions(); track opt.tone || opt.label) {
                    <button
                      type="button"
                      class="rl-pitch-tab"
                      [class.is-active]="selectedDraft()?.tone === opt.tone"
                      [class.is-rec]="opt.recommended"
                      (click)="selectDraft(opt)"
                    >
                      {{ opt.label }}
                      @if (opt.recommended) {
                        <span class="rl-pitch-tab__rec">sugerido</span>
                      }
                    </button>
                  }
                </div>
              </div>

              @if (selectedDraft(); as draft) {
                <div class="rl-reply-step">
                  <p class="rl-reply-step__label">
                    2 · Texto para copiar
                    @if (draft.recommended) {
                      <span class="rl-reply-step__hint">· tono sugerido</span>
                    }
                  </p>
                  @if (draft.rationale) {
                    <p class="rl-rationale">{{ draft.rationale }}</p>
                  }
                  <div class="rl-pitch-preview">
                    <p class="rl-pitch-preview__body">{{ draft.body }}</p>
                  </div>
                </div>
              }

              @if (mockPost(); as post) {
                <div class="rl-mock-post" role="status">
                  <p class="rl-mock-post__kicker">Publicado en {{ post.platformLabel }} · demo</p>
                  <p class="rl-mock-post__body">{{ post.body }}</p>
                  <p class="rl-mock-post__meta">
                    Como respuesta oficial de {{ post.author }} en el hilo de origen.
                  </p>
                </div>
              }

              <div class="rl-action-bar">
                <p-button
                  [label]="'Responder en ' + (platformLabel() || 'plataforma')"
                  icon="pi pi-send"
                  size="small"
                  [disabled]="!selectedDraft()?.body"
                  (onClick)="publishOwnReply()"
                />
                <p-button
                  label="Copiar texto"
                  icon="pi pi-copy"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="copyDraft()"
                />
                <p-button
                  label="Posponer"
                  icon="pi pi-clock"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="snoozed.emit(alert().alertId)"
                />
                <p-button
                  label="Marcar resuelta"
                  icon="pi pi-flag"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="won.emit(alert().alertId)"
                />
                <p-button
                  label="Descartar"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="dismiss.emit(alert().alertId)"
                />
              </div>
            </section>
          } @else if (isOwn()) {
            <section class="rl-alert__section rl-alert__section--compose">
              <header class="rl-alert__section-head">
                <h3 class="rl-alert__section-title">Qué hacer</h3>
              </header>
              <p class="rl-hint">{{ monitorLead() }}</p>
              <div class="rl-action-bar">
                <p-button label="Marcar como vista" size="small" (onClick)="markResponded()" />
                <p-button
                  label="Posponer"
                  icon="pi pi-clock"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="snoozed.emit(alert().alertId)"
                />
                <p-button
                  label="Marcar resuelta"
                  icon="pi pi-flag"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="won.emit(alert().alertId)"
                />
                <p-button
                  label="Descartar"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="dismiss.emit(alert().alertId)"
                />
              </div>
            </section>
          } @else {
            <section class="rl-alert__section rl-alert__section--compose">
              <header class="rl-alert__section-head">
                <h3 class="rl-alert__section-title">Cómo contactar</h3>
              </header>
              <p class="rl-alert__compose-lead">
                Elegí un estilo y enviá el mensaje en {{ platformLabel() || 'la plataforma' }} (demo).
              </p>
              @if (conquestTags().length) {
                <p class="rl-alert__conquest-tags">
                  @for (tag of conquestTags(); track tag) {
                    <span>{{ tag }}</span>
                  }
                </p>
              }

              <div class="rl-reply-step">
                <p class="rl-reply-step__label">1 · Estilo</p>
                <div class="rl-pitch-tabs" role="tablist" aria-label="Estilo del mensaje">
                  @for (opt of pitchOptions(); track opt.id || opt.label) {
                    <button
                      type="button"
                      class="rl-pitch-tab"
                      [class.is-active]="selectedPitch()?.id === opt.id"
                      [class.is-rec]="opt.recommended"
                      (click)="selectPitch(opt)"
                    >
                      {{ opt.label }}
                      @if (opt.recommended) {
                        <span class="rl-pitch-tab__rec">sugerido</span>
                      }
                    </button>
                  }
                </div>
              </div>

              @if (selectedPitch(); as pitch) {
                <div class="rl-reply-step">
                  <p class="rl-reply-step__label">2 · Mensaje para copiar</p>
                  @if (pitch.rationale) {
                    <p class="rl-rationale">{{ pitch.rationale }}</p>
                  }
                  <div class="rl-pitch-preview">
                    <p class="rl-pitch-preview__body">{{ pitch.body }}</p>
                  </div>
                </div>
              }

              @if (mockPost(); as post) {
                <div class="rl-mock-post" role="status">
                  <p class="rl-mock-post__kicker">Enviado en {{ post.platformLabel }} · demo</p>
                  <p class="rl-mock-post__body">{{ post.body }}</p>
                </div>
              }

              <div class="rl-action-bar">
                <p-button
                  [label]="'Enviar en ' + (platformLabel() || 'plataforma')"
                  icon="pi pi-send"
                  size="small"
                  [disabled]="!selectedPitch()?.body && !alert().salesPitch"
                  (onClick)="publishRivalPitch()"
                />
                <p-button
                  label="Copiar mensaje"
                  icon="pi pi-copy"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="copyPitch()"
                />
                @if (showCapture()) {
                  <p-button
                    label="Ya contacté"
                    severity="secondary"
                    [outlined]="true"
                    size="small"
                    (onClick)="contact.emit(alert().alertId)"
                  />
                  <p-button
                    label="Ganado"
                    severity="secondary"
                    [outlined]="true"
                    size="small"
                    (onClick)="won.emit(alert().alertId)"
                  />
                }
                <p-button
                  label="Descartar"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  (onClick)="dismiss.emit(alert().alertId)"
                />
              </div>
            </section>
          }
        </div>
      }
    </article>

    <p-dialog
      [(visible)]="analysisOpen"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(720px, 96vw)' }"
      [contentStyle]="{ 'max-height': 'min(78vh, 820px)', overflow: 'auto' }"
      styleClass="rl-analysis-dialog"
      [header]="analysisTitle()"
      (onHide)="analysisOpen = false"
    >
      <div class="rl-analysis-modal">
        <div class="rl-analysis-modal__toolbar">
          <p class="rl-analysis-modal__toolbar-label">Informe</p>
          <div class="rl-analysis-modal__toolbar-actions">
            <button type="button" class="rl-analysis-modal__tool" (click)="copyFullReport()" title="Copiar informe completo">
              <i class="pi pi-copy" aria-hidden="true"></i>
              Copiar
            </button>
            <button type="button" class="rl-analysis-modal__tool" (click)="downloadReportMd()" title="Descargar Markdown">
              <i class="pi pi-file" aria-hidden="true"></i>
              .md
            </button>
            <button type="button" class="rl-analysis-modal__tool rl-analysis-modal__tool--accent" (click)="downloadReportPdf()" title="Abrir diálogo para guardar PDF">
              <i class="pi pi-file-pdf" aria-hidden="true"></i>
              PDF
            </button>
            @if (hasSourceUrl()) {
              <a class="rl-analysis-modal__tool" [href]="alert().sourceUrl" target="_blank" rel="noopener">
                <i class="pi pi-external-link" aria-hidden="true"></i>
                Fuente
              </a>
            }
          </div>
        </div>
        @if (reportFeedback(); as fb) {
          <p class="rl-analysis-modal__feedback" role="status">{{ fb }}</p>
        }

        <header class="rl-analysis-modal__hero">
          <span class="rl-score rl-score--lg" [attr.data-band]="scoreBand()" [style.--rl-score]="score()">
            <span class="rl-score__value">
              {{ score() }}<span class="rl-score__max">/100</span>
            </span>
            <span class="rl-score__meter" aria-hidden="true">
              <span class="rl-score__fill"></span>
            </span>
          </span>
          <div class="rl-analysis-modal__hero-text">
            <p class="rl-analysis-modal__score-label">{{ scoreLabel() || scoreKindLabel() }}</p>
            <p class="rl-analysis-modal__hero-meta">
              {{ scoreKindLabel() }} {{ score() }}/100
              <span aria-hidden="true">·</span>
              {{ recommendedActionShort() }} · {{ slaLabel() }}
              @if (platformLabel()) {
                <span aria-hidden="true">·</span>
                <span
                  class="rl-platform-mark rl-platform-mark--sm"
                  [attr.data-platform]="platformKey()"
                  [attr.title]="platformLabel()"
                  [attr.aria-label]="platformLabel()"
                >
                  <i
                    class="rl-platform-icon pi"
                    [ngClass]="platformIcon()"
                    [attr.data-platform]="platformKey()"
                    aria-hidden="true"
                  ></i>
                </span>
              }
            </p>
            <p class="rl-analysis-modal__action">{{ recommendedAction() }}</p>
          </div>
        </header>

        @if (needsModeration()) {
          <div class="rl-analysis-modal__warn">
            <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
            <div>
              <strong>Moderación humana</strong>
              <p>No publiques una respuesta automática. Escalá antes de actuar en público.</p>
            </div>
          </div>
        }

        <dl class="rl-meta-facts">
          <div class="rl-meta-fact" [attr.data-tone]="sentimentClass()">
            <dt>Sentimiento</dt>
            <dd>
              <span
                class="rl-sent pi"
                [class.pi-arrow-up]="sentimentTone() === 'pos'"
                [class.pi-arrow-down]="sentimentTone() === 'neg'"
                [class.pi-minus]="sentimentTone() === 'neu' || sentimentTone() === 'mix'"
                [attr.data-tone]="sentimentTone()"
                [attr.aria-label]="sentimentLabelEs()"
              ></span>
            </dd>
            <p class="rl-meta-fact__hint">Tono emocional del mensaje</p>
          </div>
          <div class="rl-meta-fact">
            <dt>Severidad</dt>
            <dd>{{ severityLabelEs() }}</dd>
            <p class="rl-meta-fact__hint">Nivel operativo asignado al caso</p>
          </div>
          @if (intelCategory()) {
            <div class="rl-meta-fact">
              <dt>Categoría</dt>
              <dd>{{ intelCategory() }}</dd>
              <p class="rl-meta-fact__hint">Tipo de queja / elogio detectado</p>
            </div>
          }
          @if (!isOwn() && conquestConversion(); as conv) {
            <div class="rl-meta-fact">
              <dt>Captación</dt>
              <dd>{{ conv }}</dd>
              <p class="rl-meta-fact__hint">Probabilidad de ganar este cliente</p>
            </div>
          }
          @if (frictionPct() != null) {
            <div class="rl-meta-fact">
              <dt>Fricción</dt>
              <dd>{{ frictionPct() }}%</dd>
              <p class="rl-meta-fact__hint">
                @if (frictionPct()! >= 70) {
                  Alta intensidad de enojo o urgencia
                } @else if (frictionPct()! >= 40) {
                  Molestia media en el tono
                } @else {
                  Tono relativamente suave
                }
              </p>
            </div>
          }
          @if (engagementPlain(); as eng) {
            <div class="rl-meta-fact">
              <dt>Alcance</dt>
              <dd>{{ eng }}</dd>
              <p class="rl-meta-fact__hint">Visibilidad estimada en la publicación</p>
            </div>
          }
          @if (scScorePlain(); as scScore) {
            <div class="rl-meta-fact">
              <dt>Relevancia</dt>
              <dd>{{ scScore }}</dd>
              <p class="rl-meta-fact__hint">Qué tan relevante es esta pieza en el listening (0–100)</p>
            </div>
          }
        </dl>

        @if (themeLabels().length) {
          <div class="rl-meta-themes">
            <p class="rl-meta-themes__label">Temas en el texto</p>
            <ul class="rl-meta-themes__list">
              @for (t of themeLabels(); track t) {
                <li>{{ t }}</li>
              }
            </ul>
            <p class="rl-meta-themes__hint">Palabras clave / ejes detectados en el comentario</p>
          </div>
        }

        <section class="rl-analysis-modal__block">
          <h3 class="rl-analysis-modal__h">Qué se dijo</h3>
          <p class="rl-analysis-modal__quote">{{ alert().originalComplaint }}</p>
          <p class="rl-analysis-modal__meta-line">
            {{ headline() }}
            @if (relativeTime()) {
              <span>· {{ relativeTime() }}</span>
            }
            @if (statusLabelEs()) {
              <span>· {{ statusLabelEs() }}</span>
            }
          </p>
        </section>

        <section class="rl-analysis-modal__block">
          <h3 class="rl-alert__section-title">En pocas palabras</h3>
          <dl class="rl-alert__brief rl-alert__brief--modal">
            @if (insightTipo(); as tipo) {
              <div class="rl-alert__brief-row">
                <dt>Qué es</dt>
                <dd>{{ tipo }}</dd>
              </div>
            }
            @if (insightLectura(); as lec) {
              <div class="rl-alert__brief-row">
                <dt>Por qué importa</dt>
                <dd>{{ lec }}</dd>
              </div>
            } @else {
              <div class="rl-alert__brief-row">
                <dt>Por qué importa</dt>
                <dd>{{ analysisText() }}</dd>
              </div>
            }
            <div class="rl-alert__brief-row rl-alert__brief-row--action">
              <dt>Qué hacer</dt>
              <dd>{{ insightAccion() || recommendedAction() }}</dd>
            </div>
            @if (insightTip(); as tip) {
              <div class="rl-alert__brief-row">
                <dt>Ojo</dt>
                <dd>{{ tip }}</dd>
              </div>
            }
          </dl>
        </section>

        @if (!isOwn() && (conquestResumen() || conquestTags().length || conquestCritical())) {
          <section class="rl-analysis-modal__block">
            <h3 class="rl-analysis-modal__h">Inteligencia de captación</h3>
            @if (conquestTags().length) {
              <p class="rl-alert__conquest-tags">
                @for (tag of conquestTags(); track tag) {
                  <span>{{ tag }}</span>
                }
              </p>
            }
            @if (conquestResumen(); as resumen) {
              <p>{{ resumen }}</p>
            }
            @if (conquestCritical()) {
              <p class="rl-analysis-modal__warn-inline">Alerta reputacional crítica en el rival.</p>
            }
          </section>
        }

        @if (suggestedReply()) {
          <section class="rl-analysis-modal__block">
            <div class="rl-analysis-modal__block-head">
              <h3 class="rl-analysis-modal__h">{{ isOwn() ? 'Texto listo para responder' : 'Gancho comercial' }}</h3>
              <button type="button" class="rl-analysis-modal__tool" (click)="copySuggested()">
                <i class="pi pi-copy" aria-hidden="true"></i>
                Copiar
              </button>
            </div>
            <p class="rl-analysis-modal__quote rl-analysis-modal__quote--reply">{{ suggestedReply() }}</p>
          </section>
        }

        @if (scoreDrivers().length) {
          <section class="rl-analysis-modal__block">
            <h3 class="rl-analysis-modal__h">Por qué este score</h3>
            <ul class="rl-analysis-modal__drivers">
              @for (d of scoreDrivers(); track d) {
                <li>{{ d }}</li>
              }
            </ul>
          </section>
        }

        @if (playbook(); as pb) {
          <section class="rl-analysis-modal__block">
            <h3 class="rl-analysis-modal__h">Playbook</h3>
            <p class="rl-playbook__line">{{ pb.oneLiner }}</p>
            <ol class="rl-playbook__steps">
              @for (s of pb.steps; track s.id; let i = $index) {
                <li>
                  <strong>{{ i + 1 }}. {{ s.title }}</strong>
                  <span>{{ s.body }}</span>
                </li>
              }
            </ol>
            @if (pb.donts.length) {
              <p class="rl-analysis-modal__subh">No hacer</p>
              <ul class="rl-playbook__donts">
                @for (d of pb.donts; track d) {
                  <li>{{ d }}</li>
                }
              </ul>
            }
          </section>
        }

        @if (hasReachContext()) {
          <section class="rl-analysis-modal__block">
            <h3 class="rl-analysis-modal__h">Publicación</h3>
            <dl class="rl-alert__brief rl-alert__brief--modal">
              @if (sourceTitle(); as title) {
                <div class="rl-alert__brief-row">
                  <dt>Título</dt>
                  <dd>{{ title }}</dd>
                </div>
              }
              @if (engagementPlain(); as eng) {
                <div class="rl-alert__brief-row">
                  <dt>Visibilidad</dt>
                  <dd>{{ eng }}</dd>
                </div>
              }
              @if (conversationLabel(); as conv) {
                <div class="rl-alert__brief-row">
                  <dt>Conversación</dt>
                  <dd>{{ conv }}</dd>
                </div>
              }
              @if (matchStrengthLabel(); as match) {
                <div class="rl-alert__brief-row">
                  <dt>Encaje</dt>
                  <dd>{{ match }}</dd>
                </div>
              }
              @if (sourcesLabel()) {
                <div class="rl-alert__brief-row">
                  <dt>Fuentes</dt>
                  <dd>{{ sourcesLabel() }}</dd>
                </div>
              }
            </dl>
            @if (scMeta(); as sc) {
              @if (sc.thumbnailUrl) {
                <img class="rl-sc-signal__thumb" [src]="sc.thumbnailUrl" alt="" loading="lazy" />
              }
              @if (sc.transcript) {
                <p class="rl-alert__transcript">{{ sc.transcript }}</p>
              }
            }
          </section>
        }

        @if (topComments().length) {
          <section class="rl-analysis-modal__block">
            <h3 class="rl-analysis-modal__h">Comentarios destacados</h3>
            <ul class="rl-sc-comments">
              @for (c of topComments(); track c.excerpt) {
                <li [class.rl-sc-comments__brand]="c.kind === 'brand_mock'">
                  <div class="rl-sc-comments__head">
                    <strong>{{ c.author || 'Anónimo' }}</strong>
                    @if (c.kind === 'brand_mock') {
                      <span class="rl-muted">respuesta demo</span>
                    }
                    @if (c.score != null) {
                      <span class="rl-muted">{{ c.score }} votos</span>
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
      </div>

      <ng-template pTemplate="footer">
        <div class="rl-analysis-modal__footer">
          <div class="rl-analysis-modal__footer-secondary">
            <p-button label="Cerrar" severity="secondary" [outlined]="true" size="small" (onClick)="analysisOpen = false" />
            <p-button label="Copiar informe" icon="pi pi-copy" severity="secondary" [outlined]="true" size="small" (onClick)="copyFullReport()" />
          </div>
          <div class="rl-analysis-modal__footer-primary">
            <p-button label="PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true" size="small" (onClick)="downloadReportPdf()" />
            @if (isOwn() && actionable()) {
              <p-button label="Ir a borradores" icon="pi pi-bolt" size="small" (onClick)="focusDraftsFromModal()" />
            }
            @if (isOwn() && actionable()) {
              <p-button label="Responder (demo)" icon="pi pi-send" size="small" (onClick)="markRespondedFromModal()" />
            } @else if (isOwn()) {
              <p-button label="Respondido" icon="pi pi-check" size="small" (onClick)="markRespondedFromModal()" />
            }
          </div>
        </div>
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
  /** Emit alertId to open; emit again while selected → parent closes (acordeón 1 abierto). */
  readonly select = output<string>();
  readonly responded = output<string>();
  readonly snoozed = output<string>();
  readonly publishReply = output<{ alertId: string; body: string }>();

  readonly draftOptions = signal<ReplyOption[]>([]);
  readonly selectedDraft = signal<ReplyOption | null>(null);
  readonly pitchOptions = signal<PitchOption[]>([]);
  readonly selectedPitch = signal<PitchOption | null>(null);
  analysisOpen = false;
  readonly signalsHelpOpen = signal(false);
  readonly reportFeedback = signal('');
  private reportFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly enriched = signal<CompetitorAlert | null>(null);
  private readonly brandName = signal('');

  readonly isOwn = computed(() => {
    const a = this.enriched() || this.alert();
    return a.brandScope === 'own' || this.showAnalyze();
  });

  readonly actionable = computed(() => {
    const a = this.enriched() || this.alert();
    const kind = normalizeContentKind(a._mentionKind, a.channel);
    return isReplyableContent(kind, a._scMeta);
  });

  contentKindKey(): string {
    const a = this.enriched() || this.alert();
    return normalizeContentKind(a._mentionKind, a.channel);
  }

  contentKindLabel(): string {
    return labelForContentKind(this.contentKindKey());
  }

  contentKindIcon(): string {
    const k = this.contentKindKey();
    if (k === 'video') return 'pi-video';
    if (k === 'news') return 'pi-book';
    if (k === 'issue') return 'pi-github';
    if (k === 'comment') return 'pi-comment';
    if (k === 'market') return 'pi-chart-line';
    if (k === 'pin') return 'pi-bookmark';
    if (k === 'professional') return 'pi-briefcase';
    if (k === 'thread') return 'pi-comments';
    if (k === 'web') return 'pi-globe';
    return 'pi-align-left';
  }

  pieceSectionTitle(): string {
    const k = this.contentKindKey();
    if (k === 'video') return 'El video';
    if (k === 'news') return 'La noticia';
    if (k === 'issue') return 'El issue';
    if (k === 'comment') return 'El comentario';
    if (k === 'market') return 'El mercado';
    if (k === 'pin') return 'El pin';
    if (k === 'professional') return 'La publicación';
    if (k === 'thread') return 'El thread';
    return 'La pieza';
  }

  pieceTitle(): string {
    const title = String(this.scMeta()?.title || '').trim();
    if (title) return title.length > 90 ? `${title.slice(0, 90)}…` : title;
    const line = String((this.enriched() || this.alert()).originalComplaint || '')
      .split('\n')[0]
      .trim();
    if (line) return line.length > 90 ? `${line.slice(0, 90)}…` : line;
    return this.headline();
  }

  pieceBody(): string {
    const raw = String((this.enriched() || this.alert()).originalComplaint || '').trim();
    const title = String(this.scMeta()?.title || '').trim();
    if (title && raw.toLowerCase().startsWith(title.toLowerCase())) {
      const rest = raw.slice(title.length).replace(/^[\s\-–—:]+/, '').trim();
      return rest || raw;
    }
    return raw;
  }

  commentsLabel(): string {
    const n = this.scMeta()?.engagement?.numComments;
    const tops = this.topComments().length;
    if (typeof n === 'number') {
      return n === 0 ? 'Sin comentarios' : `${n} comentarios`;
    }
    if (tops) return `${tops} comentarios destacados`;
    if (this.actionable()) return 'Hilo respondible';
    return 'Sin hilo de comentarios';
  }

  themeDisplay(): string {
    return this.themePill() || this.themeShort() || '—';
  }

  private engPoints(): number | null {
    const n = this.scMeta()?.engagement?.points;
    return typeof n === 'number' ? n : null;
  }

  private engComments(): number | null {
    const n = this.scMeta()?.engagement?.numComments;
    return typeof n === 'number' ? n : null;
  }

  private pieceAuthor(): string {
    return String(this.scMeta()?.author || this.topComments()[0]?.author || '').trim();
  }

  encajeValue(): string {
    const sc = this.scMeta();
    const n =
      typeof sc?.finalScore === 'number'
        ? sc.finalScore
        : typeof sc?.rerankScore === 'number'
          ? sc.rerankScore
          : null;
    if (n == null || !Number.isFinite(n)) return '';
    return String(Math.round(n));
  }

  highlightComments() {
    return this.topComments().filter((c) => c.kind !== 'brand_mock').slice(0, 2);
  }

  private repoFromUrl(): string {
    const m = String((this.enriched() || this.alert()).sourceUrl || '').match(
      /github\.com\/([^/]+\/[^/]+)/i,
    );
    return m ? m[1] : '';
  }

  footFacts(): { k: string; v: string }[] {
    const k = this.contentKindKey();
    const pts = this.engPoints();
    const cmts = this.engComments();
    const theme = this.themeDisplay();
    const encaje = this.encajeValue();
    const extra: { k: string; v: string }[] = encaje ? [{ k: 'Encaje', v: encaje }] : [];
    if (k === 'video') {
      return [
        ...extra,
        { k: 'Vistas', v: pts != null ? formatCompact(pts) : 'Sin dato' },
        { k: 'Coments.', v: cmts != null ? formatCompact(cmts) : '—' },
      ].slice(0, 3);
    }
    if (k === 'news') {
      return [
        ...extra,
        { k: 'Medio', v: this.scMeta()?.domain || this.platformLabel() || 'Web' },
        { k: 'Tema', v: this.conversationLabel() || theme },
      ].slice(0, 3);
    }
    if (k === 'issue') {
      return [
        ...extra,
        { k: 'Repo', v: this.repoFromUrl() || 'GitHub' },
        { k: 'Respuestas', v: cmts != null ? String(cmts) : this.topComments().length ? String(this.topComments().length) : '—' },
      ].slice(0, 3);
    }
    if (k === 'market') {
      return [...extra, { k: 'Volumen', v: pts != null ? formatCompact(pts) : 'Sin dato' }].slice(0, 3);
    }
    if (k === 'pin') {
      return [...extra, { k: 'Guardados', v: pts != null ? formatCompact(pts) : 'Sin dato' }].slice(0, 3);
    }
    if (k === 'professional') {
      return [...extra, { k: 'Reacciones', v: pts != null ? formatCompact(pts) : 'Sin dato' }].slice(0, 3);
    }
    const author = this.pieceAuthor();
    const rows: { k: string; v: string }[] = extra.slice();
    if (author) rows.push({ k: 'Autor', v: author });
    rows.push({ k: 'Tema', v: theme });
    if (cmts != null) rows.push({ k: 'Hilo', v: `${formatCompact(cmts)}` });
    return rows.slice(0, 3);
  }

  private withListenFacts(rows: { k: string; v: string }[]): { k: string; v: string }[] {
    const sc = this.scMeta();
    const out = [...rows];
    const encaje = this.encajeValue();
    if (encaje && !out.some((r) => r.k === 'Encaje')) {
      out.splice(1, 0, { k: 'Encaje', v: `${encaje} · ${this.matchStrengthLabel() || 'ranking SocialCrawl'}` });
    }
    const author = this.pieceAuthor();
    if (author && !out.some((r) => r.k === 'Quién' || r.k === 'Autor')) {
      out.push({ k: 'Quién', v: author });
    }
    if (sc?.domain && !out.some((r) => r.k === 'Medio' || r.k === 'Sitio')) {
      out.push({ k: 'Sitio', v: sc.domain });
    }
    const sources = (sc?.sources || []).map((s) => String(s).replace(/-ai-search$/, '')).filter(Boolean);
    if (sources.length > 1) {
      out.push({ k: 'Fuentes', v: sources.join(', ') });
    }
    if (this.conversationLabel() && !out.some((r) => r.k === 'Cluster')) {
      const score =
        typeof sc?.clusterScore === 'number' ? ` (${Math.round(sc.clusterScore * 100)}%)` : '';
      out.push({ k: 'Cluster', v: `${this.conversationLabel()}${score}` });
    }
    if (sc?.planIntent) {
      out.push({ k: 'Intención', v: String(sc.planIntent) });
    }
    const published = sc?.publishedAt || (this.enriched() || this.alert()).detectedAt;
    if (published) {
      const t = Date.parse(published);
      if (Number.isFinite(t)) {
        out.push({
          k: 'Publicado',
          v: new Date(t).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }),
        });
      }
    }
    return out;
  }

  pieceFacts(): { k: string; v: string }[] {
    const k = this.contentKindKey();
    const pts = this.engPoints();
    const author = this.pieceAuthor();
    const where = this.platformLabel() || '—';
    const rows: { k: string; v: string }[] = [{ k: 'Dónde', v: `${where}` }];
    if (k === 'video') {
      rows.push({ k: 'Vistas', v: pts != null ? `~${formatCompact(pts)}` : 'Sin métrica' });
      rows.push({ k: 'Comentarios', v: this.commentsLabel() });
      if (this.scMeta()?.transcript) rows.push({ k: 'Audio', v: 'Hay transcripción' });
      return this.withListenFacts(rows);
    }
    if (k === 'news') {
      if (this.scMeta()?.domain) rows.push({ k: 'Medio', v: this.scMeta()!.domain as string });
      rows.push({ k: 'Tipo', v: 'Cobertura / artículo' });
      rows.push({ k: 'Hilo', v: 'No se responde en comentarios de la nota' });
      return this.withListenFacts(rows);
    }
    if (k === 'issue') {
      if (this.repoFromUrl()) rows.push({ k: 'Repositorio', v: this.repoFromUrl() });
      rows.push({ k: 'Respuestas', v: this.commentsLabel() });
      return this.withListenFacts(rows);
    }
    if (k === 'market') {
      rows.push({ k: 'Volumen', v: pts != null ? formatCompact(pts) : 'Sin dato' });
      rows.push({ k: 'Qué hacer', v: 'Solo lectura: no hay cliente en un hilo' });
      return this.withListenFacts(rows);
    }
    if (k === 'pin') {
      rows.push({ k: 'Guardados', v: pts != null ? formatCompact(pts) : 'Sin dato' });
      rows.push({ k: 'Hilo', v: this.commentsLabel() });
      return this.withListenFacts(rows);
    }
    if (k === 'professional') {
      rows.push({ k: 'Reacciones', v: pts != null ? formatCompact(pts) : 'Sin dato' });
      rows.push({ k: 'Hilo', v: 'LinkedIn no trae comentarios en esta escucha' });
      return this.withListenFacts(rows);
    }
    if (author) rows.push({ k: 'Quién', v: author });
    rows.push({ k: 'Hilo', v: this.commentsLabel() });
    if (pts != null) rows.push({ k: 'Visibilidad', v: `~${formatCompact(pts)}` });
    return this.withListenFacts(rows);
  }

  sourceCta(): string {
    const k = this.contentKindKey();
    const p = this.platformLabel() || 'origen';
    if (k === 'video') return `Ver video en ${p}`;
    if (k === 'news') return 'Leer la noticia';
    if (k === 'issue') return 'Abrir el issue';
    if (k === 'market') return 'Ver el mercado';
    if (k === 'pin') return 'Ver el pin';
    if (k === 'professional') return 'Abrir en LinkedIn';
    if (k === 'comment' || k === 'post' || k === 'thread') return `Abrir el hilo en ${p}`;
    return `Abrir en ${p}`;
  }

  replyLead(): string {
    const p = this.platformLabel() || 'la plataforma';
    const k = this.contentKindKey();
    if (k === 'video') {
      return `Borrador para el hilo del video en ${p} (demo). No se publica en el video en sí.`;
    }
    if (k === 'issue') {
      return `Borrador técnico para el issue (demo). Pegalo en GitHub.`;
    }
    return `Elegí un tono y publicá en ${p} (demo). No sale a la red real.`;
  }

  monitorLead(): string {
    const k = this.contentKindKey();
    if (k === 'news') {
      return 'Es una noticia: no hay comentario para responder. Seguí la narrativa y actuá solo si escala.';
    }
    if (k === 'video') {
      return 'Este video no trae comentarios accionables. Seguí alcance; no hace falta un texto en el hilo.';
    }
    if (k === 'market') {
      return 'Es una señal de mercado, no un cliente. No hay respuesta pública que enviar.';
    }
    if (k === 'pin') {
      return 'Es un pin. La escucha no trae un hilo para contestar.';
    }
    if (k === 'professional') {
      return 'Publicación de LinkedIn: seguimiento de reputación, sin respuesta en hilo desde acá.';
    }
    return 'Seguí la pieza. No hay hilo de cliente para responder.';
  }

  readonly platformLabel = computed(() => platformDisplayLabel(this.enriched() || this.alert()));

  readonly platformKey = computed(() => resolvePlatformKey(this.enriched() || this.alert()));

  readonly platformIcon = computed(() => platformIconClass(this.enriched() || this.alert()));

  readonly mockPost = computed((): MockOutboundPost | null => {
    return (this.enriched() || this.alert())._mockPost ?? null;
  });

  readonly snippet = computed(() => {
    const k = this.contentKindKey();
    const text = this.pieceBody().replace(/\s+/g, ' ').trim();
    const cut = (s: string) => (s.length > 110 ? `${s.slice(0, 110)}…` : s);
    if (k === 'video') {
      const n = this.scMeta()?.engagement?.numComments;
      const prefix = typeof n === 'number' ? `${n} comentarios · ` : '';
      return cut(prefix + text);
    }
    if (k === 'news') return cut(text);
    if (k === 'issue') return cut(text);
    if (k === 'market') return cut(text);
    return cut(text);
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

  readonly insightParts = computed(() => {
    const a = this.enriched() || this.alert();
    const fromAlert = a._insight;
    const fromIntel = (
      a._intel as {
        analisis_estrategico?: {
          tipo?: string;
          lectura?: string;
          accion?: string;
          tip?: string;
        };
      } | null
    )?.analisis_estrategico;
    return {
      tipo: String(fromAlert?.tipo || fromIntel?.tipo || '').trim(),
      lectura: String(fromAlert?.lectura || fromIntel?.lectura || '').trim(),
      accion: String(fromAlert?.accion || fromIntel?.accion || '').trim(),
      tip: String(fromAlert?.tip || fromIntel?.tip || '').trim(),
    };
  });

  insightTipo(): string {
    // Quitar “en {plataforma}”: la plataforma ya se ve arriba.
    return this.insightParts()
      .tipo.replace(/\s+en\s+\S+$/i, '')
      .trim();
  }

  insightLectura(): string {
    return String(this.insightParts().lectura || '')
      .replace(/^Tema:\s*[^.]+\.\s*/i, '')
      .trim();
  }

  insightAccion(): string {
    return this.insightParts().accion;
  }

  insightTip(): string {
    return this.insightParts().tip;
  }

  readonly intelCategory = computed(() => {
    const a = this.enriched() || this.alert();
    const tags = a._conquest?.analisis_metrico?.etiquetas;
    if (!this.isOwn() && Array.isArray(tags) && tags[1]) return String(tags[1]);
    const intel = a._intel as {
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
    const a = this.enriched() || this.alert();
    const gancho = a._conquest?.sales_intelligence?.gancho_comercial_ia;
    if (!this.isOwn() && gancho) return String(gancho).trim();
    const intel = a._intel as { respuesta_sugerida_publica?: string | null } | null;
    return String(intel?.respuesta_sugerida_publica || a.salesPitch || '').trim();
  });

  readonly themeLabel = computed(() => {
    const text = (this.enriched() || this.alert()).originalComplaint || '';
    const theme = primaryTheme(text, 'es') as { id?: string; es?: string; label?: string };
    if (!theme || theme.id === 'general') return '';
    const label = theme.es || theme.label || '';
    // Fallback genérico: no aporta en la card.
    if (/^sin tema/i.test(label) || /insatisfacci[oó]n general/i.test(label) || /^general$/i.test(label)) {
      return '';
    }
    return label;
  });

  readonly themeLabels = computed(() => {
    const text = (this.enriched() || this.alert()).originalComplaint || '';
    const themes = detectThemes(text, 'es') as Array<{ id?: string; label?: string; es?: string }>;
    return themes
      .filter((t) => t.id && t.id !== 'general')
      .map((t) => t.es || t.label || '')
      .filter(Boolean)
      .slice(0, 4);
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

  /** Título de la publicación fuente (si existe). */
  readonly sourceTitle = computed(() => {
    const t = String(this.scMeta()?.title || '').trim();
    return t;
  });

  /** Cluster solo si aporta y no duplica el título. */
  readonly conversationLabel = computed(() => {
    const cluster = String(this.scMeta()?.clusterTitle || '').trim();
    if (!cluster) return '';
    if (/insatisfacci|sin tema|general dissatisfaction|no clear theme/i.test(cluster)) return '';
    const title = this.sourceTitle();
    if (title && cluster.toLowerCase() === title.toLowerCase()) return '';
    return cluster;
  });

  /** Encaje del hallazgo en lenguaje humano (sin “relevancia 0–100”). */
  readonly matchStrengthLabel = computed(() => {
    const sc = this.scMeta();
    if (!sc) return '';
    const n =
      typeof sc.finalScore === 'number'
        ? sc.finalScore
        : typeof sc.rerankScore === 'number'
          ? sc.rerankScore
          : null;
    if (n == null || !Number.isFinite(n)) return '';
    if (n >= 70) return 'Alto — encaja bien con lo que buscás';
    if (n >= 40) return 'Medio — relacionado, pero no perfecto';
    return 'Bajo — mención lateral';
  });

  readonly hasReachContext = computed(
    () =>
      Boolean(
        this.sourceTitle() ||
          this.engagementPlain() ||
          this.conversationLabel() ||
          this.matchStrengthLabel(),
      ),
  );

  readonly engagementLabel = computed(() => this.engagementPlain());

  /** Texto legible de alcance (sin abreviaturas opacas). */
  readonly engagementPlain = computed(() => {
    const eng = this.scMeta()?.engagement;
    if (!eng) return '';
    const pts = typeof eng.points === 'number' ? eng.points : null;
    const cmts = typeof eng.numComments === 'number' ? eng.numComments : null;
    if (pts == null && cmts == null) return '';
    const ptsPart = pts != null ? `visibilidad ~${formatCompact(pts)}` : '';
    const cmtPart = cmts != null ? `${formatCompact(cmts)} comentarios` : '';
    if (ptsPart && cmtPart) return `${ptsPart} · ${cmtPart}`;
    return ptsPart || cmtPart;
  });

  /** Alcance corto para el card cerrado (sin “pts”). */
  readonly engagementCompact = computed(() => {
    const eng = this.scMeta()?.engagement;
    if (!eng) return '';
    const pts = typeof eng.points === 'number' ? eng.points : null;
    const cmts = typeof eng.numComments === 'number' ? eng.numComments : null;
    if (pts == null && cmts == null) return '';
    if (pts != null && cmts != null) {
      return `${formatCompact(pts)} · ${formatCompact(cmts)} comentarios`;
    }
    if (pts != null) return formatCompact(pts);
    return `${formatCompact(cmts!)} comentarios`;
  });

  /** En propios no repetir el nombre de la empresa en cada card. */
  headline(): string {
    if (!this.isOwn()) {
      return this.alert().competitorName || 'Rival';
    }
    const theme = this.themeShort();
    if (theme) return theme;
    const title = String(this.scMeta()?.title || '').trim();
    if (title) return title.length > 42 ? `${title.slice(0, 42)}…` : title;
    const author = this.topComments()[0]?.author;
    if (author) return String(author);
    return 'Mención';
  }

  /** Tema corto unificado (solo si aporta: no “general”). */
  themeShort(): string {
    const specific = this.themeLabel();
    if (specific) {
      return specific.length > 32 ? `${specific.slice(0, 32)}…` : specific;
    }
    // Cluster del scan solo si parece un título útil (no genérico).
    const cluster = this.conversationLabel();
    if (!cluster) return '';
    return cluster.length > 36 ? `${cluster.slice(0, 36)}…` : cluster;
  }

  themePill(): string {
    if (!this.isOwn()) {
      const cat = this.conquestTags()[1];
      if (cat) return cat;
    }
    return this.themeShort();
  }

  private conquest() {
    return (this.enriched() || this.alert())._conquest ?? null;
  }

  readonly conquestTags = computed(() => {
    const tags = this.conquest()?.analisis_metrico?.etiquetas;
    return Array.isArray(tags) ? tags.slice(0, 2) : [];
  });

  readonly conquestResumen = computed(
    () => this.conquest()?.sales_intelligence?.resumen_incidente || '',
  );

  readonly conquestCritical = computed(
    () => Boolean(this.conquest()?.analisis_metrico?.alerta_reputacional_critica),
  );

  conquestConversion(): string {
    const raw = this.conquest()?.sales_intelligence?.score_conversion_estimado;
    if (raw === 'alto') return 'Alta';
    if (raw === 'medio') return 'Media';
    if (raw === 'bajo') return 'Baja';
    return '';
  }

  readonly clusterLabel = computed(() => {
    const t = this.scMeta()?.clusterTitle;
    return t ? String(t) : '';
  });

  readonly topComments = computed(() => {
    const list = this.scMeta()?.topComments;
    return Array.isArray(list) ? list.slice(0, 5) : [];
  });

  readonly scRankLabel = computed(() => {
    const plain = this.scScorePlain();
    return plain ? `Relevancia ${plain}` : '';
  });

  readonly scScorePlain = computed(() => {
    const sc = this.scMeta();
    if (!sc) return '';
    if (typeof sc.finalScore === 'number') return String(Math.round(sc.finalScore));
    if (typeof sc.rerankScore === 'number') return String(Math.round(sc.rerankScore));
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

  toggleSignalsHelp(ev?: Event): void {
    ev?.stopPropagation();
    this.signalsHelpOpen.update((v) => !v);
  }

  readonly signalsHelpRows = computed(() => {
    const own = this.isOwn();
    const score = this.score();
    const band = this.scoreBand();
    const label = this.scoreLabel();
    const friction = this.frictionPct();
    const sla = this.slaLabel();
    const action = this.recommendedActionShort();
    const eng = this.engagementLabel();

    const scoreHow =
      score >= 80
        ? own
          ? 'Valor alto: riesgo urgente. Respondé ya o escalá.'
          : 'Valor alto: buena oportunidad de captación. Priorizá contacto.'
        : score >= 60
          ? own
            ? 'Valor medio-alto: conviene responder en el hilo hoy.'
            : 'Valor medio-alto: vale la pena contactar con un pitch.'
          : own
            ? 'Valor bajo/medio: revisá según capacidad del día.'
            : 'Valor bajo/medio: observá; contactá solo si hay intención clara.';

    const rows: Array<{ key: string; label: string; value: string; meaning: string; howToRead: string }> = [
      {
        key: 'score',
        label: own ? 'Riesgo' : 'Oportunidad',
        value: `${score}/100 · ${label || band}`,
        meaning: own
          ? 'Score 0–100 de riesgo reputacional. Combina tono, fricción, tipo de mención y alcance en redes.'
          : 'Score 0–100 de oportunidad de captación. Sube cuando el rival tiene fricción y hay espacio para tu propuesta.',
        howToRead: scoreHow,
      },
    ];

    if (friction != null) {
      rows.push({
        key: 'friction',
        label: 'Fricción',
        value: `${friction}%`,
        meaning:
          'Intensidad emocional del tono (enojo, urgencia, frustración). Se deriva del texto del comentario.',
        howToRead:
          friction >= 70
            ? 'Alta: el usuario está muy cargado; priorizá empatía y canal privado.'
            : friction >= 40
              ? 'Media: hay molestia; respondé con calma y solución concreta.'
              : 'Baja: el tono es más suave; una respuesta breve suele bastar.',
      });
    }

    rows.push({
      key: 'sla',
      label: 'Acción y plazo',
      value: `${action} · ${sla}`,
      meaning:
        'Qué hacer con esta mención y en cuánto tiempo conviene actuar, según el score. Es una guía operativa, no un deadline legal.',
      howToRead: `Sugerencia: ${this.recommendedAction()}`,
    });

    if (eng) {
      rows.push({
        key: 'reach',
        label: 'Alcance',
        value: eng,
        meaning:
          'Visibilidad estimada de la mención (alcance y comentarios). Más alto = más gente puede verlo.',
        howToRead:
          'Más alcance = más ojos sobre el hilo. Si el riesgo/oportunidad también es alto, subí la prioridad.',
      });
    }

    return rows;
  });

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
    if (!this.actionable() && this.isOwn() && !this.needsModeration()) return 'Sin hilo';
    if (this.needsModeration()) return 'Ahora';
    if (this.score() >= 80) return 'En 2 h';
    if (this.score() >= 60) return 'Hoy';
    if (this.score() >= 35) return 'Mañana';
    return 'Esta semana';
  }

  severityKey(): string {
    return String((this.enriched() || this.alert()).severity || 'medium').toLowerCase();
  }

  severityShort(): string {
    return this.severityLabelEs().toUpperCase();
  }

  severityLabelEs(): string {
    const s = String((this.enriched() || this.alert()).severity || 'MEDIUM').toUpperCase();
    if (s === 'CRITICAL') return 'Crítica';
    if (s === 'HIGH') return 'Alta';
    if (s === 'LOW') return 'Baja';
    return 'Media';
  }

  sentimentTone(): 'pos' | 'neg' | 'neu' | 'mix' {
    const s = String(
      (this.enriched() || this.alert())._sentiment ||
        (this.enriched() || this.alert()).sentiment ||
        'NEUTRAL',
    ).toUpperCase();
    if (s === 'POSITIVE' || s === 'POS' || s === 'POSITIVO') return 'pos';
    if (s === 'NEGATIVE' || s === 'NEG' || s === 'NEGATIVO') return 'neg';
    if (s === 'MIXED' || s === 'MIXTO') return 'mix';
    return 'neu';
  }

  sentimentLabelEs(): string {
    const tone = this.sentimentTone();
    if (tone === 'pos') return 'Positivo';
    if (tone === 'neg') return 'Negativo';
    if (tone === 'mix') return 'Mixto';
    return 'Neutro';
  }

  sentimentClass(): string {
    const s = String(
      (this.enriched() || this.alert())._sentiment ||
        (this.enriched() || this.alert()).sentiment ||
        'NEUTRAL',
    ).toUpperCase();
    if (s === 'POSITIVE') return 'rl-chip--pos';
    if (s === 'NEGATIVE') return 'rl-chip--neg';
    if (s === 'MIXED') return 'rl-chip--mix';
    return 'rl-chip--neu';
  }

  clusterShort(): string {
    return this.themeShort();
  }

  statusLabelEs(): string {
    const s = String((this.enriched() || this.alert()).status || 'NEW').toUpperCase();
    if (s === 'NEW') return 'Sin atender';
    if (s === 'CONTACTED') {
      const post = (this.enriched() || this.alert())._mockPost;
      return post ? `Publicada en ${post.platformLabel} (demo)` : 'Ya contactada';
    }
    if (s === 'WON') return 'Resuelta / ganada';
    if (s === 'DISMISSED') return 'Descartada';
    if (s === 'SNOOZED') return 'Pospuesta';
    return s;
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
    // Parent lleva el estado: un solo card abierto (selectedId).
    this.select.emit(this.alert().alertId);
  }

  openAnalysis(ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.analysisOpen = true;
    this.select.emit(this.alert().alertId);
  }

  focusDraftsFromModal(): void {
    this.analysisOpen = false;
    this.select.emit(this.alert().alertId);
    this.analyze.emit(this.alert().alertId);
  }

  markRespondedFromModal(): void {
    if (this.isOwn() && this.actionable() && this.selectedDraft()?.body) {
      this.publishOwnReply();
    } else {
      this.markResponded();
    }
    this.analysisOpen = false;
    this.flashReportFeedback('Simulado en la plataforma de origen');
  }

  copySuggested(): void {
    void this.writeClipboard(this.suggestedReply()).then((ok) => {
      this.flashReportFeedback(ok ? 'Respuesta copiada' : 'No se pudo copiar');
    });
  }

  copyFullReport(): void {
    void this.writeClipboard(this.buildReportPlainText()).then((ok) => {
      this.flashReportFeedback(ok ? 'Informe copiado' : 'No se pudo copiar');
    });
  }

  downloadReportMd(): void {
    const body = this.buildReportMarkdown();
    const stamp = new Date().toISOString().slice(0, 10);
    const id = String(this.alert().alertId || 'alert').slice(0, 16);
    this.triggerDownload(
      `responselens-informe-${id}-${stamp}.md`,
      body,
      'text/markdown;charset=utf-8',
    );
    this.flashReportFeedback('Markdown descargado');
  }

  downloadReportPdf(): void {
    const html = this.buildReportPrintHtml();
    const win = window.open('', '_blank', 'noopener,noreferrer,width=840,height=900');
    if (!win) {
      this.flashReportFeedback('Permití ventanas emergentes para exportar PDF');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Dar tiempo al layout antes del diálogo de impresión / Guardar como PDF.
    setTimeout(() => {
      try {
        win.print();
      } catch {
        this.flashReportFeedback('Abrí la ventana e imprimí / guardá como PDF');
      }
    }, 280);
    this.flashReportFeedback('Usá “Guardar como PDF” en el diálogo de impresión');
  }

  private flashReportFeedback(msg: string): void {
    this.reportFeedback.set(msg);
    if (this.reportFeedbackTimer) clearTimeout(this.reportFeedbackTimer);
    this.reportFeedbackTimer = setTimeout(() => this.reportFeedback.set(''), 3200);
  }

  private async writeClipboard(text: string): Promise<boolean> {
    const value = String(text || '').trim();
    if (!value) return false;
    try {
      await navigator.clipboard?.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  private triggerDownload(filename: string, body: string, mime: string): void {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildReportPlainText(): string {
    const a = this.enriched() || this.alert();
    const lines: string[] = [
      this.analysisTitle(),
      `${this.scoreKindLabel()}: ${this.score()}/100 (${this.scoreLabel() || this.scoreBand()})`,
      `Prioridad: ${this.slaLabel()}`,
      `Acción: ${this.recommendedAction()}`,
      '',
      'Qué se dijo',
      String(a.originalComplaint || '').trim(),
      '',
    ];

    lines.push('En pocas palabras');
    if (this.insightTipo()) lines.push(`Qué es: ${this.insightTipo()}`);
    if (this.insightLectura()) lines.push(`Por qué importa: ${this.insightLectura()}`);
    else if (!this.insightAccion()) lines.push(`Por qué importa: ${this.analysisText()}`);
    lines.push(`Qué hacer: ${this.insightAccion() || this.recommendedAction()}`);
    if (this.insightTip()) lines.push(`Ojo: ${this.insightTip()}`);

    if (!this.isOwn() && this.conquestResumen()) {
      lines.push('', 'Inteligencia de captación', this.conquestResumen());
      if (this.conquestConversion()) lines.push(`Captación: ${this.conquestConversion()}`);
      if (this.conquestTags().length) lines.push(`Etiquetas: ${this.conquestTags().join(' · ')}`);
    }

    if (this.suggestedReply()) {
      lines.push('', this.isOwn() ? 'Respuesta sugerida' : 'Gancho comercial', this.suggestedReply());
    }

    const drivers = this.scoreDrivers();
    if (drivers.length) {
      lines.push('', 'Por qué este score');
      for (const d of drivers) lines.push(`- ${d}`);
    }

    const pb = this.playbook();
    if (pb) {
      lines.push('', 'Playbook', pb.oneLiner);
      pb.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}: ${s.body}`));
      if (pb.donts.length) {
        lines.push('No hacer:');
        for (const d of pb.donts) lines.push(`- ${d}`);
      }
    }

    if (this.hasSourceUrl()) {
      lines.push('', `Fuente: ${a.sourceUrl}`);
    }

    lines.push('', `Alert ID: ${a.alertId}`, `Generado: ${new Date().toLocaleString('es-AR')}`);
    return lines.filter((x) => x != null).join('\n');
  }

  private buildReportMarkdown(): string {
    const a = this.enriched() || this.alert();
    const parts: string[] = [
      `# ${this.analysisTitle()}`,
      '',
      `**${this.scoreKindLabel()}:** ${this.score()}/100 (${this.scoreLabel() || this.scoreBand()})  `,
      `**Prioridad:** ${this.slaLabel()}  `,
      `**Acción:** ${this.recommendedAction()}`,
      '',
      '## Qué se dijo',
      '',
      `> ${String(a.originalComplaint || '').trim().replace(/\n/g, '\n> ')}`,
      '',
      '## En pocas palabras',
      '',
    ];

    if (this.insightTipo()) parts.push(`**Qué es:** ${this.insightTipo()}`, '');
    if (this.insightLectura()) {
      parts.push(`**Por qué importa:** ${this.insightLectura()}`, '');
    } else if (!this.insightAccion()) {
      parts.push(`**Por qué importa:** ${this.analysisText()}`, '');
    }
    parts.push(`**Qué hacer:** ${this.insightAccion() || this.recommendedAction()}`, '');
    if (this.insightTip()) parts.push(`**Ojo:** ${this.insightTip()}`, '');

    if (!this.isOwn() && this.conquestResumen()) {
      parts.push('## Inteligencia de captación', '', this.conquestResumen(), '');
      if (this.conquestConversion()) {
        parts.push(`**Captación:** ${this.conquestConversion()}`, '');
      }
    }

    if (this.suggestedReply()) {
      parts.push(this.isOwn() ? '## Respuesta sugerida' : '## Gancho comercial', '', this.suggestedReply(), '');
    }

    const drivers = this.scoreDrivers();
    if (drivers.length) {
      parts.push('## Por qué este score', '');
      for (const d of drivers) parts.push(`- ${d}`);
      parts.push('');
    }

    const pb = this.playbook();
    if (pb) {
      parts.push('## Playbook', '', pb.oneLiner, '');
      pb.steps.forEach((s, i) => parts.push(`${i + 1}. **${s.title}** — ${s.body}`));
      if (pb.donts.length) {
        parts.push('', '### No hacer');
        for (const d of pb.donts) parts.push(`- ${d}`);
      }
      parts.push('');
    }

    if (this.hasSourceUrl()) parts.push(`**Fuente:** ${a.sourceUrl}`, '');
    parts.push(`_Alert ${a.alertId} · ${new Date().toLocaleString('es-AR')}_`);
    return parts.join('\n');
  }

  private buildReportPrintHtml(): string {
    const escape = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const a = this.enriched() || this.alert();
    const drivers = this.scoreDrivers()
      .map((d) => `<li>${escape(d)}</li>`)
      .join('');
    const pb = this.playbook();
    const playbookHtml = pb
      ? `<h2>Playbook</h2><p>${escape(pb.oneLiner)}</p><ol>${pb.steps
          .map((s) => `<li><strong>${escape(s.title)}</strong> — ${escape(s.body)}</li>`)
          .join('')}</ol>${
          pb.donts.length
            ? `<h3>No hacer</h3><ul>${pb.donts.map((d) => `<li>${escape(d)}</li>`).join('')}</ul>`
            : ''
        }`
      : '';

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escape(this.analysisTitle())}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 24px; line-height: 1.5; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    h2 { font-size: 1.05rem; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 0.95rem; margin: 16px 0 6px; }
    .meta { color: #444; font-size: 0.92rem; margin: 0 0 16px; }
    .action { background: #f4f4f5; padding: 10px 12px; border-radius: 8px; }
    .quote { white-space: pre-wrap; border-left: 3px solid #111; padding: 8px 12px; background: #fafafa; }
    ul, ol { padding-left: 1.2rem; }
    .foot { margin-top: 28px; font-size: 0.8rem; color: #666; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>${escape(this.analysisTitle())}</h1>
  <p class="meta">${escape(this.scoreKindLabel())}: <strong>${this.score()}/100</strong>
    (${escape(this.scoreLabel() || this.scoreBand())}) · Prioridad ${escape(this.slaLabel())}</p>
  <p class="action"><strong>Acción:</strong> ${escape(this.recommendedAction())}</p>
  <h2>Qué se dijo</h2>
  <p class="quote">${escape(String(a.originalComplaint || '').trim())}</p>
  <h2>En pocas palabras</h2>
  ${this.insightTipo() ? `<p><strong>Qué es:</strong> ${escape(this.insightTipo())}</p>` : ''}
  ${
    this.insightLectura()
      ? `<p><strong>Por qué importa:</strong> ${escape(this.insightLectura())}</p>`
      : `<p><strong>Por qué importa:</strong> ${escape(this.analysisText())}</p>`
  }
  <p><strong>Qué hacer:</strong> ${escape(this.insightAccion() || this.recommendedAction())}</p>
  ${this.insightTip() ? `<p><strong>Ojo:</strong> ${escape(this.insightTip())}</p>` : ''}
  ${
    !this.isOwn() && this.conquestResumen()
      ? `<h2>Inteligencia de captación</h2><p>${escape(this.conquestResumen())}</p>${
          this.conquestConversion()
            ? `<p><strong>Captación:</strong> ${escape(this.conquestConversion())}</p>`
            : ''
        }`
      : ''
  }
  ${this.suggestedReply() ? `<h2>${this.isOwn() ? 'Respuesta sugerida' : 'Gancho comercial'}</h2><p class="quote">${escape(this.suggestedReply())}</p>` : ''}
  ${drivers ? `<h2>Por qué este score</h2><ul>${drivers}</ul>` : ''}
  ${playbookHtml}
  ${this.hasSourceUrl() ? `<p class="foot">Fuente: ${escape(a.sourceUrl)}</p>` : ''}
  <p class="foot">ResponseLens AI · ${escape(a.alertId)} · ${escape(new Date().toLocaleString('es-AR'))}</p>
</body>
</html>`;
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

  publishOwnReply(): void {
    const body = this.selectedDraft()?.body?.trim() || '';
    if (!body) return;
    void navigator.clipboard?.writeText(body);
    this.publishReply.emit({ alertId: this.alert().alertId, body });
  }

  publishRivalPitch(): void {
    const body = (this.selectedPitch()?.body || this.alert().salesPitch || '').trim();
    if (!body) return;
    void navigator.clipboard?.writeText(body);
    this.publishReply.emit({ alertId: this.alert().alertId, body });
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
    if (alert._actionable === false && !isReplyableContent(normalizeContentKind(alert._mentionKind, alert.channel), alert._scMeta)) {
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
