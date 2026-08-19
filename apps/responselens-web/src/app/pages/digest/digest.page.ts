import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildDailyDigest, sendDigestToSlack } from '../../engine/ops-digest.js';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';

@Component({
  standalone: true,
  selector: 'rl-digest-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, ButtonModule],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Digest diario</h1>
        <p class="rl-page__lead">
          Texto listo para pegar en Slack o mail. Con webhook configurado se envía directo.
        </p>
        <div class="rl-page__toolbar-actions" style="margin-bottom: 1rem">
          <p-button label="Copiar markdown" icon="pi pi-copy" size="small" (onClick)="copy()" />
          <p-button
            label="Enviar a Slack"
            icon="pi pi-slack"
            size="small"
            severity="help"
            [outlined]="true"
            [disabled]="!hasSlackWebhook() || slackSending()"
            [title]="hasSlackWebhook() ? 'Enviar digest al canal de Slack' : 'Configurá webhook en Config → Integraciones'"
            (onClick)="sendToSlack()"
          />
          <a routerLink="/app/own" [queryParams]="{ inbox: 'urgent' }">Ver urgentes</a>
        </div>
        @if (copied()) {
          <p class="rl-page__status">Copiado.</p>
        }
        @if (slackResult()) {
          <p class="rl-page__status" [class.rl-page__status--error]="!slackResult()?.ok">
            {{ slackResult()?.ok ? 'Enviado a Slack.' : slackResult()?.error }}
          </p>
        }
        <pre class="rl-page__panel" style="white-space: pre-wrap">{{ digest().markdown }}</pre>
      </div>
    </ion-content>
  `,
})
export class DigestPageComponent implements OnInit {
  private readonly alerts = inject(AlertsStore);
  private readonly config = inject(UserConfigStore);
  readonly copied = signal(false);
  readonly slackSending = signal(false);
  readonly slackResult = signal<{ ok: boolean; error?: string } | null>(null);

  readonly digest = computed(() =>
    buildDailyDigest({
      alerts: this.alerts.items(),
      companyName: this.config.companyName(),
    }),
  );

  readonly hasSlackWebhook = computed(() =>
    Boolean(this.config.config()?.company?.slackWebhookUrl?.trim()),
  );

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.digest().markdown);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.copied.set(false);
    }
  }

  async sendToSlack(): Promise<void> {
    const url = this.config.config()?.company?.slackWebhookUrl;
    if (!url) return;
    this.slackSending.set(true);
    this.slackResult.set(null);
    const result = await sendDigestToSlack(this.digest().markdown, url);
    this.slackResult.set(result);
    this.slackSending.set(false);
    if (result.ok) {
      setTimeout(() => this.slackResult.set(null), 4000);
    }
  }
}
