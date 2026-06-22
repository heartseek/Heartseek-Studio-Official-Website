"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  DEFAULT_SITE_LANGUAGE,
  SITE_LANGUAGE_COOKIE_KEY,
  SITE_LANGUAGE_STORAGE_KEY,
  getLanguageMeta,
  type SiteLanguageCode,
} from "./locales";
import { siteMessages } from "./messages";

type SiteLocaleContextValue = {
  locale: SiteLanguageCode;
  setLocale: (locale: SiteLanguageCode) => void;
};

const SiteLocaleContext = createContext<SiteLocaleContextValue | null>(null);

export function useSiteLocale() {
  const context = useContext(SiteLocaleContext);

  if (!context) {
    throw new Error("useSiteLocale must be used within SiteI18nProvider.");
  }

  return context;
}

export default function SiteI18nProvider({
  initialLocale = DEFAULT_SITE_LANGUAGE,
  children,
}: {
  initialLocale?: SiteLanguageCode;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<SiteLanguageCode>(initialLocale);

  const setLocale = (nextLocale: SiteLanguageCode) => {
    setLocaleState(nextLocale);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }

    const meta = getLanguageMeta(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.dir ?? "ltr";

    document.cookie = `${SITE_LANGUAGE_COOKIE_KEY}=${encodeURIComponent(
      locale,
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale]);

  return (
    <SiteLocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={siteMessages[locale]}>
        {children}
      </NextIntlClientProvider>
    </SiteLocaleContext.Provider>
  );
}
