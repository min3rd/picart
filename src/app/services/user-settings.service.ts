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
  private readonly STORAGE_KEY = 'pixart.user.settings.v1';
  private readonly transloco = inject(TranslocoService);
  private readonly _state = signal<UserSettings>(this.createInitialState());
  private customThemePreference = false;
  private systemThemeQuery: MediaQueryList | null = null;
  private systemThemeListener: ((event: MediaQueryListEvent) => void) | null =
    null;

  readonly theme = computed(() => this._state().theme);

  constructor() {
    const stored = this.readStoredSettings();
    if (stored) {
      this.customThemePreference = true;
      this._state.set(stored);
    }
    this.applyTheme(this._state().theme);
    this.attachSystemThemeListener();
    try {
      this.transloco.setActiveLang(this._state().lang);
    } catch {}
  }

  get settings() {
    return this._state();
  }

  setTheme(theme: 'light' | 'dark') {
    this.customThemePreference = true;
    this.updateTheme(theme, true);
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
    if (typeof document === 'undefined') return;
    const targets: Element[] = [document.documentElement];
    if (document.body) targets.push(document.body);
    for (const el of targets) {
      el.classList.toggle('dark', theme === 'dark');
    }
    if ('style' in document.documentElement) {
      document.documentElement.style.colorScheme = theme;
    }
  }

  private save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state()));
    } catch {}
  }

  private createInitialState(): UserSettings {
    return {
      theme: this.detectSystemTheme(),
      lang: 'en',
      panels: { left: 220, right: 260, bottom: 112 },
    };
  }

  private detectSystemTheme(): 'light' | 'dark' {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  private readStoredSettings(): UserSettings | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        theme: parsed?.theme === 'dark' ? 'dark' : 'light',
        lang: parsed?.lang || 'en',
        panels: parsed?.panels || { left: 220, right: 260, bottom: 112 },
      };
    } catch {
      return null;
    }
  }

  private attachSystemThemeListener() {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;
    this.systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (!this.customThemePreference) {
      const theme = this.systemThemeQuery.matches ? 'dark' : 'light';
      this.updateTheme(theme, false);
    }
    const handler = (event: MediaQueryListEvent) => {
      if (this.customThemePreference) return;
      const next = event.matches ? 'dark' : 'light';
      this.updateTheme(next, false);
    };
    this.systemThemeQuery.addEventListener('change', handler);
    this.systemThemeListener = handler;
  }

  private updateTheme(theme: 'light' | 'dark', persist: boolean) {
    this._state.update((s) => (s.theme === theme ? s : { ...s, theme }));
    this.applyTheme(theme);
    if (persist) this.save();
  }
}
