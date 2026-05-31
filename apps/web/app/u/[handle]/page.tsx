import { ProfileView } from "../../../components/ProfileView";
import { AppNav } from "../../../components/AppNav";

export default async function ProfilePage({
  params
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  return (
    <main className="page-shell">
      <AppNav />
      <ProfileView handle={handle} />
    </main>
  );
}
