"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HiHome, HiWrenchScrewdriver } from "react-icons/hi2";
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
  activeSection: PrimarySection;
  links: SiteSidebarLink[];
  groups: SiteSidebarGroup[];
  onSectionChange: (section: PrimarySection) => void;
};

type PrimarySection = "home" | "tools";

export default function HomeSidebar({
  activeSection,
  links,
  groups,
  onSectionChange,
}: HomeSidebarProps) {
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
  const toolItems = [
    { id: "toolkit", label: t("toolNavigation.toolkit") },
    { id: "library", label: t("toolNavigation.library") },
  ];
  const primaryItems = [
    { id: "home" as const, icon: HiHome, label: t("mainNavigation.home") },
    {
      id: "tools" as const,
      icon: HiWrenchScrewdriver,
      label: t("mainNavigation.tools"),
    },
  ];

  return (
    <div className={styles.sidebarFrame}>
      <div className={styles.brandOutside}>
        <p className={styles.brandTitle}>{t("brand.title")}</p>
      </div>

      <div className={styles.sidebarCluster}>
        <aside className={styles.primarySidebar}>
          <div className={styles.primaryRail}>
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  aria-pressed={isActive}
                  className={`${styles.primaryItem} ${
                    isActive ? styles.primaryItemActive : ""
                  }`}
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" className={styles.primaryIcon} />
                  <span className={styles.primaryLabel}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <aside
          aria-hidden={activeSection === "home"}
          className={`${styles.sidebar} ${
            activeSection === "tools" ? styles.sidebarExpanded : styles.sidebarCollapsed
          }`}
        >
          {activeSection === "tools" ? (
            <div className={styles.brand}>
              <p className={styles.sectionTitle}>{t("mainNavigation.tools")}</p>
              <p className={styles.sectionHint}>{t("toolNavigation.description")}</p>
            </div>
          ) : null}

          <nav
            aria-label={
              activeSection === "home"
                ? t("navigation.home")
                : t("mainNavigation.tools")
            }
            className={styles.nav}
          >
            {activeSection === "home" ? (
              <>
                <div className={styles.linkStack}>
                  {links.map((link) => (
                    <Link
                      className={`${styles.navLink} ${
                        pathname === link.href ? styles.navLinkActive : ""
                      }`}
                      href={link.href}
                      key={link.href}
                      onClick={() => onSectionChange("home")}
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
                          onClick={() => onSectionChange("home")}
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
                                onClick={() => onSectionChange("home")}
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
              </>
            ) : (
              <div className={styles.linkStack}>
                {toolItems.map((item) => (
                  <button className={styles.navLink} key={item.id} type="button">
                    <span className={styles.navBullet} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
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
      </div>
    </div>
  );
}
