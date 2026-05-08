import { ImportGithubForm } from "../../components/ImportGithubForm";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Import</p>
        <h1>Legacy GitHub import</h1>
        <p>GitHub is one connector. Use Generate for multi-source profile generation.</p>
      </div>
      <ImportGithubForm />
    </main>
  );
}
