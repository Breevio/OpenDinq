import Link from "next/link";

export function AppNav() {
  return (
    <header className="app-nav">
      <Link className="app-brand" href="/">
        <img src="/opendinq-logo-web.png" alt="OpenDinq" />
      </Link>
      <nav className="app-nav-links" aria-label="Primary">
        <Link href="/generate">Generate</Link>
        <Link href="/import">Import</Link>
        <Link href="/discover">Discover</Link>
      </nav>
    </header>
  );
}
