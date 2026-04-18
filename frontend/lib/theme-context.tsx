'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  density: Density;
  toggleDensity: () => void;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
  density: 'comfortable',
  toggleDensity: () => {},
  setDensity: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [density, setDensityState] = useState<Density>('comfortable');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read saved preference or default
    const savedTheme = localStorage.getItem('vai-theme') as Theme | null;
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setThemeState(savedTheme);
    }
    const savedDensity = localStorage.getItem('vai-density') as Density | null;
    if (savedDensity === 'compact' || savedDensity === 'comfortable') {
      setDensityState(savedDensity);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
    localStorage.setItem('vai-theme', theme);
    localStorage.setItem('vai-density', density);
  }, [theme, density, mounted]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const toggleDensity = () => {
    setDensityState((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable'));
  };

  const setDensity = (d: Density) => {
    setDensityState(d);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, density, toggleDensity, setDensity }}>
      <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
