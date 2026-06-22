import styles from "../../components/ContentPage.module.css";

export default function ContactPage() {
  return (
    <div className={styles.pageStack}>
      <section className={styles.heroPanel}>
        <p className={styles.eyebrow}>Contact</p>
        <h1 className={styles.heroLead}>
          A dedicated destination for conversations, collaboration, and outreach.
        </h1>
        <p className={styles.heroCopy}>
          This route can grow into a proper contact page with channels, inquiry
          types, forms, and response expectations, while keeping the overall
          shell consistent.
        </p>
      </section>

      <section className={styles.sectionCard}>
        <p className={styles.sectionLabel}>Placeholder</p>
        <h2 className={styles.sectionTitle}>Ready for final contact details</h2>
        <p className={styles.sectionCopy}>
          When you are ready, we can add email, social destinations, partnership
          requests, investor outreach, or a styled form with validation here.
        </p>
      </section>
    </div>
  );
}
