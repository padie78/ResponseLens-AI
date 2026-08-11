import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';
import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { configureAmplify } from './app/amplify.config';
import { RuntimeConfigService } from './app/core/config/runtime-config.service';
import { environment } from './environments/environment';

// Amplify base; RuntimeConfigService re-aplica override de localStorage al inyectarse.
configureAmplify(environment);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideAnimations(),
  ],
})
  .then((appRef) => {
    appRef.injector.get(RuntimeConfigService).applyAmplify();
  })
  .catch((err: unknown) => console.error(err));
