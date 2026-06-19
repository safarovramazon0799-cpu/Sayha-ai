import { useState } from "react";
import { AppLayout } from "../components/app-layout";
import { api } from "../lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const DOC_TYPES = [
  { value: "shartnoma", label: "Xizmat Shartnomasi", icon: "📄", desc: "Ikki tomon o'rtasidagi xizmat shartnomasi" },
  { value: "ishonchnoma", label: "Ishonchnoma", icon: "🤝", desc: "Vakillik va vakolatni rasmiylashtirish" },
  { value: "davo_ariza", label: "Da'vo Ariza", icon: "⚖️", desc: "Sud da'vosi uchun rasmiy ariza" },
  { value: "ariza", label: "Umumiy Ariza", icon: "📝", desc: "Davlat organlari yoki tashkilotlarga ariza" },
];

const FORM_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  shartnoma: [
    { key: "client", label: "Buyurtmachi", placeholder: "FIO yoki tashkilot nomi" },
    { key: "contractor", label: "Ijrochi", placeholder: "FIO yoki tashkilot nomi" },
    { key: "serviceType", label: "Xizmat turi", placeholder: "Masalan: Huquqiy maslahat" },
    { key: "amount", label: "Summa (so'm)", placeholder: "Masalan: 5,000,000" },
    { key: "deadline", label: "Muddat", placeholder: "Masalan: 30 kalendar kun" },
    { key: "city", label: "Shahar", placeholder: "Toshkent" },
    { key: "duration", label: "Shartnoma amal muddati", placeholder: "1 (bir) yil" },
    { key: "paymentDays", label: "To'lov muddati (ish kunlari)", placeholder: "5" },
  ],
  ishonchnoma: [
    { key: "principal", label: "Ishonchnoma beruvchi", placeholder: "To'liq FIO" },
    { key: "principalPassport", label: "Pasport seriyasi", placeholder: "AA 1234567" },
    { key: "principalAddress", label: "Manzil", placeholder: "To'liq yashash manzili" },
    { key: "agent", label: "Vakil (ishonch qo'yilgan shaxs)", placeholder: "To'liq FIO" },
    { key: "agentPassport", label: "Vakil pasporti", placeholder: "AA 1234567" },
    { key: "powers", label: "Vakolatlar", placeholder: "Nima qilishga vakolatli..." },
    { key: "validUntil", label: "Amal qilish muddati", placeholder: "2025 yil 31 dekabrga" },
    { key: "city", label: "Shahar", placeholder: "Toshkent" },
  ],
  davo_ariza: [
    { key: "courtName", label: "Sud nomi", placeholder: "Toshkent Shahar Iqtisodiy Sudi" },
    { key: "plaintiff", label: "Da'vogar", placeholder: "To'liq FIO" },
    { key: "plaintiffAddress", label: "Da'vogar manzili", placeholder: "To'liq manzil" },
    { key: "plaintiffPhone", label: "Telefon", placeholder: "+998 90 123 45 67" },
    { key: "defendant", label: "Javobgar", placeholder: "To'liq FIO yoki tashkilot" },
    { key: "defendantAddress", label: "Javobgar manzili", placeholder: "To'liq manzil" },
    { key: "claimAmount", label: "Da'vo summasi (so'm)", placeholder: "10,000,000" },
    { key: "contractDate", label: "Shartnoma sanasi", placeholder: "15 yanvar 2025" },
    { key: "breachDescription", label: "Qonun buzilishi tavsifi", placeholder: "Javobgar qanday majburiyatni bajarmadi" },
    { key: "articleRef", label: "Qonun moddasi", placeholder: "Masalan: FK 232-233" },
  ],
  ariza: [
    { key: "toOrg", label: "Kimga", placeholder: "Toshkent Shahar Hokimligiga" },
    { key: "applicant", label: "Ariza beruvchi", placeholder: "To'liq FIO" },
    { key: "address", label: "Manzil", placeholder: "To'liq manzil" },
    { key: "phone", label: "Telefon", placeholder: "+998 90 123 45 67" },
    { key: "requestBody", label: "Ariza mazmuni", placeholder: "Nima iltimos qilasiz..." },
    { key: "attachments", label: "Ilovalar", placeholder: "Hujjatlar ro'yxati" },
  ],
};

export default function DraftPage() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await api.documents.draft.$post({
        json: { type: selectedType!, formData },
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const handleCopy = () => {
    if (generatedContent) {
      navigator.clipboard.writeText(generatedContent);
    }
  };

  const handleDownload = () => {
    if (!generatedContent) return;
    const blob = new Blob([generatedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedType ?? "hujjat"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle = {
    background: '#131629',
    border: '1px solid #2A2D4A',
    color: '#F0EDE4',
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Hujjat Yaratish</h1>
          <p className="mt-1" style={{ color: '#9B97A8' }}>Rasmiy huquqiy hujjatlarni bir daqiqada tayyorlang</p>
        </div>

        {!selectedType ? (
          <div className="grid grid-cols-2 gap-4">
            {DOC_TYPES.map((type) => (
              <button key={type.value} onClick={() => { setSelectedType(type.value); setFormData({}); setGeneratedContent(null); }}
                className="p-6 rounded-2xl text-left transition-all group"
                style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
                <div className="text-3xl mb-3">{type.icon}</div>
                <div className="font-display font-bold text-lg mb-1" style={{ color: '#F0EDE4' }}>{type.label}</div>
                <div className="text-sm" style={{ color: '#9B97A8' }}>{type.desc}</div>
                <div className="mt-3 text-sm font-medium" style={{ color: '#C9A227' }}>Tanlash →</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="p-6 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold" style={{ color: '#F0EDE4' }}>
                  {DOC_TYPES.find(t => t.value === selectedType)?.label}
                </h2>
                <button onClick={() => { setSelectedType(null); setGeneratedContent(null); }}
                  className="text-xs px-3 py-1 rounded-lg" style={{ background: '#2A2D4A', color: '#9B97A8' }}>
                  ← Orqaga
                </button>
              </div>

              <div className="space-y-4">
                {FORM_FIELDS[selectedType]?.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm mb-1.5" style={{ color: '#9B97A8' }}>{field.label}</label>
                    {field.key === "powers" || field.key === "requestBody" || field.key === "breachDescription" ? (
                      <textarea
                        value={formData[field.key] ?? ""}
                        onChange={e => setFormData(p => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#C9A227'}
                        onBlur={e => e.target.style.borderColor = '#2A2D4A'}
                      />
                    ) : (
                      <input
                        value={formData[field.key] ?? ""}
                        onChange={e => setFormData(p => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#C9A227'}
                        onBlur={e => e.target.style.borderColor = '#2A2D4A'}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending}
                className="w-full mt-6 py-3 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: !draftMutation.isPending ? 'linear-gradient(135deg, #C9A227, #E8C547)' : '#2A2D4A',
                  color: !draftMutation.isPending ? '#0D0F1A' : '#9B97A8',
                  cursor: !draftMutation.isPending ? 'pointer' : 'not-allowed',
                }}>
                {draftMutation.isPending ? "Yaratilmoqda..." : "Hujjatni Yaratish 📝"}
              </button>
            </div>

            {/* Preview */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2A2D4A' }}>
                <h2 className="font-semibold text-sm" style={{ color: '#F0EDE4' }}>Ko'rib Chiqish</h2>
                {generatedContent && (
                  <div className="flex gap-2">
                    <button onClick={handleCopy}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: '#2A2D4A', color: '#9B97A8' }}>
                      📋 Nusxa
                    </button>
                    <button onClick={handleDownload}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227', border: '1px solid rgba(201,162,39,0.3)' }}>
                      ⬇️ Yuklab olish
                    </button>
                  </div>
                )}
              </div>
              {generatedContent ? (
                <pre className="p-6 text-xs leading-relaxed overflow-y-auto whitespace-pre-wrap"
                  style={{ color: '#F0EDE4', fontFamily: 'Inter, monospace', maxHeight: '500px' }}>
                  {generatedContent}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="text-3xl mb-3">📄</div>
                  <p className="text-sm" style={{ color: '#9B97A8' }}>Hujjat ko'rinishi bu yerda paydo bo'ladi</p>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-xs italic text-center" style={{ color: '#2A2D4A' }}>
          <em>Diqqat: Yaratilgan hujjatlar namuna hisoblanadi. Rasmiy foydalanishdan oldin yurist tomonidan ko'rib chiqilishi tavsiya etiladi.</em>
        </p>
      </div>
    </AppLayout>
  );
}
