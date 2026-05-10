import { ProfileGenerateForm } from "../../components/ProfileGenerateForm";

export default function GeneratePage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Generate</p>
        <h1>Generate a profile from public evidence</h1>
        <p>Describe a person, paste a URL, or provide a public source. OpenDinq will plan sources, collect evidence, generate claims, and create cards you can review.</p>
      </div>
      <ProfileGenerateForm />
    </main>
  );
}
