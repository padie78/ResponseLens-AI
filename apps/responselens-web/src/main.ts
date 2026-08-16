import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { definePreset } from '@primeng/themes';
import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { configureAmplify } from './app/amplify.config';
import { environment } from './environments/environment';

configureAmplify(environment);

const RlAura = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{yellow.50}',
      100: '{yellow.100}',
      200: '{yellow.200}',
      300: '{yellow.300}',
      400: '{yellow.400}',
      500: '{yellow.500}',
      600: '{yellow.600}',
      700: '{yellow.700}',
      800: '{yellow.800}',
      900: '{yellow.900}',
      950: '{yellow.950}',
    },
  },
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideAnimations(),
    providePrimeNG({
      theme: {
        preset: RlAura,
        options: {
          darkModeSelector: '.rl-dark',
          cssLayer: false,
        },
      },
    }),
  ],
}).catch((err: unknown) => console.error(err));
