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
import {
  heroEye,
  heroEyeSlash,
  heroTrash,
  heroCursorArrowRays,
  heroRectangleGroup,
  heroCircleStack,
  heroSparkles,
  heroEyeDropper,
  heroPaintBrush,
  heroBackspace,
  heroMinus,
  heroSquare2Stack,
} from '@ng-icons/heroicons/outline';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideIcons({
      eye: heroEye,
      eyeSlash: heroEyeSlash,
      trash: heroTrash,
      cursor: heroCursorArrowRays,
      rectSelect: heroRectangleGroup,
      ellipseSelect: heroCircleStack,
      lassoSelect: heroSparkles,
  eyedropper: heroEyeDropper,
      fill: heroPaintBrush,
  eraser: heroBackspace,
      line: heroMinus,
      circle: heroCircleStack,
      square: heroSquare2Stack,
    }),
    provideTransloco({
      config: {
        availableLangs: ['en', 'vi'],
        defaultLang: 'vi',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
