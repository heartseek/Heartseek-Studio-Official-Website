"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./HomeSidebar.module.css";

export type SidebarLink = {
  label: string;
  href: `/${string}` | "/";
};

export type SidebarGroup = {
  label: string;
  items: SidebarLink[];
  defaultOpen?: boolean;
};

type HomeSidebarProps = {
  title: string;
  links: SidebarLink[];
  groups: SidebarGroup[];
};

export default function HomeSidebar({
  title,
  links,
  groups,
}: HomeSidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [group.label, group.defaultOpen ?? false]),
    ),
  );

  const toggleGroup = (label: string) => {
    setOpenGroups((current) => ({
      ...current,
      [label]: !current[label],
    }));
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <p className={styles.brandTitle}>{title}</p>
      </div>

      <nav aria-label="Homepage navigation" className={styles.nav}>
        <div className={styles.linkStack}>
          {links.map((link) => (
            <Link
              className={`${styles.navLink} ${
                pathname === link.href ? styles.navLinkActive : ""
              }`}
              href={link.href}
              key={link.label}
            >
              <span className={styles.navBullet} aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>

        <div className={styles.groupStack}>
          {groups.map((group) => {
            const hasActiveItem = group.items.some((item) => item.href === pathname);
            const isOpen = openGroups[group.label] || hasActiveItem;
            const groupId = `group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

            return (
              <div className={styles.group} key={group.label}>
                <button
                  aria-controls={groupId}
                  aria-expanded={isOpen}
                  className={styles.groupButton}
                  onClick={() => toggleGroup(group.label)}
                  type="button"
                >
                  <span className={styles.groupLabel}>{group.label}</span>
                  <span
                    aria-hidden="true"
                    className={`${styles.groupChevron} ${
                      isOpen ? styles.groupChevronOpen : ""
                    }`}
                  >
                    v
                  </span>
                </button>

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
                        key={item.label}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
