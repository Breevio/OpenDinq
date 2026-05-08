import { ProfileView } from "../../../components/ProfileView";

export default async function ProfilePage({
  params
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  return (
    <main className="page-shell">
      <ProfileView handle={handle} />
    </main>
  );
}
