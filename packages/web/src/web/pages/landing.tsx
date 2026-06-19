import { Link } from "wouter";

const features = [
  {
    icon: "⚖️",
    title: "Huquqiy Maslahat",
    desc: "Mehnat, fuqarolik, oila, korporativ va soliq huquqi bo'yicha AI asosidagi professional maslahat.",
  },
  {
    icon: "📋",
    title: "Shartnoma Tahlili",
    desc: "Shartnomangizni yuklang — yashirin xavflar, noaniq bandlar va qonun buzilishlarini aniqlang.",
  },
  {
    icon: "📝",
    title: "Hujjat Yaratish",
    desc: "Da'vo ariza, shartnoma, ishonchnoma va boshqa rasmiy hujjatlarni bir daqiqada tayyorlang.",
  },
  {
    icon: "📂",
    title: "Maslahatlar Tarixi",
    desc: "Barcha murojaat va hujjatlaringiz xavfsiz saqlanadi va istalgan vaqt mavjud bo'ladi.",
  },
];

const categories = [
  { label: "Mehnat Huquqi", color: "#2196F3", desc: "Ishga qabul, ishdan bo'shatish, ish haqi" },
  { label: "Fuqarolik Huquqi", color: "#C9A227", desc: "Mulk, shartnoma, zarar qoplash" },
  { label: "Oila Huquqi", color: "#E91E63", desc: "Nikoh, ajralish, nafaqa" },
  { label: "Korporativ Huquq", color: "#4CAF50", desc: "MChJ, AJ, biznes ro'yxati" },
  { label: "Soliq Huquqi", color: "#FF5722", desc: "QQS, daromad solig'i, imtiyozlar" },
];

export default function LandingPage() {
  return (
    <div style={{ background: '#0D0F1A', minHeight: '100vh', color: '#F0EDE4' }}>
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5" style={{ borderBottom: '1px solid #2A2D4A' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>S</div>
          <span className="font-display text-xl font-bold">Sayha AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <a className="text-sm px-4 py-2 rounded-lg transition-colors font-medium"
              style={{ color: '#9B97A8' }}>Kirish</a>
          </Link>
          <Link href="/sign-up">
            <a className="text-sm px-5 py-2 rounded-lg font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
              Bepul Boshlash
            </a>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8"
          style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.3)', color: '#C9A227' }}>
          <span>🏛️</span>
          <span>O'zbekiston Respublikasi qonunchiligi asosida</span>
        </div>
        <h1 className="font-display text-5xl lg:text-6xl font-black mb-6 leading-tight">
          O'zbekiston uchun<br />
          <span style={{ color: '#C9A227' }}>Huquqiy AI Maslahatchi</span>
        </h1>
        <p className="text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: '#9B97A8' }}>
          Professional huquqiy maslahat, shartnoma tahlili va rasmiy hujjat yaratish — barchasi O'zbek tilida, O'zbekiston qonunchiligiga asosida.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/sign-up">
            <a className="px-8 py-4 rounded-xl text-base font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
              Bepul Boshlash →
            </a>
          </Link>
          <Link href="/sign-in">
            <a className="px-8 py-4 rounded-xl text-base font-semibold transition-all"
              style={{ border: '1px solid #2A2D4A', color: '#F0EDE4' }}>
              Kirish
            </a>
          </Link>
        </div>
        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto">
          {[
            { val: "5+", label: "Huquq sohasi" },
            { val: "100%", label: "O'zbek tilida" },
            { val: "24/7", label: "Mavjud" },
          ].map((s, i) => (
            <div key={i}>
              <div className="font-display text-3xl font-bold" style={{ color: '#C9A227' }}>{s.val}</div>
              <div className="text-sm mt-1" style={{ color: '#9B97A8' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Gold divider */}
      <div className="gold-divider mx-8 mb-16" />

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <h2 className="font-display text-3xl font-bold text-center mb-12">Asosiy Imkoniyatlar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <div key={i} className="p-6 rounded-2xl transition-all"
              style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-display text-xl font-bold mb-2" style={{ color: '#F0EDE4' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#9B97A8' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <h2 className="font-display text-3xl font-bold text-center mb-12">Qamrab Olingan Huquq Sohalari</h2>
        <div className="flex flex-wrap gap-4 justify-center">
          {categories.map((cat, i) => (
            <div key={i} className="px-6 py-4 rounded-xl"
              style={{ background: '#1A1D33', border: `1px solid ${cat.color}30` }}>
              <div className="font-semibold mb-1" style={{ color: cat.color }}>{cat.label}</div>
              <div className="text-xs" style={{ color: '#9B97A8' }}>{cat.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 pb-20">
        <div className="max-w-3xl mx-auto text-center p-12 rounded-2xl"
          style={{ background: '#1A1D33', border: '1px solid rgba(201,162,39,0.3)' }}>
          <h2 className="font-display text-3xl font-bold mb-4">Huquqiy Muammongizni Hal Eting</h2>
          <p className="mb-8" style={{ color: '#9B97A8' }}>
            Sayha AI bilan huquqiy maslahat olish endi qulay, tez va ishonchli.
          </p>
          <Link href="/sign-up">
            <a className="inline-block px-10 py-4 rounded-xl font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
              Hoziroq Boshlash →
            </a>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-8 text-center text-xs" style={{ borderTop: '1px solid #2A2D4A', color: '#2A2D4A' }}>
        <p>© 2025 Sayha AI. Barcha huquqlar himoyalangan.</p>
        <p className="mt-2 italic">
          Diqqat: Ushbu AI platformasi tomonidan taqdim etilgan ma'lumotlar va maslahatlar faqat tanishish va yo'nalish olish xarakteriga ega bo'lib, rasmiy advokat-mijoz munosabatlarini yoki professional huquqshunos maslahatini o'rnini bosmaydi.
        </p>
      </footer>
    </div>
  );
}
