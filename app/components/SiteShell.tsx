"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HomeSidebar, {
  type SidebarGroup,
  type SidebarLink,
} from "./HomeSidebar";
import styles from "./SiteShell.module.css";

const directLinks: SidebarLink[] = [
  { label: "Home", href: "/" },
  { label: "Overview", href: "/overview" },
];

const groupedLinks: SidebarGroup[] = [
  {
    label: "Explore",
    defaultOpen: true,
    items: [
      { label: "Story", href: "/story" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

type SiteShellProps = {
  children: React.ReactNode;
};

export default function SiteShell({ children }: SiteShellProps) {
  const [isSettled, setIsSettled] = useState(false);
  const pathname = usePathname();
  const mainPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const splashSeen = window.sessionStorage.getItem("heartseek-splash-seen");

    if (splashSeen === "true") {
      const settleImmediately = window.setTimeout(() => {
        setIsSettled(true);
      }, 0);

      return () => {
        window.clearTimeout(settleImmediately);
      };
    }

    let isMounted = true;
    let minDelayPassed = false;
    let pageLoaded = false;
    const cleanupTimers: number[] = [];

    const settleIfReady = () => {
      if (!isMounted || !minDelayPassed || !pageLoaded) {
        return;
      }

      const finishTimer = window.setTimeout(() => {
        if (!isMounted) {
          return;
        }

        window.sessionStorage.setItem("heartseek-splash-seen", "true");
        setIsSettled(true);
      }, 0);

      cleanupTimers.push(finishTimer);
    };

    const minDelayTimer = window.setTimeout(() => {
      minDelayPassed = true;
      settleIfReady();
    }, 1000);
    cleanupTimers.push(minDelayTimer);

    const markLoaded = () => {
      pageLoaded = true;
      settleIfReady();
    };

    if (document.readyState === "complete") {
      markLoaded();
    } else {
      window.addEventListener("load", markLoaded, { once: true });
    }

    return () => {
      isMounted = false;
      window.removeEventListener("load", markLoaded);
      cleanupTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    mainPaneRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [pathname]);

  return (
    <main className={styles.page}>
      <div className={`${styles.splash} ${isSettled ? styles.splashHidden : ""}`}>
        <h1 className={styles.splashTitle}>Heartseek Studio</h1>
      </div>

      <div
        className={`${styles.appShell} ${isSettled ? styles.appShellVisible : ""}`}
      >
        <HomeSidebar
          title="Heartseek Studio"
          links={directLinks}
          groups={groupedLinks}
        />
        <div className={styles.mainPane} ref={mainPaneRef}>
          {children}
        </div>
      </div>
    </main>
  );
}
