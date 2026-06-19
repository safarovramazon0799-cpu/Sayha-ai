import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "../components/app-layout";
import { api } from "../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Mic, MicOff, Download, Volume2, VolumeX } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

// Streaming states
type StreamState = "idle" | "loading" | "streaming" | "error";

const CATEGORIES = [
  { value: "civil",      label: "Fuqarolik" },
  { value: "labor",      label: "Mehnat" },
  { value: "family",     label: "Oila" },
  { value: "corporate",  label: "Korporativ" },
  { value: "tax",        label: "Soliq" },
  { value: "general",    label: "Umumiy" },
];

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#C9A227">$1</strong>')
    .replace(/\*([^*]+?)\*/g, "<em>$1</em>")
    .replace(/---/g, '<hr style="border-color:#2A2D4A;margin:12px 0"/>')
    .replace(/^•\s(.+)$/gm, '<li style="margin-left:16px;margin-bottom:4px">$1</li>')
    .replace(/\n/g, "<br/>");
}

// Blinking cursor component
function Cursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "2px",
        height: "1em",
        background: "#C9A227",
        marginLeft: "2px",
        verticalAlign: "text-bottom",
        animation: "blink 0.8s step-end infinite",
      }}
    />
  );
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ id?: string }>();
  const sessionId = params?.id ?? null;

  const [input, setInput]             = useState("");
  const [messages, setMessages]       = useState<Message[]>([]);
  const [category, setCategory]       = useState("general");
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  // Voice input state
  const [isRecording, setIsRecording]     = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled]       = useState(false);
  const [isSpeaking, setIsSpeaking]       = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const sessionLoaded  = useRef<string | null>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const mediaRecRef    = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef    = useRef<HTMLAudioElement | null>(null);

  // Load existing session from history
  const { data: allConsultations } = useQuery({
    queryKey: ["consultations"],
    queryFn: async () => {
      const res = await api.consultations.$get();
      return res.json();
    },
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (sessionId && allConsultations && sessionLoaded.current !== sessionId) {
      const found = (allConsultations as any[]).find((c: any) => c.id === sessionId);
      if (found) {
        sessionLoaded.current = sessionId;
        setConsultationId(found.id);
        setCategory(found.category ?? "general");
        try { setMessages(JSON.parse(found.messages || "[]")); } catch { setMessages([]); }
      }
    }
  }, [sessionId, allConsultations]);

  useEffect(() => {
    if (!sessionId) sessionLoaded.current = null;
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Save consultation to DB
  const saveConsultation = useCallback(async (
    finalMessages: Message[],
    userMessage: string,
    currentConsultationId: string | null,
  ) => {
    if (currentConsultationId) {
      await api.consultations[":id"].$put({
        param: { id: currentConsultationId },
        json: { messages: finalMessages, title: userMessage.substring(0, 50) },
      });
      return currentConsultationId;
    } else {
      const res = await api.consultations.$post({
        json: { title: userMessage.substring(0, 50), messages: finalMessages, category },
      });
      const saved = await res.json() as any;
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      return saved.id as string;
    }
  }, [category, queryClient]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streamState !== "idle") return;

    setInput("");
    setErrorMsg(null);
    setStreamState("loading");
    setStreamingText("");

    // Optimistically add user message
    const userMsg: Message = { role: "user", content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    const token = localStorage.getItem("sayha_bearer_token") ?? "";
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/legal/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, category, stream: true }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as any;
        if (res.status === 403 && errData.limitExceeded) {
          setErrorMsg(errData.error ?? "Limitingiz tugadi.");
          setStreamState("error");
          // Remove the optimistically added user message
          setMessages(messages);
          return;
        }
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        // Server returned non-stream (fallback)
        const data = await res.json() as any;
        const assistantMsg: Message = { role: "assistant", content: data.response ?? "" };
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        setStreamState("idle");
        const newId = await saveConsultation(finalMessages, msg, consultationId);
        if (!consultationId) setConsultationId(newId);
        return;
      }

      // ── SSE streaming ─────────────────────────────────────────────
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let firstToken = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;

          try {
            const parsed = JSON.parse(payload) as { text: string };
            if (parsed.text) {
              accumulated += parsed.text;
              if (firstToken) {
                firstToken = false;
                setStreamState("streaming");
              }
              setStreamingText(accumulated);
            }
          } catch {}
        }
      }

      // Finalize: move streamed text into messages array
      const assistantMsg: Message = { role: "assistant", content: accumulated };
      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      setStreamingText("");
      setStreamState("idle");

      // Persist
      const newId = await saveConsultation(finalMessages, msg, consultationId);
      if (!consultationId) setConsultationId(newId);

    } catch (err: any) {
      if (err.name === "AbortError") {
        setStreamState("idle");
        return;
      }
      console.error("Chat stream error:", err);
      setErrorMsg(err.message ?? "Xatolik yuz berdi");
      setStreamState("error");
      // Remove the optimistic user message on hard error
      setMessages(messages);
      setStreamingText("");
    }
  }, [input, streamState, messages, category, consultationId, saveConsultation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConsultationId(null);
    setInput("");
    setStreamState("idle");
    setStreamingText("");
    setErrorMsg(null);
    sessionLoaded.current = null;
    window.history.pushState(null, "", "/chat");
  };

  const isPending = streamState === "loading" || streamState === "streaming";

  // ── Voice recording (STT) ───────────────────────────────────────────────
  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      mediaRecRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      mediaRecRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: form,
            credentials: "include",
          });
          const data = await res.json() as { transcript?: string; error?: string };
          if (data.transcript) {
            setInput(prev => prev ? prev + " " + data.transcript : data.transcript!);
          } else {
            setErrorMsg("Ovozni matnга o'girib bo'lmadi.");
          }
        } catch (e) {
          setErrorMsg("STT xatolik.");
        } finally {
          setIsTranscribing(false);
        }
      };

      rec.start(250); // collect chunks every 250ms
      setIsRecording(true);
    } catch (err) {
      setErrorMsg("Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.");
    }
  }, [isRecording]);

  // ── TTS playback ────────────────────────────────────────────────────────
  const speakText = useCallback(async (text: string) => {
    if (!ttsEnabled) return;
    if (isSpeaking) {
      audioCtxRef.current?.pause();
      setIsSpeaking(false);
      return;
    }
    try {
      setIsSpeaking(true);
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: text.slice(0, 2000) }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioCtxRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [ttsEnabled, isSpeaking]);

  // ── DOCX download ───────────────────────────────────────────────────────
  const downloadDocx = useCallback(async (content: string, title = "Yuridik_Hujjat") => {
    try {
      const res = await fetch("/api/documents/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, body: content }),
      });
      if (!res.ok) throw new Error("DOCX failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}_SayhaAI.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("Hujjatni yuklab bo'lmadi.");
    }
  }, []);

  return (
    <AppLayout>
      {/* Cursor blink keyframe */}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #2A2D4A" }}>
          <div>
            <h1 className="font-display text-xl font-bold" style={{ color: "#F0EDE4" }}>Huquqiy Maslahat</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9B97A8" }}>O'zbekiston qonunchiligi asosida AI tavsiyalari</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={isPending}
              className="text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: "#1A1D33", border: "1px solid #2A2D4A", color: "#F0EDE4" }}
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button
              onClick={handleNewChat}
              className="text-xs px-4 py-2 rounded-lg font-medium transition-colors"
              style={{ background: "#2A2D4A", color: "#9B97A8" }}
            >
              + Yangi
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && streamState === "idle" && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">⚖️</div>
              <h2 className="font-display text-2xl font-bold mb-2" style={{ color: "#F0EDE4" }}>
                Sayha AI Maslahatchi
              </h2>
              <p className="max-w-md" style={{ color: "#9B97A8" }}>
                Huquqiy savolingizni O'zbek tilida yozing. Mehnat, fuqarolik, oila, korporativ yoki soliq huquqi bo'yicha maslahat oling.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 max-w-lg">
                {[
                  "Ishdan nohaq bo'shatilsam nima qilaman?",
                  "Shartnomada imzo chekkandan so'ng bekor qilsa bo'ladimi?",
                  "Ijara uchun to'lovni to'lamaganim uchun javobgarman?",
                  "MChJ ro'yxatdan o'tkazish uchun qanday hujjat kerak?",
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="text-sm px-4 py-3 rounded-xl text-left transition-all"
                    style={{ background: "#1A1D33", border: "1px solid #2A2D4A", color: "#9B97A8" }}
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Existing messages */}
          {messages.map((msg, i) => (
            <div key={i} className={`message-appear flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mr-3 mt-1 flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #C9A227, #E8C547)", color: "#0D0F1A" }}
                >S</div>
              )}
              <div className="max-w-2xl">
                <div
                  className="px-4 py-3 rounded-2xl text-sm leading-relaxed legal-text"
                  style={msg.role === "user" ? {
                    background: "rgba(201,162,39,0.15)",
                    border: "1px solid rgba(201,162,39,0.3)",
                    color: "#F0EDE4",
                    borderRadius: "18px 18px 4px 18px",
                  } : {
                    background: "#1A1D33",
                    border: "1px solid #2A2D4A",
                    borderLeft: "3px solid #C9A227",
                    color: "#F0EDE4",
                    borderRadius: "4px 18px 18px 18px",
                  }}
                >
                  {msg.role === "assistant" ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {/* Action buttons for assistant messages */}
                {msg.role === "assistant" && (
                  <div className="flex gap-2 mt-1 ml-1">
                    {ttsEnabled && (
                      <button
                        onClick={() => speakText(msg.content)}
                        title="Ovoz bilan o'qish"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                        style={{ background: "transparent", border: "1px solid #2A2D4A", color: "#9B97A8", cursor: "pointer" }}
                        onMouseOver={e => (e.currentTarget.style.borderColor = "#C9A227")}
                        onMouseOut={e => (e.currentTarget.style.borderColor = "#2A2D4A")}
                      >
                        <Volume2 size={11} /> Eshitish
                      </button>
                    )}
                    <button
                      onClick={() => downloadDocx(msg.content, `Sayha_AI_Javob_${i + 1}`)}
                      title=".docx yuklab olish"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                      style={{ background: "transparent", border: "1px solid #2A2D4A", color: "#9B97A8", cursor: "pointer" }}
                      onMouseOver={e => (e.currentTarget.style.borderColor = "#C9A227")}
                      onMouseOut={e => (e.currentTarget.style.borderColor = "#2A2D4A")}
                    >
                      <Download size={11} /> .docx
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading state — shown ONLY before first token */}
          {streamState === "loading" && (
            <div className="flex items-start gap-3 message-appear">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #C9A227, #E8C547)", color: "#0D0F1A" }}
              >S</div>
              <div
                className="px-4 py-3 rounded-2xl"
                style={{ background: "#1A1D33", border: "1px solid #2A2D4A", borderLeft: "3px solid #C9A227" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ background: "#C9A227", animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-sm" style={{ color: "#9B97A8" }}>Tahlil qilinmoqda...</span>
                </div>
              </div>
            </div>
          )}

          {/* Streaming — live typing */}
          {streamState === "streaming" && streamingText && (
            <div className="flex items-start gap-3 message-appear">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mr-3 mt-1 flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #C9A227, #E8C547)", color: "#0D0F1A" }}
              >S</div>
              <div className="max-w-2xl">
                <div
                  className="px-4 py-3 rounded-2xl text-sm leading-relaxed legal-text"
                  style={{
                    background: "#1A1D33",
                    border: "1px solid #2A2D4A",
                    borderLeft: "3px solid #C9A227",
                    color: "#F0EDE4",
                    borderRadius: "4px 18px 18px 18px",
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                    style={{ display: "inline" }}
                  />
                  <Cursor />
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
          {streamState === "error" && errorMsg && (
            <div className="flex items-start gap-3 message-appear">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: "#FF5252", color: "#fff" }}
              >!</div>
              <div
                className="px-4 py-3 rounded-2xl text-sm"
                style={{ background: "#1A1D33", border: "1px solid #FF525244", color: "#FF5252" }}
              >
                {errorMsg} —{" "}
                <button
                  onClick={() => { setStreamState("idle"); setErrorMsg(null); }}
                  style={{ color: "#C9A227", textDecoration: "underline" }}
                >
                  qayta urinish
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: "1px solid #2A2D4A" }}>
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            {/* Voice record button */}
            <button
              onClick={handleVoiceToggle}
              disabled={isPending || isTranscribing}
              title={isRecording ? "Yozishni to'xtatish" : "Ovozli xabar"}
              className="p-3 rounded-xl flex-shrink-0 transition-all"
              style={{
                background: isRecording ? "#FF525222" : "#1A1D33",
                border: `1px solid ${isRecording ? "#FF5252" : "#2A2D4A"}`,
                color: isRecording ? "#FF5252" : (isTranscribing ? "#C9A227" : "#9B97A8"),
                cursor: (isPending || isTranscribing) ? "not-allowed" : "pointer",
                animation: isRecording ? "blink 1s step-end infinite" : "none",
              }}
            >
              {isTranscribing
                ? <span style={{ fontSize: "12px", fontWeight: 600 }}>...</span>
                : isRecording
                ? <MicOff size={16} />
                : <Mic size={16} />}
            </button>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "🎤 Gapiring... (to'xtatish uchun tugmani bosing)" : "Huquqiy savolingizni yozing..."}
              rows={2}
              disabled={isPending}
              className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
              style={{
                background: "#1A1D33",
                border: `1px solid ${isRecording ? "#C9A22766" : "#2A2D4A"}`,
                color: "#F0EDE4",
                maxHeight: "120px",
                opacity: isPending ? 0.6 : 1,
              }}
              onFocus={e => e.target.style.borderColor = "#C9A227"}
              onBlur={e => !isRecording && (e.target.style.borderColor = "#2A2D4A")}
            />

            {/* TTS toggle */}
            <button
              onClick={() => setTtsEnabled(v => !v)}
              title={ttsEnabled ? "Ovozli javobni o'chirish" : "Ovozli javob yoqish"}
              className="p-3 rounded-xl flex-shrink-0 transition-all"
              style={{
                background: ttsEnabled ? "#C9A22722" : "#1A1D33",
                border: `1px solid ${ttsEnabled ? "#C9A227" : "#2A2D4A"}`,
                color: ttsEnabled ? "#C9A227" : "#9B97A8",
                cursor: "pointer",
              }}
            >
              {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <button
              onClick={isPending ? () => abortRef.current?.abort() : handleSend}
              disabled={!isPending && !input.trim()}
              className="px-5 py-3 rounded-xl font-semibold text-sm transition-all flex-shrink-0"
              style={{
                background: isPending
                  ? "#FF525222"
                  : (input.trim() ? "linear-gradient(135deg, #C9A227, #E8C547)" : "#2A2D4A"),
                color: isPending ? "#FF5252" : (input.trim() ? "#0D0F1A" : "#9B97A8"),
                border: isPending ? "1px solid #FF525244" : "none",
                cursor: (!isPending && !input.trim()) ? "not-allowed" : "pointer",
              }}
            >
              {isPending ? "To'xtatish" : "Yuborish"}
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "#4A4D6A" }}>
            Enter — yuborish · Shift+Enter — yangi qator · 🎤 Ovozli savol · 🔊 Ovozli javob
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
