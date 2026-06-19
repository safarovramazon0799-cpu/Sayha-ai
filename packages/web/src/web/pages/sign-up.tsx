import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { authClient, captureToken, TOKEN_KEY } from "../lib/auth";

const BOT_USERNAME = "sayha_ai_auth_bot";

// ── helpers ────────────────────────────────────────────────────────────────
function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
  }
}

// ── Main component ─────────────────────────────────────────────────────────
export default function SignUpPage() {
  const [, navigate] = useLocation();

  // Registration form state
  const [name, setName]         = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Verification modal state
  const [step, setStep]           = useState<"register" | "verify">("register");
  const [verifyCode, setVerifyCode] = useState("");
  const [copied, setCopied]       = useState(false);
  const [codeExpired, setCodeExpired] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [gettingCode, setGettingCode] = useState(false);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Get a fresh code from /api/telegram/code ───────────────
  const fetchCode = async () => {
    setGettingCode(true);
    setVerifyError("");
    setCodeExpired(false);
    try {
      const res = await fetch("/api/telegram/code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ""}`,
        },
      });
      const data = await res.json();
      if (data.code) {
        setVerifyCode(data.code);
        startPolling(data.code);
      } else {
        setVerifyError("Kod olishda xatolik. Qayta urinib ko'ring.");
      }
    } catch {
      setVerifyError("Tarmoq xatosi. Qayta urinib ko'ring.");
    } finally {
      setGettingCode(false);
    }
  };

  // ── Poll backend until verified or expired ───────────────────────
  const startPolling = (code: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/telegram/verify-status/${code}`);
        const data = await res.json();
        if (data.verified && data.token) {
          clearInterval(pollRef.current!);
          // Store the session token and navigate
          localStorage.setItem(TOKEN_KEY, data.token);
          await authClient.getSession(); // refresh session cache
          navigate("/dashboard");
        } else if (data.expired) {
          clearInterval(pollRef.current!);
          setCodeExpired(true);
          setVerifyError("Kod muddati tugadi. Yangi kod oling.");
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 2500);
  };

  // ── Handle registration form submit ─────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    if (username.trim().length < 3) {
      setError("Login kamida 3 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Xatolik yuz berdi. Qayta urinib ko'ring.");
        setLoading(false);
        return;
      }
      // Capture bearer token from response header
      const token = res.headers.get("set-auth-token");
      if (token) localStorage.setItem(TOKEN_KEY, token);
    } catch {
      setError("Tarmoq xatosi. Qayta urinib ko'ring.");
      setLoading(false);
      return;
    }
    setLoading(false);
    // Signed up & token captured — now generate Telegram code
    setStep("verify");
    await fetchCode();
  };

  // ── Copy handler ─────────────────────────────────────────────────
  const handleCopy = () => {
    copyToClipboard(verifyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ────────────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: '#0D0F1A' }}>
      {/* Subtle grid bg */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #C9A227 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold"
              style={{ background: 'linear-gradient(135deg, #C9A227, #E8C547)', color: '#0D0F1A' }}>S</div>
            <span className="font-display text-2xl font-bold" style={{ color: '#F0EDE4' }}>Sayha AI</span>
          </div>
          {step === "register" && (
            <>
              <h2 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Hisob yarating</h2>
              <p className="mt-2" style={{ color: '#9B97A8' }}>Bepul ro'yxatdan o'ting</p>
            </>
          )}
          {step === "verify" && (
            <>
              <h2 className="font-display text-3xl font-bold" style={{ color: '#F0EDE4' }}>Akkauntni tasdiqlang</h2>
              <p className="mt-2" style={{ color: '#9B97A8' }}>Telegram orqali bir daqiqada</p>
            </>
          )}
        </div>

        {/* ── REGISTRATION FORM ──────────────────────────────────── */}
        {step === "register" && (
          <div className="p-8 rounded-2xl" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#9B97A8' }}>Ism Familiya</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  required placeholder="Abdullayev Akbar"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: '#131629', border: '1px solid #2A2D4A', color: '#F0EDE4' }}
                  onFocus={e => e.target.style.borderColor = '#C9A227'}
                  onBlur={e => e.target.style.borderColor = '#2A2D4A'}
                />
              </div>
              {/* Username */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#9B97A8' }}>Login/Foydalanuvchi nomi</label>
                <input
                  type="text" value={username} onChange={e => setUsername(e.target.value)}
                  required placeholder="abdullayev_akbar"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: '#131629', border: '1px solid #2A2D4A', color: '#F0EDE4' }}
                  onFocus={e => e.target.style.borderColor = '#C9A227'}
                  onBlur={e => e.target.style.borderColor = '#2A2D4A'}
                />
              </div>
              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#9B97A8' }}>Parol</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    required placeholder="Kamida 8 belgi"
                    className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none transition-all"
                    style={{ background: '#131629', border: '1px solid #2A2D4A', color: '#F0EDE4' }}
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

              {error && (
                <div className="px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#E74C3C' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all mt-2"
                style={{
                  background: loading ? '#2A2D4A' : 'linear-gradient(135deg, #C9A227, #E8C547)',
                  color: '#0D0F1A',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                {loading ? "Yuklanmoqda..." : "Ro'yxatdan o'tish →"}
              </button>
            </form>

            <p className="text-center mt-6 text-xs leading-relaxed" style={{ color: '#9B97A8' }}>
              Ro'yxatdan o'tgandan so'ng Telegram bot orqali tasdiqlash talab qilinadi
            </p>

            <p className="text-center mt-3 text-sm" style={{ color: '#9B97A8' }}>
              Hisobingiz bormi?{" "}
              <Link href="/sign-in">
                <a style={{ color: '#C9A227' }} className="font-medium hover:underline">Kirish</a>
              </Link>
            </p>
          </div>
        )}

        {/* ── VERIFICATION MODAL ─────────────────────────────────── */}
        {step === "verify" && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#1A1D33', border: '1px solid #2A2D4A' }}>
            {/* Top accent bar */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #C9A227, #E8C547)' }} />

            <div className="p-8">
              {/* Telegram icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(41,182,246,0.1)', border: '1px solid rgba(41,182,246,0.25)' }}>
                  ✈️
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-3 mb-6">
                {[
                  { n: 1, text: "Quyidagi kodni nusxalang" },
                  { n: 2, text: `Telegram botiga yuboring: @${BOT_USERNAME}` },
                  { n: 3, text: "Brauzer avtomatik tarzda kirishni amalga oshiradi" },
                ].map(step => (
                  <div key={step.n} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227', border: '1px solid rgba(201,162,39,0.3)' }}>
                      {step.n}
                    </div>
                    <span className="text-sm" style={{ color: '#9B97A8' }}>{step.text}</span>
                  </div>
                ))}
              </div>

              {/* Code display */}
              {gettingCode ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: '#C9A227', animationDelay: `${i * 150}ms` }} />
                  ))}
                  <span className="text-sm ml-2" style={{ color: '#9B97A8' }}>Kod yaratilmoqda...</span>
                </div>
              ) : verifyCode ? (
                <div className="mb-5">
                  <div className="flex items-center gap-3 p-4 rounded-xl"
                    style={{ background: '#131629', border: '1px solid rgba(201,162,39,0.3)' }}>
                    {/* Code digits */}
                    <div className="flex-1 flex items-center justify-center gap-2">
                      {verifyCode.split("").map((digit, i) => (
                        <div key={i} className="w-10 h-12 flex items-center justify-center rounded-lg text-xl font-bold font-mono"
                          style={{ background: '#1A1D33', border: '1px solid #2A2D4A', color: '#C9A227', letterSpacing: 0 }}>
                          {digit}
                        </div>
                      ))}
                    </div>
                    {/* Copy button */}
                    <button onClick={handleCopy}
                      className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(201,162,39,0.1)',
                        color: copied ? '#2ECC71' : '#C9A227',
                        border: `1px solid ${copied ? 'rgba(46,204,113,0.3)' : 'rgba(201,162,39,0.25)'}`,
                      }}>
                      {copied ? "✓ Nusxalandi" : "Nusxalash"}
                    </button>
                  </div>

                  {/* Waiting indicator */}
                  {!codeExpired && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9A227' }} />
                      <span className="text-xs" style={{ color: '#9B97A8' }}>Telegram tasdiqlanishi kutilmoqda...</span>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Error */}
              {verifyError && (
                <div className="px-4 py-3 rounded-xl text-sm mb-4"
                  style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#E74C3C' }}>
                  {verifyError}
                </div>
              )}

              {/* Primary CTA — open bot */}
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 mb-3"
                style={{
                  background: 'linear-gradient(135deg, #229ED9, #1a8dbd)',
                  color: '#fff',
                  textDecoration: 'none',
                  display: 'flex',
                }}>
                ✈️ Botga o'tish
              </a>

              {/* Refresh code */}
              <button
                onClick={fetchCode}
                disabled={gettingCode}
                className="w-full text-sm text-center py-2 rounded-xl transition-colors"
                style={{
                  background: 'transparent',
                  color: gettingCode ? '#2A2D4A' : '#9B97A8',
                  border: '1px solid #2A2D4A',
                  cursor: gettingCode ? 'not-allowed' : 'pointer',
                }}>
                {gettingCode ? "Yangilanmoqda..." : "Yangi kod olish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
