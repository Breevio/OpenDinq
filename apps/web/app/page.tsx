import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">OpenDINQ MVP</p>
        <h1>Evidence-backed profiles and people search</h1>
        <p>
          Import public work, generate profile cards, and search people with
          explanations tied to source artifacts.
        </p>
        <div className="actions">
          <Link href="/import">Import</Link>
          <Link href="/discover">Discover</Link>
        </div>
      </section>
    </main>
  );
}
