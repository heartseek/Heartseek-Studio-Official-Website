import styles from "../../components/ContentPage.module.css";

export default function OverviewPage() {
  return (
    <div className={styles.pageStack}>
      <section className={styles.heroPanel}>
        <p className={styles.eyebrow}>Overview</p>
        <h1 className={styles.heroLead}>
          One clean frame, with space for the rest of the official site to grow.
        </h1>
        <p className={styles.heroCopy}>
          This section is now its own route, which means we can keep the same
          visual shell while letting each content area load and transition like
          a standalone page.
        </p>
      </section>

      <section className={styles.sectionCard}>
        <p className={styles.sectionLabel}>Structure</p>
        <h2 className={styles.sectionTitle}>The foundation is now route-first</h2>
        <p className={styles.sectionCopy}>
          That gives you cleaner navigation state, shareable URLs, better future
          SEO, and a much easier path if you later want sections like Projects,
          Team, Journal, or Careers.
        </p>
      </section>
    </div>
  );
}
