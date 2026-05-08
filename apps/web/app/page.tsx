import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">OpenDinq</p>
        <h1>Generate profiles, cards, and evidence-backed search</h1>
        <p>
          Turn public sources and manual notes into AI-native profile cards,
          public profiles, and discoverable evidence.
        </p>
        <div className="actions">
          <Link href="/generate">Generate</Link>
          <Link href="/discover">Discover</Link>
          <Link href="/import">Legacy GitHub import</Link>
        </div>
      </section>
    </main>
  );
}
