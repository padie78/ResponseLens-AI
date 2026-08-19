import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  formatScanWhen,
  lastAutomaticScanAt,
  peekManualScanQuota,
} from '../../../engine/listening-policy.js';
import { isExternalApisMock } from '../../../engine/external-apis-mock.js';
import { ScanService } from '../../../services/scan.service';
import { AlertsStore } from '../../../stores/alerts.store';

@Component({
  standalone: true,
  selector: 'rl-listening-status',
  encapsulation: ViewEncapsulation.None,
  template: `
    <p class="rl-page__status rl-listening-status">
      Última pasada automática: {{ autoLabel() }}.
      La bandeja se actualiza sola 1× al día (~08:00 AR).
      @if (mock()) {
        Scan demo y Forzar ahora simulan la API (0 créditos).
      } @else {
        Forzar ahora: {{ quotaLabel() }}. Scan demo no gasta créditos.
      }
    </p>
    @if (scan.lastStatus() && !scan.scanning()) {
      <p class="rl-page__status">{{ scan.lastStatus() }}</p>
    }
  `,
})
export class ListeningStatusComponent {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertsStore);
  readonly scan = inject(ScanService);

  /** Recalcula al cambiar el status del scan (misma pasada). */
  readonly tick = input(0);

  readonly mock = computed(() => isExternalApisMock());

  readonly autoLabel = computed(() => {
    void this.tick();
    void this.scan.lastStatus();
    return formatScanWhen(lastAutomaticScanAt(this.alerts.items()));
  });

  readonly quotaLabel = computed(() => {
    void this.tick();
    void this.scan.lastStatus();
    const q = peekManualScanQuota(this.auth.userId() || '');
    if (q.exhausted) return `tope alcanzado (${q.limit}/día)`;
    return `${q.remaining} de ${q.limit} scans manuales hoy`;
  });
}
