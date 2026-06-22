"use client";

import styles from "./ContentTransition.module.css";

type ContentTransitionProps = {
  children: React.ReactNode;
};

export default function ContentTransition({
  children,
}: ContentTransitionProps) {
  return <div className={styles.transitionFrame}>{children}</div>;
}
