"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FaChevronDown } from "react-icons/fa";
import { HiHome, HiWrenchScrewdriver } from "react-icons/hi2";
import { LuPanelLeftClose } from "react-icons/lu";
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
  const [isToolsSidebarDismissed, setIsToolsSidebarDismissed] = useState(false);
  const isSpriteEditorGroupOpen = pathname.startsWith("/tools/sprite-editor");
  const isImageEditorGroupOpen = pathname.startsWith("/tools/image-editor");
  const toolGroups = [
    {
      id: "sprite-editor",
      href: "/tools/sprite-editor/merge",
      label: t("toolNavigation.spriteEditor"),
      items: [
        {
          id: "sprite-editor-merge",
          href: "/tools/sprite-editor/merge",
          label: t("toolNavigation.spriteEditorMerge"),
        },
        {
          id: "sprite-editor-split",
          href: "/tools/sprite-editor/split",
          label: t("toolNavigation.spriteEditorSplit"),
        },
      ],
    },
    {
      id: "image-editor",
      href: "/tools/image-editor/color-adjustment",
      label: t("toolNavigation.imageEditor"),
      items: [
        {
          id: "image-editor-color-adjustment",
          href: "/tools/image-editor/color-adjustment",
          label: t("toolNavigation.imageEditorColorAdjustment"),
        },
      ],
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
                  onClick={(event) => {
                    if (item.id === "tools") {
                      if (activeSection === "tools") {
                        event.preventDefault();

                        if (isToolsSidebarMounted && isToolsSidebarExpanded) {
                          setIsToolsSidebarDismissed(true);
                          setIsToolsSidebarExpanded(false);
                          setIsToolsEnterPending(false);
                          return;
                        }
                      }

                      if (activeSection !== "tools" || isToolsSidebarDismissed) {
                        setIsToolsSidebarDismissed(false);
                        setIsToolsSidebarMounted(true);
                        setIsToolsSidebarExpanded(false);
                        setIsToolsEnterPending(true);
                      }
                    } else if (activeSection === "tools") {
                      setIsToolsSidebarDismissed(false);
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
                <button
                  aria-label={t("navigation.collapseTools")}
                  className={styles.sidebarCloseButton}
                  onClick={() => {
                    setIsToolsSidebarDismissed(true);
                    setIsToolsSidebarExpanded(false);
                    setIsToolsEnterPending(false);
                  }}
                  type="button"
                >
                  <LuPanelLeftClose aria-hidden="true" />
                </button>
              </div>

              <nav aria-label={t("mainNavigation.tools")} className={styles.nav}>
                <div className={styles.groupStack}>
                  {toolGroups.map((group) => (
                    <div className={styles.group} key={group.id}>
                      {(() => {
                        const isGroupOpen =
                          group.id === "sprite-editor"
                            ? isSpriteEditorGroupOpen
                            : isImageEditorGroupOpen;

                        return (
                      <Link
                        aria-current={isGroupOpen ? "page" : undefined}
                        className={`${styles.groupButton} ${
                          isGroupOpen ? styles.groupButtonActive : ""
                        }`}
                        href={group.href}
                      >
                        <span className={styles.groupLabel}>{group.label}</span>
                        <FaChevronDown
                          aria-hidden="true"
                          className={`${styles.groupChevron} ${
                            isGroupOpen ? styles.groupChevronOpen : ""
                          }`}
                        />
                      </Link>
                        );
                      })()}

                      <div
                        className={`${styles.groupItems} ${
                          (group.id === "sprite-editor"
                            ? isSpriteEditorGroupOpen
                            : isImageEditorGroupOpen)
                            ? styles.groupItemsOpen
                            : ""
                        }`}
                      >
                        <div className={styles.groupItemsInner}>
                          {group.items.map((item) => (
                            <Link
                              aria-current={pathname === item.href ? "page" : undefined}
                              className={`${styles.groupLink} ${
                                pathname === item.href ? styles.groupLinkActive : ""
                              }`}
                              href={item.href}
                              key={item.id}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
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
