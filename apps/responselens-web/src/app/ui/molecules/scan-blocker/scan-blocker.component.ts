import { Component, ViewEncapsulation, input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'rl-scan-blocker',
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (active()) {
      <div class="rl-scan-blocker" role="status" aria-live="polite">
        <div class="rl-scan-blocker__card">
          <div class="rl-scan-blocker__spinner" aria-hidden="true"></div>
          <p class="rl-scan-blocker__title">{{ title() }}</p>
          @if (message()) {
            <p class="rl-scan-blocker__msg">{{ message() }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class ScanBlockerComponent {
  readonly active = input(false);
  readonly title = input('Escaneando fuentes…');
  readonly message = input('');
}
