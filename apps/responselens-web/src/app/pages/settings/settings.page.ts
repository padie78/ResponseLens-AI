import { Component, ViewEncapsulation } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Configuración</h1>
        <p class="rl-page__lead">
          Empresa, rivales, fuentes API e integraciones CRM. Secretos locales no van a DynamoDB.
        </p>
        <div class="rl-page__panel">Próximo: formularios + saveUserConfig vía AppSync.</div>
      </div>
    </ion-content>
  `,
})
export class SettingsPageComponent {}
