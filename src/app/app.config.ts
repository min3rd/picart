import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './i18n/transloco-loader';
import { provideIcons } from '@ng-icons/core';
import * as heroIcons from '@ng-icons/heroicons/outline';
import * as heroIconsMini from '@ng-icons/heroicons/mini';
import * as featherIcons from '@ng-icons/feather-icons';
import * as bootstrapIcons from '@ng-icons/bootstrap-icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideIcons({ ...heroIcons, ...heroIconsMini, ...featherIcons, ...bootstrapIcons }),
    provideTransloco({
      config: {
        availableLangs: ['en', 'vi'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
