import {
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { chromeT } from '../../core/i18n/chrome-i18n';
import { UiPreferencesService } from '../../core/preferences/ui-preferences.service';
import { subscribeOnNewCompetitorAlert } from '../../engine/alerts-cloud.js';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { AppSidebarComponent } from '../../ui/organisms/app-sidebar/app-sidebar.component';
import { AppTopbarComponent } from '../../ui/organisms/app-topbar/app-topbar.component';

@Component({
  standalone: true,
  selector: 'rl-shell-page',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, AppTopbarComponent, AppSidebarComponent],
  template: `
    <div class="rl-layout">
      <rl-app-sidebar [companyName]="companyLabel()" />
      <div class="rl-layout__main">
        <rl-app-topbar [companyName]="companyLabel()" [showModules]="false" (logout)="logout()" />
        <main class="rl-layout__content rl-app-shell__content">
          <router-outlet />
        </main>
      </div>

      @if (alerts.liveToast(); as toast) {
        <button
          type="button"
          class="rl-live-toast"
          [attr.data-scope]="toast.brandScope"
          (click)="openToast(toast.brandScope)"
        >
          <span class="rl-live-toast__pulse" aria-hidden="true"></span>
          <span class="rl-live-toast__body">
            <strong>{{ t('chrome.notify.toast') }}</strong>
            <span>{{ toast.snippet || toast.title }}</span>
          </span>
          <i class="pi pi-times" aria-hidden="true" (click)="dismissToast($event)"></i>
        </button>
      }
    </div>
  `,
})
export class ShellPageComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly prefs = inject(UiPreferencesService);
  private readonly router = inject(Router);
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);

  private alertSub: { unsubscribe: () => void } | null = null;

  ngOnInit(): void {
    void this.prefs;
    this.config.load();
    this.alerts.load();
    this.startAlertSubscription();
  }

  ngOnDestroy(): void {
    this.alertSub?.unsubscribe();
    this.alertSub = null;
  }

  t(key: string): string {
    return chromeT(key, this.prefs.locale());
  }

  companyLabel(): string {
    return this.config.companyName() || 'ResponseLens AI';
  }

  async openToast(scope: 'own' | 'rival'): Promise<void> {
    this.alerts.dismissLiveToast();
    await this.router.navigateByUrl(scope === 'own' ? '/app/own' : '/app/competitors');
  }

  dismissToast(ev: Event): void {
    ev.stopPropagation();
    this.alerts.dismissLiveToast();
  }

  async logout(): Promise<void> {
    this.alertSub?.unsubscribe();
    this.alertSub = null;
    this.alerts.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private startAlertSubscription(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.alertSub?.unsubscribe();
    this.alertSub = subscribeOnNewCompetitorAlert(userId, (alert) => {
      this.alerts.applyIncoming(alert, 'push');
    });
  }
}
