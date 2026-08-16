import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { UiPreferencesService } from './core/preferences/ui-preferences.service';

@Component({
  selector: 'rl-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
})
export class AppComponent {
  /** Apply persisted theme/locale before first paint of authenticated UI. */
  private readonly prefs = inject(UiPreferencesService);

  constructor() {
    void this.prefs;
  }
}
