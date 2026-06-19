import { AppLayout } from "../components/app-layout";
import { api } from "../lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";

/** Safely parse any timestamp form — ISO string, Date, or unix seconds integer */
function formatDate(value: unknown): string {
  if (!value) return "—";
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    d = new Date(value);
  } else if (typeof value === "number") {
    // unix seconds (< year 3000 in ms would be ~32503680000)
    d = value > 1e10 ? new Date(value) : new Date(value * 1000);
  } else {
    return "—";
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" });
}

type Message = { role: string; content: string };

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#C9A227">$1</strong>')
    .replace(/---/g, '<hr style="border-color:#2A2D4A;margin:8px 0"/>')
    .replace(/\n/g, '<br/>');
}

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"consultations" | "documents">("consultations");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: consultations, isLoading: cLoading } = useQuery({
    queryKey: ["consultations"],
    queryFn: async () => {
      const res = await api.consultations.$get();
      return res.json();
    },
  });

  const { data: documents, isLoading: dLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await api.documents.$get();
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.consultations[":id"].$delete({ param: { id } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["consultations"] }),
  });

  const catLabels: Record<string, string> = {
    civil: "Fuqarolik", labor: "Mehnat", family: "Oila",
    corporate: "Korporativ", tax: "Soliq", general: "Umumiy",
  };
  const catColors: Record<string, string> = {
    civil: "#C9A227", labor: "#2196F3", family: "#E91E63",
    corporate: "#4CAF50", tax: "#FF5722", general: "#9C27B0",
  };
  const docLabels: Record<string, string> = {
    shartnoma: "Shartnoma", ishonchnoma: "Ishonchnoma",
    davo_ariza: "Da'vo Ariza", ariza: "Ariza",
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Tarix</h1>
          <p className="mt-1" style={{ color: '#9B97A8' }}>Barcha maslahat va hujjatlaringiz</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: '#1A1D33', width: 'fit-content' }}>
          {[
            { id: "consultations", label: "Maslahatlar", count: consultations?.length ?? 0 },
            { id: "documents", label: "Hujjatlar", count: documents?.length ?? 0 },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
              style={{
                background: activeTab === tab.id ? 'rgba(201,162,39,0.15)' : 'transparent',
                color: activeTab === tab.id ? '#C9A227' : '#9B97A8',
              }}>
              {tab.label}
              <span className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: '#2A2D4A', color: '#9B97A8' }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Consultations */}
        {activeTab === "consultations" && (
          <div className="space-y-3">
            {cLoading && <div style={{ color: '#9B97A8' }} className="text-center py-8">Yuklanmoqda...</div>}
            {consultations?.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">⚖️</div>
                <p style={{ color: '#9B97A8' }}>Hali maslahat olinmagan</p>
              </div>
            )}
            {consultations?.map((c: any) => {
              const msgs: Message[] = JSON.parse(c.messages || "[]");
              const isOpen = expanded === c.id;
              const catColor = catColors[c.category] ?? '#C9A227';
              return (
                <div key={c.id} className="rounded-xl overflow-hidden" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
                  <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : c.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                      <div>
                        <div className="font-medium text-sm" style={{ color: '#F0EDE4' }}>{c.title}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#9B97A8' }}>
                          {formatDate(c.createdAt)} ·{" "}
                          <span style={{ color: catColor }}>{catLabels[c.category]}</span> ·{" "}
                          {msgs.length} xabar
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); navigate(`/chat/${c.id}`); }}
                        className="text-xs px-3 py-1 rounded transition-colors font-medium"
                        style={{ color: '#C9A227', background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.2)' }}>
                        Ochish
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(c.id); }}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: '#E74C3C', background: 'rgba(231,76,60,0.1)' }}>
                        🗑️
                      </button>
                      <span style={{ color: '#9B97A8' }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isOpen && msgs.length > 0 && (
                    <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid #2A2D4A' }}>
                      <div className="pt-4 space-y-3 max-h-64 overflow-y-auto">
                        {msgs.map((m, i) => (
                          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className="max-w-lg px-3 py-2 rounded-xl text-xs"
                              style={m.role === "user" ? {
                                background: 'rgba(201,162,39,0.12)',
                                border: '1px solid rgba(201,162,39,0.2)',
                                color: '#F0EDE4',
                              } : {
                                background: '#131629',
                                borderLeft: '2px solid #C9A227',
                                color: '#F0EDE4',
                              }}>
                              {m.role === "assistant" ? (
                                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content.substring(0, 300) + (m.content.length > 300 ? "..." : "")) }} />
                              ) : m.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Documents */}
        {activeTab === "documents" && (
          <div className="space-y-3">
            {dLoading && <div style={{ color: '#9B97A8' }} className="text-center py-8">Yuklanmoqda...</div>}
            {documents?.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📝</div>
                <p style={{ color: '#9B97A8' }}>Hali hujjat yaratilmagan</p>
              </div>
            )}
            {documents?.map((d: any) => {
              const isOpen = expanded === d.id;
              return (
                <div key={d.id} className="rounded-xl overflow-hidden" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
                  <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : d.id)}>
                    <div>
                      <div className="font-medium text-sm" style={{ color: '#F0EDE4' }}>{d.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#9B97A8' }}>
                        {formatDate(d.createdAt)} ·{" "}
                        <span style={{ color: '#C9A227' }}>{docLabels[d.type] ?? d.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => {
                        e.stopPropagation();
                        const blob = new Blob([d.content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `${d.type}.txt`; a.click();
                        URL.revokeObjectURL(url);
                      }}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(201,162,39,0.1)', color: '#C9A227', border: '1px solid rgba(201,162,39,0.2)' }}>
                        ⬇️
                      </button>
                      <span style={{ color: '#9B97A8' }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <pre className="px-5 pb-5 pt-3 text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                      style={{ borderTop: '1px solid #2A2D4A', color: '#9B97A8', fontFamily: 'Inter, monospace' }}>
                      {d.content}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
