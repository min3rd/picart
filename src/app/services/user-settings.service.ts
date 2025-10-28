import { Injectable, inject, signal, computed } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export interface PanelSizes {
  left: number;
  right: number;
  bottom: number;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  lang: string;
  panels: PanelSizes;
}

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private readonly STORAGE_KEY = 'picart.user.settings.v1';
  private readonly transloco = inject(TranslocoService);
  private readonly _state = signal<UserSettings>({
    theme: 'light',
    lang: 'en',
    panels: { left: 220, right: 260, bottom: 112 },
  });

  readonly theme = computed(() => this._state().theme);

  constructor() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserSettings;
        this._state.set({
          theme: parsed.theme || 'light',
          lang: parsed.lang || 'en',
          panels: parsed.panels || { left: 220, right: 260, bottom: 112 },
        });
      }
    } catch {}
    this.applyTheme(this._state().theme);
    try {
      this.transloco.setActiveLang(this._state().lang);
    } catch {}
  }

  get settings() {
    return this._state();
  }

  setTheme(theme: 'light' | 'dark') {
    this._state.update((s) => ({ ...s, theme }));
    this.applyTheme(theme);
    this.save();
  }

  setLanguage(lang: string) {
    this._state.update((s) => ({ ...s, lang }));
    try {
      this.transloco.setActiveLang(lang);
    } catch {}
    this.save();
  }

  setPanelSizes(p: PanelSizes) {
    this._state.update((s) => ({ ...s, panels: p }));
    this.save();
  }

  private applyTheme(theme: 'light' | 'dark') {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }

  private save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state()));
    } catch {}
  }
}
