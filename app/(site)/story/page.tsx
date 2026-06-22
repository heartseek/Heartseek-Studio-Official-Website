import styles from "../../components/ContentPage.module.css";

export default function StoryPage() {
  return (
    <div className={styles.pageStack}>
      <section className={styles.heroPanel}>
        <p className={styles.eyebrow}>Story</p>
        <h1 className={styles.heroLead}>
          A page-shaped space for origin, direction, and studio identity.
        </h1>
        <p className={styles.heroCopy}>
          Instead of jumping down a long homepage, this route can now hold a
          dedicated narrative about Heartseek Studio and evolve independently.
        </p>
      </section>

      <section className={styles.sectionCard}>
        <p className={styles.sectionLabel}>Next</p>
        <h2 className={styles.sectionTitle}>Ready for real editorial content</h2>
        <p className={styles.sectionCopy}>
          We can replace this placeholder with founder notes, brand philosophy,
          milestones, visual storytelling, or a more cinematic landing section
          without touching the left navigation frame.
        </p>
      </section>
    </div>
  );
}
