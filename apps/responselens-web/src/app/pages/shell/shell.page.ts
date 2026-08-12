import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { AppSidebarComponent } from '../../ui/organisms/app-sidebar/app-sidebar.component';

@Component({
  standalone: true,
  selector: 'rl-shell-page',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, AppSidebarComponent, ButtonModule],
  template: `
    <div class="rl-layout">
      <rl-app-sidebar />
      <div class="rl-layout__main">
        <header class="rl-topbar">
          <div class="rl-topbar__left">
            <p class="rl-topbar__eyebrow">Listening · Control room</p>
            <h1 class="rl-topbar__title">{{ companyLabel() }}</h1>
          </div>
          <div class="rl-topbar__actions">
            @if (auth.email(); as email) {
              <span class="rl-topbar__user">
                <i class="pi pi-user"></i>
                {{ email }}
              </span>
            }
            <p-button
              label="Salir"
              icon="pi pi-sign-out"
              severity="secondary"
              [outlined]="true"
              size="small"
              (onClick)="logout()"
            />
          </div>
        </header>
        <main class="rl-layout__content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  companyLabel(): string {
    return this.config.companyName() || 'ResponseLens AI';
  }

  async logout(): Promise<void> {
    this.alerts.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
