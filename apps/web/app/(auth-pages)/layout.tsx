export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div className="w-full max-w-sm bg-card border border-border shadow-lg rounded-xl p-8">
        {children}
      </div>
    </div>
  );
}
