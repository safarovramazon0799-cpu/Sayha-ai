import { useState, useEffect, useRef } from "react";
import { AppLayout } from "../components/app-layout";
import { api } from "../lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";

type RiskItem = {
  level: "high" | "medium" | "low";
  type: string;
  description: string;
  article: string;
};

type AnalysisResult = {
  summary: string;
  risks: RiskItem[];
  riskLevel: string;
  recommendation: string;
};

const RISK_COLORS = {
  high:   { bg: 'rgba(231,76,60,0.1)',   border: 'rgba(231,76,60,0.4)',   text: '#E74C3C', label: 'YUQORI XAVF' },
  medium: { bg: 'rgba(243,156,18,0.1)',  border: 'rgba(243,156,18,0.4)',  text: '#F39C12', label: "O'RTA XAVF" },
  low:    { bg: 'rgba(46,204,113,0.1)',  border: 'rgba(46,204,113,0.4)',  text: '#2ECC71', label: 'PAST XAVF' },
};

/** Safely parse any timestamp form — ISO string, Date obj, unix-ms, or unix-sec */
function formatDate(value: unknown): string {
  if (!value) return "—";
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    d = new Date(value);
  } else if (typeof value === "number") {
    d = value > 1e10 ? new Date(value) : new Date(value * 1000);
  } else {
    return "—";
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" });
}

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ id?: string }>();
  const sessionId = params?.id ?? null;
  const [, navigate] = useLocation();

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const sessionLoaded = useRef<string | null>(null);

  // ── Load session from URL param ─────────────────────────────────
  const { data: sessionRow, isLoading: sessionLoading } = useQuery({
    queryKey: ["review-session", sessionId],
    queryFn: async () => {
      const res = await (api.contract.reviews as any)[":id"].$get({ param: { id: sessionId! } });
      return res.json();
    },
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (sessionId && sessionRow && sessionLoaded.current !== sessionId && !("error" in sessionRow)) {
      sessionLoaded.current = sessionId;
      setText(sessionRow.originalText ?? "");
      setFileName(sessionRow.fileName ?? "");
      try {
        const parsed: AnalysisResult = typeof sessionRow.analysisResult === "string"
          ? JSON.parse(sessionRow.analysisResult)
          : sessionRow.analysisResult;
        setAnalysis(parsed);
      } catch {
        setAnalysis(null);
      }
    }
  }, [sessionId, sessionRow]);

  // Reset loader ref when sessionId clears
  useEffect(() => {
    if (!sessionId) sessionLoaded.current = null;
  }, [sessionId]);

  // ── List of past reviews ────────────────────────────────────────
  const { data: reviews } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => {
      const res = await api.contract.reviews.$get();
      return res.json();
    },
  });

  // ── Run new analysis ────────────────────────────────────────────
  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.contract.review.$post({ json: { text, fileName: fileName || "shartnoma.txt" } });
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysis(data.analysis as AnalysisResult);
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const handleNewReview = () => {
    setText("");
    setFileName("");
    setAnalysis(null);
    sessionLoaded.current = null;
    window.history.pushState(null, "", "/review");
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Shartnoma Tahlili</h1>
            <p className="mt-1" style={{ color: '#9B97A8' }}>Shartnomangizni yuklang yoki matnini joylashtiring — AI yashirin xavflarni aniqlaydi</p>
          </div>
          {sessionId && (
            <button onClick={handleNewReview}
              className="text-xs px-4 py-2 rounded-lg font-medium transition-colors flex-shrink-0"
              style={{ background: '#2A2D4A', color: '#9B97A8' }}>
              + Yangi Tahlil
            </button>
          )}
        </div>

        {/* Session loading indicator */}
        {sessionId && sessionLoading && (
          <div className="flex items-center gap-3 p-4 rounded-xl mb-6" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: '#C9A227', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <span className="text-sm" style={{ color: '#9B97A8' }}>Tahlil yuklanmoqda...</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div className="space-y-4">
            <div className="p-6 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
              <h2 className="font-semibold mb-4" style={{ color: '#F0EDE4' }}>Shartnoma Matni</h2>

              <label className="flex flex-col items-center justify-center p-6 rounded-xl cursor-pointer transition-all mb-4"
                style={{ border: '2px dashed #2A2D4A', background: '#131629' }}
                onDragOver={e => e.preventDefault()}>
                <span className="text-2xl mb-2">📤</span>
                <span className="text-sm font-medium" style={{ color: '#C9A227' }}>Fayl yuklash</span>
                <span className="text-xs mt-1" style={{ color: '#9B97A8' }}>.txt, .doc, .pdf</span>
                {fileName && (
                  <span className="text-xs mt-2 px-3 py-1 rounded-full"
                    style={{ background: '#2A2D4A', color: '#C9A227' }}>{fileName}</span>
                )}
                <input type="file" accept=".txt,.doc,.pdf" onChange={handleFileUpload} className="hidden" />
              </label>

              <div className="text-center text-xs mb-3" style={{ color: '#9B97A8' }}>yoki</div>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Shartnoma matnini bu yerga joylashtiring..."
                rows={10}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: '#131629', border: '1px solid #2A2D4A', color: '#F0EDE4' }}
                onFocus={e => e.target.style.borderColor = '#C9A227'}
                onBlur={e => e.target.style.borderColor = '#2A2D4A'}
              />

              <button
                onClick={() => reviewMutation.mutate()}
                disabled={!text.trim() || reviewMutation.isPending}
                className="w-full mt-4 py-3 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: text.trim() && !reviewMutation.isPending
                    ? 'linear-gradient(135deg, #C9A227, #E8C547)' : '#2A2D4A',
                  color: text.trim() && !reviewMutation.isPending ? '#0D0F1A' : '#9B97A8',
                  cursor: text.trim() && !reviewMutation.isPending ? 'pointer' : 'not-allowed',
                }}>
                {reviewMutation.isPending ? "Tahlil qilinmoqda..." : "Tahlil Boshlash ⚖️"}
              </button>
            </div>
          </div>

          {/* Results panel */}
          <div>
            {analysis ? (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold" style={{ color: '#F0EDE4' }}>Tahlil Natijasi</h2>
                    <span className="text-xs px-3 py-1 rounded-full font-bold"
                      style={{
                        background: RISK_COLORS[analysis.riskLevel as keyof typeof RISK_COLORS]?.bg,
                        color: RISK_COLORS[analysis.riskLevel as keyof typeof RISK_COLORS]?.text,
                        border: `1px solid ${RISK_COLORS[analysis.riskLevel as keyof typeof RISK_COLORS]?.border}`,
                      }}>
                      {RISK_COLORS[analysis.riskLevel as keyof typeof RISK_COLORS]?.label}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: '#9B97A8' }}>{analysis.summary}</p>
                </div>

                <div className="space-y-3">
                  {analysis.risks.map((risk, i) => {
                    const colors = RISK_COLORS[risk.level];
                    return (
                      <div key={i} className="p-4 rounded-xl"
                        style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-sm" style={{ color: '#F0EDE4' }}>{risk.type}</div>
                          <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ color: colors.text }}>{colors.label}</span>
                        </div>
                        <p className="text-xs mb-2" style={{ color: '#9B97A8' }}>{risk.description}</p>
                        <div className="text-xs px-2 py-1 rounded inline-block"
                          style={{ background: 'rgba(201,162,39,0.1)', color: '#C9A227', border: '1px solid rgba(201,162,39,0.2)' }}>
                          📖 {risk.article}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-xl" style={{ background: '#1A1D33', border: '1px solid rgba(201,162,39,0.3)' }}>
                  <div className="font-semibold text-sm mb-2" style={{ color: '#C9A227' }}>⚖️ Tavsiya</div>
                  <p className="text-sm" style={{ color: '#9B97A8' }}>{analysis.recommendation}</p>
                </div>

                <p className="text-xs italic" style={{ color: '#2A2D4A' }}>
                  <em>Diqqat: Ushbu AI platformasi tomonidan taqdim etilgan ma'lumotlar va maslahatlar faqat tanishish va yo'nalish olish xarakteriga ega bo'lib, rasmiy advokat-mijoz munosabatlarini yoki professional huquqshunos maslahatini o'rnini bosmaydi.</em>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl"
                style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
                <div className="text-4xl mb-3">📋</div>
                <p className="text-sm text-center" style={{ color: '#9B97A8' }}>
                  Shartnoma matnini kiriting yoki fayl yuklang,<br />keyin tahlil natijasi bu yerda ko'rinadi.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Previous reviews */}
        {reviews && reviews.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold mb-4" style={{ color: '#9B97A8' }}>Avvalgi Tahlillar</h2>
            <div className="space-y-2">
              {(reviews as any[]).map((r: any) => {
                const colors = RISK_COLORS[r.riskLevel as keyof typeof RISK_COLORS];
                const isActive = sessionId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/review/${r.id}`)}
                    className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: isActive ? 'rgba(201,162,39,0.08)' : '#1A1D33',
                      border: isActive ? '1px solid rgba(201,162,39,0.35)' : '1px solid #2A2D4A',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#3A3D5A';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#2A2D4A';
                    }}
                  >
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2" style={{ color: '#F0EDE4' }}>
                        {r.fileName}
                        {isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227' }}>
                            Ochiq
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#9B97A8' }}>
                        {formatDate(r.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-3 py-1 rounded-full font-bold"
                        style={{ background: colors?.bg, color: colors?.text, border: `1px solid ${colors?.border}` }}>
                        {colors?.label}
                      </span>
                      <span className="text-xs" style={{ color: '#9B97A8' }}>›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
