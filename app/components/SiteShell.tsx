"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import HomeSidebar from "./HomeSidebar";
import SiteHeader from "./SiteHeader";
import styles from "./SiteShell.module.css";

type SiteShellProps = {
  children: React.ReactNode;
};
type PrimarySection = "home" | "tools";

const SPLASH_MIN_DURATION_MS = 2000;
const SPLASH_FALLBACK_DURATION_MS = 3000;

export default function SiteShell({ children }: SiteShellProps) {
  const [isSettled, setIsSettled] = useState(false);
  const pathname = usePathname();
  const t = useTranslations();
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const currentTitle = t("brand.title");
  const activeSection: PrimarySection = pathname === "/tools" ? "tools" : "home";

  useEffect(() => {
    const readSplashSeen = () => {
      try {
        return window.sessionStorage.getItem("heartseek-splash-seen") === "true";
      } catch {
        return false;
      }
    };

    const markSplashSeen = () => {
      try {
        window.sessionStorage.setItem("heartseek-splash-seen", "true");
      } catch {
        // Ignore storage failures and continue into the app shell.
      }
    };

    if (readSplashSeen()) {
      const settleImmediately = window.setTimeout(() => {
        setIsSettled(true);
      }, 0);

      return () => {
        window.clearTimeout(settleImmediately);
      };
    }

    let isMounted = true;
    let minDelayPassed = false;
    let shellReady = false;

    const settleSplash = () => {
      if (!isMounted) {
        return;
      }

      markSplashSeen();
      setIsSettled(true);
    };

    const settleIfReady = () => {
      if (!minDelayPassed || !shellReady) {
        return;
      }

      settleSplash();
    };

    const minDelayTimer = window.setTimeout(() => {
      minDelayPassed = true;
      settleIfReady();
    }, SPLASH_MIN_DURATION_MS);

    const fallbackTimer = window.setTimeout(() => {
      settleSplash();
    }, SPLASH_FALLBACK_DURATION_MS);

    const readyFrame = window.requestAnimationFrame(() => {
      const fonts = "fonts" in document ? document.fonts : null;

      if (!fonts) {
        shellReady = true;
        settleIfReady();
        return;
      }

      void fonts.ready.finally(() => {
        shellReady = true;
        settleIfReady();
      });
    });

    return () => {
      isMounted = false;
      window.clearTimeout(minDelayTimer);
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(readyFrame);
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
        <div className={styles.splashStack}>
          <h1 className={styles.splashTitle}>{currentTitle}</h1>
          <div aria-hidden="true" className={styles.splashLoader}>
            <span className={styles.splashLoaderLine} />
          </div>
        </div>
      </div>

      <div className={`${styles.headerShell} ${isSettled ? styles.headerShellVisible : ""}`}>
        <SiteHeader />
      </div>

      <div
        className={`${styles.appShell} ${
          activeSection === "tools" ? styles.appShellExpanded : styles.appShellCompact
        } ${isSettled ? styles.appShellVisible : ""}`}
      >
        <HomeSidebar activeSection={activeSection} />
        <div className={styles.mainPane} ref={mainPaneRef}>
          {children}
        </div>
      </div>
    </main>
  );
}
