import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { AppSubnavComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-shell-page',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, RouterLink, AppSubnavComponent],
  template: `
    <div class="rl-app-shell">
      <div class="rl-app-shell__chrome">
        <div class="rl-app-shell__top">
          <a class="rl-app-shell__brand" routerLink="/app/own">
            <span class="rl-app-shell__mark">RL</span>
            <span class="rl-app-shell__name">ResponseLens</span>
          </a>
          <div class="rl-app-shell__actions">
            @if (auth.email(); as email) {
              <span class="rl-app-shell__user">{{ email }}</span>
            }
            <button type="button" class="rl-app-shell__logout" (click)="logout()">Salir</button>
          </div>
        </div>
        <rl-app-subnav />
      </div>
      <main class="rl-app-shell__content">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertsStore);
  private readonly config = inject(UserConfigStore);

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  async logout(): Promise<void> {
    this.alerts.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
