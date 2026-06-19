import { useState } from "react";
import { Link } from "wouter";
import { authClient } from "../lib/auth";
import { AppLayout } from "../components/app-layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const quickActions = [
  { href: "/chat",    icon: "⚖️", title: "Yangi Maslahat",    desc: "Huquqiy savolingizni bering",  color: "#C9A227" },
  { href: "/review",  icon: "📋", title: "Shartnoma Tahlili", desc: "Shartnoma risklarini aniqlang", color: "#2196F3" },
  { href: "/draft",   icon: "📝", title: "Hujjat Yarating",   desc: "Rasmiy hujjat tayyorlang",      color: "#4CAF50" },
  { href: "/history", icon: "📂", title: "Tarix",             desc: "Oldingi murojaatlar",           color: "#9C27B0" },
];

// Fallback used until /api/tariffs loads
const TARIFF_PLANS_DEFAULT = [
  { key: "basic",    name: "Basic",    price: "29 000 so'm/oy",   features: ["50 ta tahlil",       "Shartnoma tahlili", "Hujjat yaratish"], color: "#2196F3" },
  { key: "standard", name: "Standard", price: "59 000 so'm/oy",   features: ["150 ta tahlil",      "Barcha asosiy imkoniyatlar", "Ustunlik qo'llab-quvvatlash"], color: "#C9A227" },
  { key: "premium",  name: "Premium",  price: "99 000 so'm/oy",   features: ["Cheksiz tahlil",     "Barcha imkoniyatlar", "VIP qo'llab-quvvatlash"], color: "#9C27B0" },
];
const CARD_NUMBER_DEFAULT = "5614681284815291";
const CARD_OWNER_DEFAULT  = "Safarov Ramazon";

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const [promoOpen,    setPromoOpen]    = useState(false);
  const [tariffOpen,   setTariffOpen]   = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [copied,       setCopied]       = useState(false);
  const [cardCopied,   setCardCopied]   = useState(false);
  const [refInput,     setRefInput]     = useState("");
  const [refMsg,       setRefMsg]       = useState<string | null>(null);

  const { data: consultationsData } = useQuery({
    queryKey: ["consultations"],
    queryFn: async () => { const res = await api.consultations.$get(); return res.json(); },
  });
  const { data: docsData } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => { const res = await api.documents.$get(); return res.json(); },
  });
  const { data: tariffsConfig } = useQuery({
    queryKey: ["tariffs-config"],
    queryFn: async () => {
      const res = await fetch("/api/tariffs");
      if (!res.ok) return null;
      return res.json() as Promise<{
        card_number: string;
        card_owner: string;
        web_plans: { key: string; name: string; price: string; features: string[]; color: string }[];
      }>;
    },
    staleTime: 60_000,
  });

  const TARIFF_PLANS = tariffsConfig?.web_plans ?? TARIFF_PLANS_DEFAULT;
  const CARD_NUMBER  = tariffsConfig?.card_number ?? CARD_NUMBER_DEFAULT;
  const CARD_OWNER   = tariffsConfig?.card_owner  ?? CARD_OWNER_DEFAULT;

  const { data: promoData, refetch: refetchPromo } = useQuery({
    queryKey: ["promo-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("sayha_bearer_token") ?? "";
      const res = await fetch("/api/promo/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json() as Promise<{
        promoCode: string | null;
        invitedCount: number;
        analysisLimit: number;
        limitEarned: number;
        tariffName: string | null;
        tariffExpiresAt: number | null;
      }>;
    },
    retry: 2,
    staleTime: 30_000,
  });

  const hasPremium = !!(
    promoData?.tariffName &&
    promoData?.tariffExpiresAt &&
    promoData.tariffExpiresAt > Math.floor(Date.now() / 1000)
  );

  const handleCopy = () => {
    if (promoData?.promoCode) {
      navigator.clipboard.writeText(promoData.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCard = () => {
    navigator.clipboard.writeText(CARD_NUMBER);
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 2500);
  };

  const handleApplyRef = async () => {
    if (!refInput.trim()) return;
    setRefMsg(null);
    const token = localStorage.getItem("sayha_bearer_token") ?? "";
    const res = await fetch("/api/promo/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ code: refInput.trim().toUpperCase() }),
    });
    const data = await res.json();
    if (res.ok) {
      setRefMsg("✅ Taklif kodi qabul qilindi! +5 tahlil limiti berildi.");
      setRefInput("");
      refetchPromo();
    } else {
      setRefMsg("❌ " + (data.error ?? "Xatolik yuz berdi."));
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold" style={{ color: "#F0EDE4" }}>
              Assalomu alaykum, {session?.user?.name?.split(" ")[0]}
            </h1>
            <p className="mt-1" style={{ color: "#9B97A8" }}>
              Sayha AI — O'zbekiston Huquqiy Maslahatchi
            </p>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Tarif upgrade button */}
            {!hasPremium && (
              <button
                onClick={() => setTariffOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#C9A22722", border: "1px solid #C9A22755", color: "#C9A227" }}
              >
                ⬆️ <span className="hidden sm:inline">Tarif</span>
              </button>
            )}
            {hasPremium && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "#4CAF5022", border: "1px solid #4CAF5055", color: "#4CAF50" }}
              >
                ✅ <span className="hidden sm:inline">{promoData?.tariffName}</span>
              </div>
            )}
            {/* Promo badge */}
            <button
              onClick={() => setPromoOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "#C9A22722", border: "1px solid #C9A22755", color: "#C9A227" }}
            >
              🎟️ <span className="hidden sm:inline">Promokod</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
          {[
            { label: "Maslahatlar",   value: consultationsData?.length ?? 0, icon: "⚖️" },
            { label: "Hujjatlar",     value: docsData?.length ?? 0,          icon: "📝" },
            { label: "Tahlil limiti", value: promoData?.analysisLimit ?? 5,  icon: "📊" },
          ].map((stat, i) => (
            <div key={i} className="p-4 md:p-5 rounded-xl" style={{ background: "#1A1D33", border: "1px solid #2A2D4A" }}>
              <div className="text-xl md:text-2xl mb-2">{stat.icon}</div>
              <div className="font-display text-2xl md:text-3xl font-bold" style={{ color: "#C9A227" }}>{stat.value}</div>
              <div className="text-xs md:text-sm mt-1" style={{ color: "#9B97A8" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#9B97A8" }}>
            Tezkor Amallar
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {quickActions.map((action, i) => (
              <Link key={i} href={action.href}>
                <a className="block p-4 md:p-5 rounded-xl transition-all cursor-pointer"
                  style={{ background: "#1A1D33", border: "1px solid #2A2D4A" }}>
                  <div className="text-xl md:text-2xl mb-2 md:mb-3">{action.icon}</div>
                  <div className="font-semibold text-sm md:text-base mb-1" style={{ color: "#F0EDE4" }}>{action.title}</div>
                  <div className="text-xs md:text-sm" style={{ color: "#9B97A8" }}>{action.desc}</div>
                  <div className="mt-2 md:mt-3 text-xs font-medium" style={{ color: action.color }}>Ochish →</div>
                </a>
              </Link>
            ))}
          </div>
        </div>

        {/* Legal disclaimer */}
        <div className="p-4 rounded-xl text-sm italic"
          style={{ background: "#1A1D33", border: "1px solid #2A2D4A", color: "#9B97A8" }}>
          <strong style={{ color: "#C9A227" }}>⚠️ Yuridik Ogohlantirish:</strong>{" "}
          <em>Ushbu AI platformasi tomonidan taqdim etilgan ma'lumotlar va maslahatlar faqat tanishish va
          yo'nalish olish xarakteriga ega bo'lib, rasmiy advokat-mijoz munosabatlarini o'rnini bosmaydi.</em>
        </div>
      </div>

      {/* ── Tarif Modal ──────────────────────────────────────────────────────── */}
      {tariffOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setTariffOpen(false); setSelectedPlan(null); } }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 relative overflow-y-auto"
            style={{ background: "#13152A", border: "1px solid #2A2D4A", maxHeight: "90vh" }}
          >
            <button
              onClick={() => { setTariffOpen(false); setSelectedPlan(null); }}
              className="absolute top-4 right-4 text-xl opacity-50 hover:opacity-100"
              style={{ color: "#F0EDE4" }}
            >
              ✕
            </button>

            {!selectedPlan ? (
              <>
                <h2 className="font-display text-xl font-bold mb-1" style={{ color: "#F0EDE4" }}>
                  ⬆️ Tarif Tanlash
                </h2>
                <p className="text-sm mb-6" style={{ color: "#9B97A8" }}>
                  O'zingizga mos tarifni tanlang va huquqiy maslahatdan to'liq foydalaning.
                </p>

                <div className="space-y-3">
                  {TARIFF_PLANS.map((plan) => (
                    <button
                      key={plan.key}
                      onClick={() => setSelectedPlan(plan.key)}
                      className="w-full p-4 rounded-xl text-left transition-all"
                      style={{ background: "#1A1D33", border: `1px solid ${plan.color}44` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-base" style={{ color: plan.color }}>{plan.name}</span>
                        <span className="text-sm font-semibold" style={{ color: "#F0EDE4" }}>{plan.price}</span>
                      </div>
                      <ul className="space-y-1">
                        {plan.features.map((f, i) => (
                          <li key={i} className="text-xs flex items-center gap-2" style={{ color: "#9B97A8" }}>
                            <span style={{ color: plan.color }}>✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 text-xs font-semibold" style={{ color: plan.color }}>
                        Tanlash →
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Payment step */}
                {(() => {
                  const plan = TARIFF_PLANS.find(p => p.key === selectedPlan)!;
                  return (
                    <>
                      <button
                        onClick={() => setSelectedPlan(null)}
                        className="flex items-center gap-1 text-sm mb-4 opacity-60 hover:opacity-100"
                        style={{ color: "#F0EDE4" }}
                      >
                        ← Orqaga
                      </button>
                      <h2 className="font-display text-xl font-bold mb-1" style={{ color: "#F0EDE4" }}>
                        💳 To'lov Ma'lumotlari
                      </h2>
                      <p className="text-sm mb-5" style={{ color: "#9B97A8" }}>
                        <span style={{ color: plan.color }}>{plan.name}</span> tarifi uchun{" "}
                        <span style={{ color: "#F0EDE4" }}>{plan.price}</span> ni quyidagi kartaga o'tkazing.
                      </p>

                      {/* Card display */}
                      <div
                        className="rounded-2xl p-5 mb-5 relative"
                        style={{
                          background: "linear-gradient(135deg, #1A1D33, #2A2D4A)",
                          border: "1px solid #C9A22744",
                        }}
                      >
                        <div className="text-xs mb-3 font-semibold tracking-widest uppercase" style={{ color: "#9B97A8" }}>
                          Plastik Karta
                        </div>
                        <div className="font-mono text-xl font-bold tracking-widest mb-4" style={{ color: "#F0EDE4" }}>
                          {CARD_NUMBER.replace(/(.{4})/g, "$1 ").trim()}
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs" style={{ color: "#9B97A8" }}>Egasi</div>
                            <div className="font-semibold text-sm" style={{ color: "#F0EDE4" }}>{CARD_OWNER}</div>
                          </div>
                          <button
                            onClick={handleCopyCard}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: cardCopied ? "#4CAF5033" : "#C9A22722",
                              border: `1px solid ${cardCopied ? "#4CAF50" : "#C9A227"}`,
                              color: cardCopied ? "#4CAF50" : "#C9A227",
                            }}
                          >
                            {cardCopied ? "✓ Nusxalandi" : "Nusxa olish"}
                          </button>
                        </div>
                      </div>

                      {/* Instructions */}
                      <div
                        className="rounded-xl p-4 text-sm space-y-2"
                        style={{ background: "#1A1D33", border: "1px solid #2A2D4A" }}
                      >
                        <p style={{ color: "#9B97A8" }}>
                          <strong style={{ color: "#C9A227" }}>1.</strong> Yuqoridagi kartaga to'lovni o'tkazing.
                        </p>
                        <p style={{ color: "#9B97A8" }}>
                          <strong style={{ color: "#C9A227" }}>2.</strong> To'lov chekini saqlang.
                        </p>
                        <p style={{ color: "#9B97A8" }}>
                          <strong style={{ color: "#C9A227" }}>3.</strong> Telegram botimizga{" "}
                          <a href="https://t.me/sayha_ai_auth_bot" target="_blank" rel="noreferrer"
                            className="underline" style={{ color: "#C9A227" }}>
                            @sayha_ai_auth_bot
                          </a>{" "}
                          orqali to'lov cheki va{" "}
                          <strong style={{ color: "#F0EDE4" }}>6 xonali ID raqamingizni</strong> yuboring.
                        </p>
                        <p style={{ color: "#9B97A8" }}>
                          <strong style={{ color: "#C9A227" }}>4.</strong> Admin tasdiqlashidan so'ng tarif avtomatik faollashadi.
                        </p>
                      </div>

                      <a
                        href="https://t.me/sayha_ai_auth_bot"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                        style={{ background: "#C9A227", color: "#0D0F1A" }}
                      >
                        📱 Telegram Botga O'tish
                      </a>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Promo Modal ─────────────────────────────────────────────────────── */}
      {promoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPromoOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-7 relative"
            style={{ background: "#13152A", border: "1px solid #2A2D4A" }}
          >
            <button
              onClick={() => setPromoOpen(false)}
              className="absolute top-4 right-4 text-xl opacity-50 hover:opacity-100"
              style={{ color: "#F0EDE4" }}
            >
              ✕
            </button>

            <h2 className="font-display text-xl font-bold mb-1" style={{ color: "#F0EDE4" }}>
              🎟️ Sizning promokodingiz
            </h2>
            <p className="text-sm mb-5" style={{ color: "#9B97A8" }}>
              Promokodingizni tarqating — kimdir ishlatsa sizga{" "}
              <span style={{ color: "#C9A227" }}>+5 tahlil limiti</span> taqdim etiladi!
            </p>

            {/* Code display */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl mb-4"
              style={{ background: "#1A1D33", border: "1px solid #C9A22755" }}
            >
              <span className="font-mono text-xl font-bold tracking-widest" style={{ color: "#C9A227" }}>
                {promoData?.promoCode ?? "Yuklanmoqda…"}
              </span>
              <button
                onClick={handleCopy}
                className="ml-4 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: copied ? "#4CAF5033" : "#C9A22722",
                  border: `1px solid ${copied ? "#4CAF50" : "#C9A227"}`,
                  color: copied ? "#4CAF50" : "#C9A227",
                }}
              >
                {copied ? "✓ Nusxalandi" : "Nusxalash"}
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-xl text-center" style={{ background: "#1A1D33", border: "1px solid #2A2D4A" }}>
                <div className="font-bold text-2xl" style={{ color: "#C9A227" }}>
                  {promoData?.invitedCount ?? 0}
                </div>
                <div className="text-xs mt-1" style={{ color: "#9B97A8" }}>Ishlatildi</div>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background: "#1A1D33", border: "1px solid #2A2D4A" }}>
                <div className="font-bold text-2xl" style={{ color: "#4CAF50" }}>
                  +{promoData?.limitEarned ?? 0}
                </div>
                <div className="text-xs mt-1" style={{ color: "#9B97A8" }}>Limit ishlab olindi</div>
              </div>
            </div>

            {/* Apply someone else's referral */}
            <div style={{ borderTop: "1px solid #2A2D4A", paddingTop: "1.25rem" }}>
              <p className="text-sm mb-2 font-medium" style={{ color: "#9B97A8" }}>
                Do'stingizning kodini kiritish:
              </p>
              <div className="flex gap-2">
                <input
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  className="flex-1 px-3 py-2 rounded-lg font-mono text-sm outline-none"
                  style={{ background: "#1A1D33", border: "1px solid #2A2D4A", color: "#F0EDE4" }}
                />
                <button
                  onClick={handleApplyRef}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "#C9A227", color: "#13152A" }}
                >
                  Faollashtirish
                </button>
              </div>
              {refMsg && (
                <p className="mt-2 text-sm" style={{ color: refMsg.startsWith("✅") ? "#4CAF50" : "#ef4444" }}>
                  {refMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
