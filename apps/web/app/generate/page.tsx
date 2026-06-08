import { ProfileGenerateForm } from "../../components/ProfileGenerateForm";
import { AppNav } from "../../components/AppNav";

export default function GeneratePage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const initialQueryPromise = searchParams ?? Promise.resolve({});

  return <GeneratePageBody initialQueryPromise={initialQueryPromise} />;
}

async function GeneratePageBody({
  initialQueryPromise
}: {
  initialQueryPromise: Promise<{ q?: string | string[] }>;
}) {
  const resolvedSearchParams = await initialQueryPromise;
  const initialQuery = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0] ?? ""
    : resolvedSearchParams.q ?? "";

  return (
    <main className="page-shell generate-shell">
      <AppNav />
      <div className="page-heading">
        <p className="eyebrow">Generate</p>
        <h1>Generate profile</h1>
        <p>Use a public source to create evidence-backed cards.</p>
      </div>
      <ProfileGenerateForm initialQuery={initialQuery} />
    </main>
  );
}
