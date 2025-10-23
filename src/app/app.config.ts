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
  heroPlus,
  heroCursorArrowRays,
  heroRectangleGroup,
  heroCircleStack,
  heroSparkles,
  heroEyeDropper,
  heroPaintBrush,
  heroBackspace,
  heroMinus,
  heroSquare2Stack,
  heroBars3,
  heroSun,
  heroMoon,
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
      plus: heroPlus,
      drag: heroBars3,
      sun: heroSun,
      moon: heroMoon,
    }),
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
