"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FaSortDown } from "react-icons/fa";
import { MdOutlineFeedback } from "react-icons/md";
import { useSiteLocale } from "../_i18n/I18nProvider";
import {
  SUPPORTED_SITE_LANGUAGES,
  getLanguageMeta,
} from "../_i18n/locales";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  const t = useTranslations();
  const { locale, setLocale } = useSiteLocale();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const activeLanguage = getLanguageMeta(locale);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className={styles.header}>
      <p className={styles.brandTitle}>{t("brand.title")}</p>

      <div className={styles.headerActions}>
        <Link
          aria-label={t("feedback.email")}
          className={styles.feedbackButton}
          href="mailto:heartseek.studio@gmail.com"
        >
          <MdOutlineFeedback aria-hidden="true" className={styles.feedbackIcon} />
        </Link>

        <div className={styles.localeDock} ref={languageMenuRef}>
          <button
            aria-expanded={isLanguageMenuOpen}
            aria-haspopup="listbox"
            aria-label={t("language.current", { language: activeLanguage.label })}
            className={`${styles.localeButton} ${
              isLanguageMenuOpen ? styles.localeButtonOpen : ""
            }`}
            onClick={() => setIsLanguageMenuOpen((value) => !value)}
            type="button"
          >
            <span className={styles.localeButtonLabel}>{activeLanguage.nativeLabel}</span>
            <FaSortDown
              aria-hidden="true"
              className={`${styles.localeChevron} ${
                isLanguageMenuOpen ? styles.localeChevronOpen : ""
              }`}
            />
          </button>

          <div
            aria-label={t("language.select")}
            className={`${styles.localeMenu} ${
              isLanguageMenuOpen ? styles.localeMenuOpen : ""
            }`}
            role="listbox"
          >
            {SUPPORTED_SITE_LANGUAGES.map((language) => {
              const isActive = locale === language.code;

              return (
                <button
                  aria-selected={isActive}
                  className={`${styles.localeOption} ${
                    isActive ? styles.localeOptionActive : ""
                  }`}
                  key={language.code}
                  onClick={() => {
                    setLocale(language.code);
                    setIsLanguageMenuOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className={styles.localeOptionLabel}>{language.nativeLabel}</span>
                  <span className={styles.localeOptionCode}>{language.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
