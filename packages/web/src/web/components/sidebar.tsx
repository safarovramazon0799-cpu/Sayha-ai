import { Link, useLocation } from "wouter";
import { authClient, clearToken } from "../lib/auth";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Bosh sahifa",       icon: "🏛️" },
  { href: "/chat",      label: "Huquqiy Maslahat",  icon: "⚖️" },
  { href: "/review",   label: "Shartnoma Tahlili",  icon: "📋" },
  { href: "/draft",    label: "Hujjat Yaratish",    icon: "📝" },
  { href: "/history",  label: "Tarix",              icon: "📂" },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { data: session } = authClient.useSession();
  const [, navigate] = useLocation();
  const isAdmin = (session?.user as any)?.role === "admin";

  const handleSignOut = async () => {
    await authClient.signOut();
    clearToken();
    navigate("/sign-in");
  };

  const handleNav = () => { onClose?.(); };

  return (
    <aside className="w-64 flex flex-col h-full border-r" style={{ background: '#131629', borderColor: '#2A2D4A' }}>
      {/* Logo */}
      <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: '#2A2D4A' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
            S
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-tight" style={{ color: '#F0EDE4' }}>Sayha AI</div>
            <div className="text-xs" style={{ color: '#9B97A8' }}>Huquqiy Intellekt</div>
          </div>
        </div>
        {/* Close button on mobile */}
        {onClose && (
          <button onClick={onClose} className="md:hidden text-xl opacity-50 hover:opacity-100" style={{ color: '#F0EDE4' }}>
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <a onClick={handleNav}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer"
                style={{
                  background: active ? 'rgba(201,162,39,0.12)' : 'transparent',
                  color: active ? '#C9A227' : '#9B97A8',
                  borderLeft: active ? '2px solid #C9A227' : '2px solid transparent',
                }}>
                <span>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </a>
            </Link>
          );
        })}

        {/* Admin link — only for admin role */}
        {isAdmin && (
          <Link href="/admin">
            <a onClick={handleNav}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer"
              style={{
                background: location === '/admin' ? 'rgba(201,162,39,0.12)' : 'transparent',
                color: location === '/admin' ? '#C9A227' : '#9B97A8',
                borderLeft: location === '/admin' ? '2px solid #C9A227' : '2px solid transparent',
              }}>
              <span>🛡️</span>
              <span className="font-medium">Admin Panel</span>
            </a>
          </Link>
        )}
      </nav>

      {/* User */}
      <div className="p-4 border-t" style={{ borderColor: '#2A2D4A' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: '#2A2D4A', color: '#C9A227' }}>
            {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: '#F0EDE4' }}>{session?.user?.name}</div>
            <div className="text-xs truncate" style={{ color: '#9B97A8' }}>{session?.user?.email}</div>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="w-full text-xs py-2 rounded-lg text-center transition-colors"
          style={{ background: '#2A2D4A', color: '#9B97A8' }}>
          Chiqish
        </button>
      </div>
    </aside>
  );
}
