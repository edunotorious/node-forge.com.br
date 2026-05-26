// Auth pages (login, register) share the same canvas: a thin navy strip up top
// (mirrors the global TopBar's silhouette) and a centered content well below.
// The strip is decorative only — no nav content in the unauthenticated state.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-nav h-12 shrink-0" />
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
        {children}
      </div>
    </div>
  );
}
