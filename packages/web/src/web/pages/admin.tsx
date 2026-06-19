import { AppLayout } from "../components/app-layout";
import { api } from "../lib/api";
import { useQuery } from "@tanstack/react-query";

export default function AdminPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await api.admin.stats.$get();
      return res.json();
    },
  });

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🛡️</span>
            <h1 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Admin Panel</h1>
          </div>
          <p style={{ color: '#9B97A8' }}>Platform ko'rsatkichlari va boshqaruv</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Jami Maslahatlar", value: stats?.totalConsultations ?? 0, icon: "⚖️", color: "#C9A227" },
            { label: "Jami Hujjatlar", value: stats?.totalDocuments ?? 0, icon: "📝", color: "#2196F3" },
            { label: "Shartnoma Tahlillari", value: stats?.totalReviews ?? 0, icon: "📋", color: "#4CAF50" },
          ].map((stat, i) => (
            <div key={i} className="p-6 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
              <div className="text-2xl mb-3">{stat.icon}</div>
              <div className="font-display text-4xl font-black mb-1" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-sm" style={{ color: '#9B97A8' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* System Info */}
        <div className="p-6 rounded-2xl mb-6" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
          <h2 className="font-semibold mb-4" style={{ color: '#F0EDE4' }}>Tizim Ma'lumoti</h2>
          <div className="space-y-3">
            {[
              { label: "AI Model", value: "Mock Mode (LLM kaliti kutilmoqda)", status: "warning" },
              { label: "Ma'lumotlar bazasi", value: "Turso SQLite — Faol", status: "ok" },
              { label: "Auth tizimi", value: "Better Auth — Faol", status: "ok" },
              { label: "Qonunchilik manbasi", value: "O'zbekiston Respublikasi lex.uz", status: "ok" },
              { label: "Til", value: "O'zbek tili (lotin)", status: "ok" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #2A2D4A' }}>
                <span className="text-sm" style={{ color: '#9B97A8' }}>{item.label}</span>
                <span className="text-sm font-medium px-3 py-1 rounded-full"
                  style={{
                    background: item.status === 'ok' ? 'rgba(46,204,113,0.1)' : 'rgba(243,156,18,0.1)',
                    color: item.status === 'ok' ? '#2ECC71' : '#F39C12',
                    border: `1px solid ${item.status === 'ok' ? 'rgba(46,204,113,0.3)' : 'rgba(243,156,18,0.3)'}`,
                  }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Legal AI Config */}
        <div className="p-6 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid rgba(201,162,39,0.3)' }}>
          <h2 className="font-semibold mb-4" style={{ color: '#C9A227' }}>⚖️ Huquqiy AI Konfiguratsiyasi</h2>
          <div className="space-y-2 text-sm" style={{ color: '#9B97A8' }}>
            <p>• <strong style={{ color: '#F0EDE4' }}>Jurisdiksiya:</strong> O'zbekiston Respublikasi</p>
            <p>• <strong style={{ color: '#F0EDE4' }}>Qamrab olingan kodlar:</strong> Fuqarolik, Mehnat, Oila, Soliq, Korporativ</p>
            <p>• <strong style={{ color: '#F0EDE4' }}>Javob tili:</strong> O'zbek tili (lotin alifbosi)</p>
            <p>• <strong style={{ color: '#F0EDE4' }}>Javob tuzilishi:</strong> 4 qismli (Muammo → Qonun → Tavsiya → Ogohlantirish)</p>
            <p>• <strong style={{ color: '#F0EDE4' }}>Rasmiy manbalar:</strong> lex.uz, qonun.uz</p>
          </div>
          <div className="mt-4 p-3 rounded-xl text-xs italic"
            style={{ background: '#131629', color: '#9B97A8' }}>
            <strong style={{ color: '#C9A227' }}>Real LLM ulash uchun:</strong> .env faylga AI_GATEWAY_API_KEY qo'shing va /api/legal/chat endpointini AI SDK bilan yangilang.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
