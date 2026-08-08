import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeChoice = 'dark' | 'light' | 'system';

export interface Prefs {
  theme: ThemeChoice;
  sound: boolean;
  volume: number; // 0 → 1
}

const DEFAULTS: Prefs = { theme: 'dark', sound: true, volume: 0.6 };
const STORAGE_KEY = 'monopolie:prefs';

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

interface PrefsCtx extends Prefs {
  readonly set: (patch: Partial<Prefs>) => void;
  /** thème réellement appliqué (« system » résolu) */
  readonly resolvedTheme: 'dark' | 'light';
}

const Context = createContext<PrefsCtx>(null!);
export const usePrefs = () => useContext(Context);

export function PrefsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [systemDark, setSystemDark] = useState(
    () => !window.matchMedia('(prefers-color-scheme: light)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(!e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  let resolvedTheme: 'dark' | 'light';
  if (prefs.theme === 'system') resolvedTheme = systemDark ? 'dark' : 'light';
  else resolvedTheme = prefs.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'light' ? '#f4f1fb' : '#171226');
  }, [resolvedTheme]);

  const set = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible (navigation privée) : on garde en mémoire
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, set, resolvedTheme }), [prefs, set, resolvedTheme]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
