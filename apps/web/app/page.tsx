import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell home-shell">
      <header className="home-nav">
        <Link className="home-brand" href="/">
          <img src="/opendinq-logo-web.png" alt="OpenDinq" />
        </Link>
        <nav className="home-nav-links" aria-label="Primary">
          <Link href="/generate">Generate</Link>
          <Link href="/import">Import</Link>
          <Link href="/discover">Discover</Link>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="home-kicker">Public evidence search</p>
          <h1>Find people with proof.</h1>
          <p className="home-lead">
            Search a name, handle, paper, or GitHub URL. Verify the match before OpenDinq builds the profile.
          </p>

          <form action="/generate" className="home-search" role="search">
            <input
              aria-label="Search people and evidence"
              name="q"
              placeholder="Name, GitHub handle, paper, or public URL"
              type="search"
            />
            <button type="submit">Search</button>
          </form>

          <div className="home-quick-actions" aria-label="Secondary entry points">
            <Link href="/generate">Generate profile</Link>
            <Link href="/import">Import GitHub</Link>
          </div>
        </div>

        <div className="home-product-card" aria-hidden="true">
          <div className="home-product-card-top">
            <span>Candidate</span>
            <strong>verified match</strong>
          </div>
          <div className="home-match-row active">
            <span className="home-match-dot" />
            <div>
              <strong>Public source</strong>
              <small>GitHub, papers, web evidence</small>
            </div>
          </div>
          <div className="home-match-row">
            <span className="home-match-dot" />
            <div>
              <strong>Claims</strong>
              <small>Only shown with evidence</small>
            </div>
          </div>
          <div className="home-product-meter">
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}
