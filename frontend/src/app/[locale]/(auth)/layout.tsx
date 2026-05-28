// Auth pages (login, register, forgot, reset) sit on a clean light canvas
// with no header — there's no navigation or session state to surface in
// the unauthenticated state. The wordmark inside each page carries the
// brand identity.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      {children}
    </div>
  );
}
