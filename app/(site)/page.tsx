import styles from "../components/ContentPage.module.css";

export default function HomePage() {
  return (
    <div className={styles.pageStack}>
      <section className={styles.heroPanel}>
        <p className={styles.eyebrow}>Official Website</p>
        <h1 className={styles.heroLead}>
          A calm digital front door for launches, stories, and selected work.
        </h1>
        <p className={styles.heroCopy}>
          The homepage now opens into a fixed left rail and a dedicated content
          stage, so each section can behave like its own page instead of a long
          scrolling document.
        </p>
      </section>

      <section className={styles.sectionCard}>
        <p className={styles.sectionLabel}>Home</p>
        <h2 className={styles.sectionTitle}>Built to feel like a product shell</h2>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <h4>Fixed Sidebar</h4>
            <p>
              The navigation stays anchored on the left while the right side
              becomes the active page canvas.
            </p>
          </article>
          <article className={styles.featureCard}>
            <h4>Route-Based Views</h4>
            <p>
              Sidebar destinations now map to real Next.js routes, making the
              structure easier to expand later.
            </p>
          </article>
          <article className={styles.featureCard}>
            <h4>Animated Entry</h4>
            <p>
              Each destination can appear with its own motion language instead
              of relying on anchor scrolling.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
