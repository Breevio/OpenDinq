import { DiscoverSearch } from "../../components/DiscoverSearch";

export default function DiscoverPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Discover</p>
        <h1>Search people by public work evidence</h1>
        <p>Results are ranked by skills, artifact text, impact, recency, and profile completeness.</p>
      </div>
      <DiscoverSearch />
    </main>
  );
}
