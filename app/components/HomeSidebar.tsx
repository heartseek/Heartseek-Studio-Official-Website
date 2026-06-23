"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { HiHome, HiWrenchScrewdriver } from "react-icons/hi2";
import styles from "./HomeSidebar.module.css";

type HomeSidebarProps = {
  activeSection: PrimarySection;
};

type PrimarySection = "home" | "tools";

export default function HomeSidebar({
  activeSection,
}: HomeSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [isToolsSidebarMounted, setIsToolsSidebarMounted] = useState(
    activeSection === "tools",
  );
  const [isToolsSidebarExpanded, setIsToolsSidebarExpanded] = useState(
    activeSection === "tools",
  );
  const [isToolsEnterPending, setIsToolsEnterPending] = useState(false);
  const toolItems = [
    {
      id: "sprite-editor",
      href: "/tools",
      label: t("toolNavigation.spriteEditor"),
    },
  ];
  const primaryItems = [
    {
      id: "home" as const,
      href: "/" as const,
      icon: HiHome,
      label: t("mainNavigation.home"),
    },
    {
      id: "tools" as const,
      href: "/tools" as const,
      icon: HiWrenchScrewdriver,
      label: t("mainNavigation.tools"),
    },
  ];
  const isToolsSidebarVisible = isToolsSidebarMounted;

  useEffect(() => {
    if (activeSection === "tools" && isToolsEnterPending) {
      const frameId = window.requestAnimationFrame(() => {
        setIsToolsSidebarExpanded(true);
        setIsToolsEnterPending(false);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    if (
      activeSection !== "tools" &&
      isToolsSidebarMounted &&
      !isToolsSidebarExpanded &&
      !isToolsEnterPending
    ) {
      const timeoutId = window.setTimeout(() => {
        setIsToolsSidebarMounted(false);
      }, 420);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [
    activeSection,
    isToolsEnterPending,
    isToolsSidebarExpanded,
    isToolsSidebarMounted,
  ]);

  return (
    <div className={styles.sidebarFrame}>
      <div className={styles.sidebarCluster}>
        <aside className={styles.primarySidebar}>
          <div className={styles.primaryRail}>
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <Link
                  aria-pressed={isActive}
                  className={`${styles.primaryItem} ${
                    isActive ? styles.primaryItemActive : ""
                  }`}
                  href={item.href}
                  key={item.id}
                  onClick={() => {
                    if (item.id === "tools") {
                      if (activeSection !== "tools") {
                        setIsToolsSidebarMounted(true);
                        setIsToolsSidebarExpanded(false);
                        setIsToolsEnterPending(true);
                      }
                    } else if (activeSection === "tools") {
                      setIsToolsSidebarExpanded(false);
                      setIsToolsEnterPending(false);
                    }
                  }}
                >
                  <Icon aria-hidden="true" className={styles.primaryIcon} />
                  <span className={styles.primaryLabel}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>

        {isToolsSidebarVisible ? (
          <div
            className={`${styles.sidebarSlot} ${
              isToolsSidebarExpanded
                ? styles.sidebarSlotExpanded
                : styles.sidebarSlotCollapsed
            }`}
            onTransitionEnd={() => {
              if (activeSection !== "tools" && !isToolsSidebarExpanded) {
                setIsToolsSidebarMounted(false);
              }
            }}
          >
            <aside
              className={`${styles.sidebar} ${
                isToolsSidebarExpanded
                  ? styles.sidebarExpanded
                  : styles.sidebarCollapsed
              }`}
            >
              <div className={styles.brand}>
                <p className={styles.sectionTitle}>{t("mainNavigation.tools")}</p>
              </div>

              <nav aria-label={t("mainNavigation.tools")} className={styles.nav}>
                <div className={styles.linkStack}>
                  {toolItems.map((item) => (
                    <Link
                      aria-current={pathname === item.href ? "page" : undefined}
                      className={`${styles.navLink} ${
                        pathname === item.href ? styles.navLinkActive : ""
                      }`}
                      href={item.href}
                      key={item.id}
                    >
                      <span className={styles.navBullet} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </nav>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
