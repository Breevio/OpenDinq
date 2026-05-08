import { DiscoverSearch } from "../../components/DiscoverSearch";

export default function DiscoverPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Discover</p>
        <h1>Search people by public work evidence</h1>
        <p>Results combine rule-based and full-text signals, then keep explanations tied to evidence.</p>
      </div>
      <DiscoverSearch />
    </main>
  );
}
