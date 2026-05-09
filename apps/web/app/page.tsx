import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">OpenDinq</p>
        <h1>Evidence-backed AI-native profiles and people discovery.</h1>
        <p>
          Generate a profile from public sources, turn evidence into cards,
          and make people discoverable through claims, artifacts, and search.
        </p>
        <div className="actions">
          <Link href="/generate">Generate Profile</Link>
          <Link href="/discover">Explore Discover</Link>
          <Link href="/u/demo-agent-builder">View Demo Profile</Link>
        </div>
      </section>
      <section className="product-steps">
        {[
          ["Generate from sources", "Start from GitHub, websites, papers, ORCID, or manual notes."],
          ["Review evidence-backed claims", "Inspect claims before they shape cards and search results."],
          ["Curate cards", "Edit, reorder, hide, or regenerate profile cards."],
          ["Publish profile", "Switch from draft to published and preview the shareable page."],
          ["Discover people", "Search by skills, artifacts, claims, cards, and evidence."]
        ].map(([title, body]) => (
          <article className="profile-card" key={title}>
            <p className="eyebrow">{title}</p>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
