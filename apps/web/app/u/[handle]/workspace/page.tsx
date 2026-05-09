import { ProfileWorkspace } from "../../../../components/ProfileWorkspace";

export default async function ProfileWorkspacePage({
  params
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  return (
    <main className="page-shell">
      <ProfileWorkspace handle={handle} />
    </main>
  );
}
