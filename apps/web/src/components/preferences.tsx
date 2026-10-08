"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Language, TranslationKey, translations } from "@/lib/i18n";

export type Theme = "light" | "dark";
type Preferences = { ready: boolean; language: Language; setLanguage: (language: Language) => void; theme: Theme; toggleTheme: () => void; t: (key: TranslationKey) => string };

function read(key: TranslationKey, language: Language) {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) return (current as Record<string, unknown>)[part];
    return undefined;
  }, translations[language]);
  return typeof value === "string" ? value : key;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("haui-compass-language");
    const storedTheme = window.localStorage.getItem("haui-compass-theme");
    const frame = window.requestAnimationFrame(() => {
      if (storedLanguage === "en" || storedLanguage === "vi") setLanguage(storedLanguage);
      if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("haui-compass-language", language);
    window.localStorage.setItem("haui-compass-theme", theme);
  }, [language, theme, ready]);
  return <PreferencesContext.Provider value={{ ready, language, setLanguage, theme, toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"), t: (key) => read(key, language) }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("PreferencesProvider is required");
  return value;
}
