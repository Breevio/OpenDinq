import { ImportGithubForm } from "../../components/ImportGithubForm";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Import</p>
        <h1>Generate an evidence-backed profile from GitHub</h1>
        <p>Public repositories become artifacts, deterministic cards, and searchable profile signals.</p>
      </div>
      <ImportGithubForm />
    </main>
  );
}
