import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";

type Message = { role: "user" | "assistant"; content: string };

const CATEGORIES = [
  { value: "civil", label: "Fuqarolik" },
  { value: "labor", label: "Mehnat" },
  { value: "family", label: "Oila" },
  { value: "corporate", label: "Korporativ" },
  { value: "tax", label: "Soliq" },
];

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("civil");
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setLoading(true);

    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const data = await api.post("/api/legal/chat", { message: msg, category });
      const aiMsg: Message = { role: "assistant", content: data.response ?? data.answer ?? JSON.stringify(data) };
      const newMsgs = [...messages, userMsg, aiMsg];
      setMessages(newMsgs);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

      // Save consultation
      try {
        if (consultationId) {
          await api.put(`/api/consultations/${consultationId}`, {
            messages: newMsgs,
            title: msg.substring(0, 50),
          });
        } else {
          const saved = await api.post("/api/consultations", {
            title: msg.substring(0, 50),
            messages: newMsgs,
            category,
          });
          if (saved?.id) setConsultationId(saved.id);
        }
      } catch {
        // persist failure is non-critical
      }
    } catch (e: any) {
      const errMsg: Message = { role: "assistant", content: `Xatolik: ${e.message || "Server bilan bog'lanishda muammo yuz berdi."}` };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const cleanText = (text: string) =>
    text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "").replace(/---/g, "─────").trim();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Orqaga</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>⚖️ Maslahat</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={s.catRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            onPress={() => setCategory(c.value)}
            style={[s.catChip, category === c.value && s.catChipActive]}
          >
            <Text style={[s.catChipText, category === c.value && s.catChipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.msgList}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>⚖️</Text>
              <Text style={s.emptyTitle}>Sayha AI Maslahatchi</Text>
              <Text style={s.emptyDesc}>
                Huquqiy savolingizni yozing. O'zbek qonunchiligi asosida javob beriladi.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === "user" ? s.userBubble : s.aiBubble]}>
              {item.role === "assistant" && <Text style={s.aiTag}>Sayha AI</Text>}
              <Text style={s.bubbleText}>
                {item.role === "assistant" ? cleanText(item.content) : item.content}
              </Text>
            </View>
          )}
        />

        {loading && (
          <View style={s.typingBox}>
            <ActivityIndicator size="small" color="#C9A227" />
            <Text style={s.typingText}>Tahlil qilinmoqda...</Text>
          </View>
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Savolingizni yozing..."
            placeholderTextColor="#4A4D6A"
            multiline
            maxLength={1000}
            onSubmitEditing={send}
          />
          <TouchableOpacity
            style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || loading}
          >
            <Text style={s.sendText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0D0F1A" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#2A2D4A",
  },
  backBtn: { width: 70 },
  backText: { color: "#C9A227", fontSize: 14 },
  headerTitle: { color: "#F0EDE4", fontWeight: "bold", fontSize: 16 },
  catRow: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: "#2A2D4A",
  },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#1A1D33", borderWidth: 1, borderColor: "#2A2D4A" },
  catChipActive: { backgroundColor: "rgba(201,162,39,0.15)", borderColor: "#C9A227" },
  catChipText: { color: "#9B97A8", fontSize: 12 },
  catChipTextActive: { color: "#C9A227", fontWeight: "600" },
  msgList: { padding: 16, gap: 12, flexGrow: 1 },
  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: "#F0EDE4", fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  emptyDesc: { color: "#9B97A8", fontSize: 14, textAlign: "center", lineHeight: 22 },
  bubble: { padding: 14, borderRadius: 16, maxWidth: "85%" },
  userBubble: {
    alignSelf: "flex-end", backgroundColor: "rgba(201,162,39,0.15)",
    borderWidth: 1, borderColor: "rgba(201,162,39,0.3)", borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start", backgroundColor: "#1A1D33",
    borderWidth: 1, borderColor: "#2A2D4A", borderLeftWidth: 3,
    borderLeftColor: "#C9A227", borderBottomLeftRadius: 4,
  },
  aiTag: { color: "#C9A227", fontSize: 11, fontWeight: "bold", marginBottom: 6 },
  bubbleText: { color: "#F0EDE4", fontSize: 14, lineHeight: 22 },
  typingBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingHorizontal: 16 },
  typingText: { color: "#9B97A8", fontSize: 13 },
  inputRow: {
    flexDirection: "row", gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: "#2A2D4A", alignItems: "flex-end",
  },
  input: {
    flex: 1, backgroundColor: "#1A1D33", borderWidth: 1, borderColor: "#2A2D4A",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    color: "#F0EDE4", fontSize: 14, maxHeight: 100,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#C9A227", alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: "#2A2D4A" },
  sendText: { color: "#0D0F1A", fontSize: 20, fontWeight: "bold" },
});
