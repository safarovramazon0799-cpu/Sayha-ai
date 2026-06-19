import { Redirect } from "wouter";
import { authClient } from "../lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D0F1A' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
          <p style={{ color: '#9B97A8', fontFamily: 'Inter, sans-serif' }}>Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (!session) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}
