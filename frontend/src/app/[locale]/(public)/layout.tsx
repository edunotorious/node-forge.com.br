import { TopBar } from "@/components/top-bar";
import { getCurrentUser } from "@/lib/server-api";

// Public surfaces (Node Vault). The TopBar adapts to a null user
// internally — login/register pills replace the avatar + logout chip.
// No requireUser() here on purpose: the Vault is a vitrine and must
// render fully for visitors that have never signed in.
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-1 flex-col">
      <TopBar user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
