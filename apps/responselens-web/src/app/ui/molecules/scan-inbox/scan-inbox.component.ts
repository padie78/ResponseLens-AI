import {
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertsStore,
  type ScanArrival,
} from '../../../stores/alerts.store';
import { chromeT } from '../../../core/i18n/chrome-i18n';
import { UiPreferencesService } from '../../../core/preferences/ui-preferences.service';

@Component({
  standalone: true,
  selector: 'rl-scan-inbox',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="rl-notify" [class.is-open]="open()">
      <button
        type="button"
        class="rl-notify__bell"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="t('chrome.notify.title')"
        (click)="toggle($event)"
      >
        <i class="pi pi-bell" aria-hidden="true"></i>
        @if (unread() > 0) {
          <span class="rl-notify__count">{{ unread() > 9 ? '9+' : unread() }}</span>
        }
      </button>

      @if (open()) {
        <div class="rl-notify__panel" role="dialog" [attr.aria-label]="t('chrome.notify.title')">
          <header class="rl-notify__header">
            <div>
              <p class="rl-notify__eyebrow">{{ t('chrome.notify.eyebrow') }}</p>
              <h2 class="rl-notify__title">{{ t('chrome.notify.title') }}</h2>
            </div>
            @if (alerts.arrivals().length) {
              <button type="button" class="rl-notify__action" (click)="alerts.markArrivalsRead()">
                {{ t('chrome.notify.markRead') }}
              </button>
            }
          </header>

          @if (!alerts.arrivals().length) {
            <p class="rl-notify__empty">{{ t('chrome.notify.empty') }}</p>
          } @else {
            <ul class="rl-notify__list">
              @for (item of alerts.arrivals(); track item.id) {
                <li>
                  <button
                    type="button"
                    class="rl-notify__item"
                    [class.is-unread]="!item.read"
                    [attr.data-scope]="item.brandScope"
                    (click)="openArrival(item)"
                  >
                    <div class="rl-notify__item-top">
                      <span class="rl-notify__badge" [attr.data-scope]="item.brandScope">
                        {{ scopeLabel(item) }}
                      </span>
                      <span class="rl-notify__time">{{ relative(item.arrivedAt) }}</span>
                    </div>
                    <p class="rl-notify__summary">{{ item.title }}</p>
                    @if (item.competitorName) {
                      <p class="rl-notify__meta">{{ item.competitorName }} · {{ item.channel }}</p>
                    }
                    @if (item.snippet) {
                      <p class="rl-notify__snippet">{{ item.snippet }}</p>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
})
export class ScanInboxComponent {
  readonly alerts = inject(AlertsStore);
  private readonly prefs = inject(UiPreferencesService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);
  readonly unread = computed(() => this.alerts.unreadArrivalCount());

  t(key: string): string {
    return chromeT(key, this.prefs.locale());
  }

  toggle(ev: Event): void {
    ev.stopPropagation();
    this.open.update((v) => !v);
    if (this.open()) this.alerts.dismissLiveToast();
  }

  scopeLabel(item: ScanArrival): string {
    return item.brandScope === 'own'
      ? this.t('chrome.notify.own')
      : this.t('chrome.notify.rival');
  }

  relative(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 45) return this.t('chrome.notify.justNow');
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  async openArrival(item: ScanArrival): Promise<void> {
    this.alerts.markArrivalRead(item.id);
    this.open.set(false);
    const route = item.brandScope === 'own' ? '/app/own' : '/app/competitors';
    await this.router.navigateByUrl(route);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.open.set(false);
  }
}
