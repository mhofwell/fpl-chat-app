export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen w-full">
            <div className="m-auto w-full max-w-md p-8">{children}</div>
        </div>
    );
}
