import { ProfileGenerateForm } from "../../components/ProfileGenerateForm";

export default function GeneratePage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Generate</p>
        <h1>Generate a profile from public evidence</h1>
        <p>Add one or more sources, generate cards, then publish a searchable profile page.</p>
      </div>
      <ProfileGenerateForm />
    </main>
  );
}
