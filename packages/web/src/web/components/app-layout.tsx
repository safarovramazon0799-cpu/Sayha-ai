import { useState } from "react";
import { Sidebar } from "./sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0D0F1A' }}>

      {/* ── Desktop sidebar (always visible on md+) ── */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile drawer backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <div
        className="fixed inset-y-0 left-0 z-50 md:hidden flex flex-col transition-transform duration-300"
        style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
          style={{ background: '#131629', borderColor: '#2A2D4A' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ background: '#1A1D33', color: '#C9A227' }}
            aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="4" width="16" height="2" rx="1"/>
              <rect x="2" y="9" width="16" height="2" rx="1"/>
              <rect x="2" y="14" width="16" height="2" rx="1"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
              S
            </div>
            <span className="font-bold text-base" style={{ color: '#F0EDE4' }}>Sayha AI</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>
    </div>
  );
}
