import { ProfileGenerateForm } from "../../components/ProfileGenerateForm";

export default function GeneratePage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">Generate</p>
        <h1>Search a person or generate a profile</h1>
        <p>Enter a name, describe a person, or paste a public source. OpenDinq searches for candidates, imports evidence, and creates cards you can review.</p>
      </div>
      <ProfileGenerateForm />
    </main>
  );
}
