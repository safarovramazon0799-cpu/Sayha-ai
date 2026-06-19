import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../lib/api";

const COLORS = {
  bg: "#0D0F1A",
  card: "#1A1D33",
  border: "#2A2D4A",
  gold: "#C9A227",
  text: "#F0EDE4",
  muted: "#8B8FA8",
};

const DOC_TYPES = [
  { id: "ijara", label: "Ijara shartnomasi", icon: "home-outline" },
  { id: "xizmat", label: "Xizmat ko'rsatish", icon: "briefcase-outline" },
  { id: "mehnat", label: "Mehnat shartnomasi", icon: "people-outline" },
  { id: "sotib_olish", label: "Sotib olish-sotish", icon: "cart-outline" },
  { id: "sheriklik", label: "Sheriklik shartnomasi", icon: "handshake-outline" },
  { id: "maxfiylik", label: "Maxfiylik (NDA)", icon: "lock-closed-outline" },
];

export default function DraftScreen() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [parties, setParties] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ content: string; title: string } | null>(null);

  const handleGenerate = async () => {
    if (!selectedType) {
      Alert.alert("Xato", "Hujjat turini tanlang.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Xato", "Hujjat tafsilotlarini kiriting.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post("/api/documents/draft", {
        documentType: selectedType,
        description: description.trim(),
        parties: parties.trim(),
      });
      setResult(data);
    } catch (e: any) {
      Alert.alert("Xato", e.message || "Hujjat yaratishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setSelectedType(null);
    setDescription("");
    setParties("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hujjat Yaratish</Text>
        {result && (
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Ionicons name="refresh" size={20} color={COLORS.gold} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!result ? (
          <>
            <Text style={styles.sectionLabel}>Hujjat turini tanlang</Text>
            <View style={styles.typeGrid}>
              {DOC_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeCard, selectedType === t.id && styles.typeCardSelected]}
                  onPress={() => setSelectedType(t.id)}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={22}
                    color={selectedType === t.id ? COLORS.gold : COLORS.muted}
                  />
                  <Text style={[styles.typeLabel, selectedType === t.id && styles.typeLabelSelected]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Tomonlar (ixtiyoriy)</Text>
            <TextInput
              style={styles.input}
              value={parties}
              onChangeText={setParties}
              placeholder='Masalan: "Azizbek Karimov va Nodira Yusupova"'
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.sectionLabel}>Tafsilotlar va shartlar</Text>
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="Shartnoma shartlari, muddati, miqdori va boshqa muhim ma'lumotlarni kiriting..."
              placeholderTextColor={COLORS.muted}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, (!selectedType || !description.trim() || loading) && styles.submitBtnDisabled]}
              onPress={handleGenerate}
              disabled={!selectedType || !description.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bg} size="small" />
              ) : (
                <>
                  <Ionicons name="document-text" size={18} color={COLORS.bg} />
                  <Text style={styles.submitBtnText}>Hujjat yaratish</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.resultHeader}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.gold} />
              <Text style={styles.resultTitle}>{result.title || "Hujjat tayyor"}</Text>
              <Text style={styles.resultSubtitle}>AI tomonidan yaratildi</Text>
            </View>

            <View style={styles.resultCard}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text style={styles.resultText}>{result.content}</Text>
              </ScrollView>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleReset}>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.gold} />
                <Text style={styles.actionBtnText}>Yangi hujjat</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 17, fontWeight: "600", marginLeft: 12 },
  resetBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "500", marginBottom: 10, marginTop: 8 },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  typeCard: {
    width: "47%",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: "#C9A22711",
  },
  typeLabel: { color: COLORS.muted, fontSize: 12, textAlign: "center", fontWeight: "500" },
  typeLabelSelected: { color: COLORS.gold },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    padding: 14,
    fontSize: 14,
    marginBottom: 16,
  },
  textArea: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    padding: 14,
    fontSize: 14,
    minHeight: 140,
    lineHeight: 22,
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: COLORS.bg, fontSize: 15, fontWeight: "700" },
  resultHeader: {
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
  },
  resultTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  resultSubtitle: { color: COLORS.muted, fontSize: 13 },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 400,
    marginBottom: 16,
  },
  resultText: { color: COLORS.text, fontSize: 13, lineHeight: 22 },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: { color: COLORS.gold, fontSize: 14, fontWeight: "600" },
});
