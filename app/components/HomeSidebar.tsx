"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  SiteSidebarGroup,
  SiteSidebarLink,
} from "../_config/siteNavigation";
import { useSiteLocale } from "../_i18n/I18nProvider";
import {
  SUPPORTED_SITE_LANGUAGES,
  getLanguageMeta,
} from "../_i18n/locales";
import styles from "./HomeSidebar.module.css";

type HomeSidebarProps = {
  links: SiteSidebarLink[];
  groups: SiteSidebarGroup[];
};

export default function HomeSidebar({ links, groups }: HomeSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const { locale, setLocale } = useSiteLocale();
  const [languageMenuPath, setLanguageMenuPath] = useState<string | null>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const isLanguageMenuOpen = languageMenuPath === pathname;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuPath(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuPath(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const activeLanguage = getLanguageMeta(locale);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <p className={styles.brandTitle}>{t("brand.title")}</p>
      </div>

      <nav aria-label="Homepage navigation" className={styles.nav}>
        <div className={styles.linkStack}>
          {links.map((link) => (
            <Link
              className={`${styles.navLink} ${
                pathname === link.href ? styles.navLinkActive : ""
              }`}
              href={link.href}
              key={link.href}
            >
              <span className={styles.navBullet} aria-hidden="true" />
              <span>{t(link.labelKey)}</span>
            </Link>
          ))}
        </div>

        <div className={styles.groupStack}>
          {groups.map((group) => {
            const hasActiveItem = group.items.some((item) => item.href === pathname);
            const isGroupPage = pathname === group.href;
            const isOpen = isGroupPage || hasActiveItem;
            const groupId = `group-${group.href.replaceAll("/", "-") || "root"}`;

            return (
              <div className={styles.group} key={group.href}>
                <Link
                  className={`${styles.groupButton} ${
                    isOpen ? styles.groupButtonActive : ""
                  }`}
                  href={group.href}
                >
                  <span className={styles.groupLabel}>{t(group.labelKey)}</span>
                  <span
                    aria-hidden="true"
                    className={`${styles.groupChevron} ${
                      isOpen ? styles.groupChevronOpen : ""
                    }`}
                  >
                    v
                  </span>
                </Link>

                <div
                  className={`${styles.groupItems} ${
                    isOpen ? styles.groupItemsOpen : ""
                  }`}
                  id={groupId}
                >
                  <div className={styles.groupItemsInner}>
                    {group.items.map((item) => (
                      <Link
                        className={`${styles.groupLink} ${
                          pathname === item.href ? styles.groupLinkActive : ""
                        }`}
                        href={item.href}
                        key={item.href}
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className={styles.localeDock} ref={languageMenuRef}>
        <button
          aria-expanded={isLanguageMenuOpen}
          aria-haspopup="listbox"
          aria-label={t("language.current", { language: activeLanguage.label })}
          className={`${styles.localeButton} ${
            isLanguageMenuOpen ? styles.localeButtonOpen : ""
          }`}
          onClick={() => {
            setLanguageMenuPath((value) => (value === pathname ? null : pathname));
          }}
          type="button"
        >
          <span className={styles.localeButtonCode}>{activeLanguage.shortLabel}</span>
          <span
            aria-hidden="true"
            className={`${styles.localeChevron} ${
              isLanguageMenuOpen ? styles.localeChevronOpen : ""
            }`}
          >
            v
          </span>
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
                  setLanguageMenuPath(null);
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
    </aside>
  );
}
