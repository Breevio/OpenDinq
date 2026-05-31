import { ImportGithubForm } from "../../components/ImportGithubForm";
import { AppNav } from "../../components/AppNav";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <AppNav />
      <div className="page-heading">
        <p className="eyebrow">Import</p>
        <h1>Bring in GitHub evidence.</h1>
        <p>Import public activity into a reviewable profile. If GitHub is limited, OpenDinq still opens a workspace.</p>
      </div>
      <ImportGithubForm />
    </main>
  );
}
