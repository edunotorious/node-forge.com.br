import { ProfilePage } from "@/components/profile/profile-page";
import { requireUser } from "@/lib/server-api";

export default async function Page() {
  const user = await requireUser();
  return <ProfilePage user={user} />;
}
