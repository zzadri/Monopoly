import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'monopoly-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.readInitialTheme());

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private set(theme: Theme): void {
    this.theme.set(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }

  private readInitialTheme(): Theme {
    if (typeof document === 'undefined') {
      return 'light';
    }
    const fromDom = document.documentElement.getAttribute('data-theme');
    return fromDom === 'dark' ? 'dark' : 'light';
  }
}
