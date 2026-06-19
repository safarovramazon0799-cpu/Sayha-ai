import { useState } from "react";
import { useLocation } from "wouter";
import { authClient, captureToken } from "../lib/auth";
import { Link } from "wouter";
import { X, Eye, EyeOff } from "lucide-react";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await (authClient.signIn as any).username(
      { username: username.trim().toLowerCase(), password },
      { onSuccess: captureToken }
    );
    setLoading(false);
    if (result.error) {
      setError("Login yoki parol noto'g'ri. Qayta urinib ko'ring.");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0D0F1A' }}>
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #131629 0%, #1A1D33 100%)' }}>
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #C9A227 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>S</div>
            <span className="font-display text-2xl font-bold" style={{ color: '#F0EDE4' }}>Sayha AI</span>
          </div>
          <h1 className="font-display text-4xl font-bold mb-6 leading-tight" style={{ color: '#F0EDE4' }}>
            O'zbekiston Huquqiy<br />
            <span style={{ color: '#C9A227' }}>Sun'iy Intellekti</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: '#9B97A8' }}>
            Huquqiy maslahat, shartnoma tahlili va professional hujjat yaratish — barchasi bir joyda.
          </p>
        </div>
        <div className="relative space-y-4">
          {[
            { icon: "⚖️", text: "Mehnat, fuqarolik, oila huquqi bo'yicha maslahat" },
            { icon: "📋", text: "Shartnoma risklarini aniqlash va tahlil qilish" },
            { icon: "📝", text: "Da'vo ariza, shartnoma va ishonchnoma yaratish" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(201,162,39,0.15)' }}>
              <span className="text-xl">{item.icon}</span>
              <span style={{ color: '#9B97A8' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4 lg:hidden">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold"
                style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>S</div>
              <span className="font-display text-2xl font-bold" style={{ color: '#F0EDE4' }}>Sayha AI</span>
            </div>
            <h2 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Xush kelibsiz</h2>
            <p className="mt-2" style={{ color: '#9B97A8' }}>Hisobingizga kiring</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#9B97A8' }}>Login/Foydalanuvchi nomi</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="abdullayev_akbar"
                className="w-full px-4 py-3 rounded-xl text-sm transition-all outline-none"
                style={{
                  background: '#1A1D33',
                  border: '1px solid #2A2D4A',
                  color: '#F0EDE4',
                }}
                onFocus={e => e.target.style.borderColor = '#C9A227'}
                onBlur={e => e.target.style.borderColor = '#2A2D4A'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#9B97A8' }}>Parol</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm transition-all outline-none"
                  style={{
                    background: '#1A1D33',
                    border: '1px solid #2A2D4A',
                    color: '#F0EDE4',
                  }}
                  onFocus={e => e.target.style.borderColor = '#C9A227'}
                  onBlur={e => e.target.style.borderColor = '#2A2D4A'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: '#9B97A8' }}
                  tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-sm hover:underline"
                style={{ color: '#C9A227' }}>
                Parolni unutdingizmi?
              </button>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#E74C3C' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: loading ? '#2A2D4A' : 'linear-gradient(135deg, #C9A227, #E8C547)',
                color: '#0D0F1A',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
              {loading ? "Yuklanmoqda..." : "Kirish"}
            </button>
          </form>

          <p className="text-center mt-6 text-sm" style={{ color: '#9B97A8' }}>
            Hisobingiz yo'qmi?{" "}
            <Link href="/sign-up">
              <a style={{ color: '#C9A227' }} className="font-medium hover:underline">Ro'yxatdan o'ting</a>
            </Link>
          </p>

          <p className="text-center mt-8 text-xs leading-relaxed" style={{ color: '#2A2D4A' }}>
            <em>Diqqat: Ushbu AI platformasi tomonidan taqdim etilgan ma'lumotlar faqat tanishish xarakteriga ega.</em>
          </p>
        </div>
      </div>
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowForgot(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 relative"
            style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowForgot(false)}
              className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: '#F0EDE4' }}>
              <X size={18} />
            </button>
            <div className="text-2xl mb-3">🔐</div>
            <h3 className="font-display text-lg font-bold mb-3" style={{ color: '#F0EDE4' }}>
              Parolni tiklash
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#9B97A8' }}>
              Parolni ko'rish uchun Sayha AI Telegram botiga{' '}
              <a href="https://t.me/sayha_ai_auth_bot" target="_blank" rel="noreferrer"
                style={{ color: '#C9A227' }} className="font-medium hover:underline">
                @sayha_ai_auth_bot
              </a>{' '}
              kiring va pastdagi{' '}
              <code className="px-1 py-0.5 rounded text-xs"
                style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227' }}>
                👤 Profil Ma'lumotlari
              </code>{' '}
              tugmasini bosing. Bot sizga amaldagi parolingizni ko'rsatadi!
            </p>
            <button onClick={() => setShowForgot(false)}
              className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>
              Tushundim
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
