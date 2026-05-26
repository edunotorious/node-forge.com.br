import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/lib/server-api";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <TopBar user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
