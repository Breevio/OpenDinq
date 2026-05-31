import { ProfileWorkspace } from "../../../../components/ProfileWorkspace";
import { AppNav } from "../../../../components/AppNav";

export default async function ProfileWorkspacePage({
  params
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  return (
    <main className="page-shell">
      <AppNav />
      <ProfileWorkspace handle={handle} />
    </main>
  );
}
