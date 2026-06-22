export type SiteLanguageMeta = {
  code: "zh-CN" | "zh-TW" | "en" | "ms";
  label: string;
  nativeLabel: string;
  shortLabel: string;
  dir?: "ltr" | "rtl";
};

export const SUPPORTED_SITE_LANGUAGES: SiteLanguageMeta[] = [
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    nativeLabel: "\u7b80\u4f53\u4e2d\u6587",
    shortLabel: "\u7b80",
  },
  {
    code: "zh-TW",
    label: "Chinese (Traditional)",
    nativeLabel: "\u7e41\u9ad4\u4e2d\u6587",
    shortLabel: "\u7e41",
  },
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    shortLabel: "EN",
  },
  {
    code: "ms",
    label: "Malay",
    nativeLabel: "Bahasa Melayu",
    shortLabel: "MS",
  },
];

export type SiteLanguageCode = (typeof SUPPORTED_SITE_LANGUAGES)[number]["code"];

export const DEFAULT_SITE_LANGUAGE: SiteLanguageCode = "en";
export const SITE_LANGUAGE_STORAGE_KEY = "heartseek-language";
export const SITE_LANGUAGE_COOKIE_KEY = "heartseek-language";

export function isSiteLanguageCode(value: string): value is SiteLanguageCode {
  return SUPPORTED_SITE_LANGUAGES.some((language) => language.code === value);
}

export function resolveSiteLanguage(
  candidate: string | null | undefined,
): SiteLanguageCode | null {
  if (!candidate) {
    return null;
  }

  const raw = candidate.trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (
    normalized === "zh-tw" ||
    normalized.startsWith("zh-hant") ||
    normalized === "zh-hk" ||
    normalized === "zh-mo"
  ) {
    return "zh-TW";
  }

  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }

  if (normalized === "ms" || normalized.startsWith("ms-")) {
    return "ms";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  return isSiteLanguageCode(raw) ? raw : null;
}

export function detectPreferredSiteLanguage(): SiteLanguageCode {
  if (typeof navigator === "undefined") {
    return DEFAULT_SITE_LANGUAGE;
  }

  const candidates = [...(navigator.languages ?? []), navigator.language];

  for (const candidate of candidates) {
    const resolved = resolveSiteLanguage(candidate);

    if (resolved) {
      return resolved;
    }
  }

  return DEFAULT_SITE_LANGUAGE;
}

export function getLanguageMeta(locale: SiteLanguageCode): SiteLanguageMeta {
  return (
    SUPPORTED_SITE_LANGUAGES.find((language) => language.code === locale) ??
    SUPPORTED_SITE_LANGUAGES[0]
  );
}
