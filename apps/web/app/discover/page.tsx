import { DiscoverSearch } from "../../components/DiscoverSearch";
import { AppNav } from "../../components/AppNav";

export default function DiscoverPage() {
  return (
    <main className="page-shell">
      <AppNav />
      <div className="page-heading">
        <p className="eyebrow">Discover</p>
        <h1>Find profiles by evidence.</h1>
        <p>Search verified claims, source artifacts, cards, and skills already captured in OpenDinq.</p>
      </div>
      <DiscoverSearch />
    </main>
  );
}
