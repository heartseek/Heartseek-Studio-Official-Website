import styles from "../../components/ContentPage.module.css";

export default function ExplorePage() {
  return (
    <div className={styles.pageStack}>
      <section className={styles.heroPanel}>
        <p className={styles.eyebrow}>Explore</p>
        <h1 className={styles.heroLead}>
          A parent page that gathers the studio&apos;s deeper sections into one
          expandable destination.
        </h1>
        <p className={styles.heroCopy}>
          Clicking this sidebar item now opens the group and lands on a real
          route, so the parent entry behaves like a page of its own instead of
          only acting as a toggle.
        </p>
      </section>

      <section className={styles.sectionCard}>
        <p className={styles.sectionLabel}>Sections</p>
        <h2 className={styles.sectionTitle}>
          Story and contact can now stay grouped without awkward nested URLs
        </h2>
        <p className={styles.sectionCopy}>
          From here we can later turn Explore into a richer overview page for
          selected work, studio notes, contact pathways, or other grouped
          destinations while keeping related links expanded together in the
          sidebar.
        </p>
      </section>
    </div>
  );
}
