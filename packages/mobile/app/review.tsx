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
  danger: "#E05A5A",
  warning: "#E09A3A",
  success: "#5ACA8A",
};

type RiskItem = {
  clause: string;
  risk: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
};

type ReviewResult = {
  overallRisk: string;
  summary: string;
  risks: RiskItem[];
  recommendations: string[];
};

const severityColor = (s: string) => {
  if (s === "high") return COLORS.danger;
  if (s === "medium") return COLORS.warning;
  return COLORS.success;
};

const severityLabel = (s: string) => {
  if (s === "high") return "Yuqori xavf";
  if (s === "medium") return "O'rta xavf";
  return "Past xavf";
};

export default function ReviewScreen() {
  const router = useRouter();
  const [contractText, setContractText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const handleReview = async () => {
    if (!contractText.trim() || contractText.trim().length < 50) {
      Alert.alert("Xato", "Shartnoma matni kamida 50 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post("/api/contract/review", { contractText });
      setResult(data);
    } catch (e: any) {
      Alert.alert("Xato", e.message || "Shartnomani tahlil qilishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setContractText("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shartnoma Tahlili</Text>
        {result && (
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Ionicons name="refresh" size={20} color={COLORS.gold} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!result ? (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.gold} />
              <Text style={styles.infoTitle}>AI Shartnoma Tekshiruvi</Text>
              <Text style={styles.infoText}>
                Shartnoma matnini kiriting. AI xavf omillarini, muammoli bandlarni va tavsiyalarni aniqlaydi.
              </Text>
            </View>

            <Text style={styles.label}>Shartnoma matni</Text>
            <TextInput
              style={styles.textArea}
              value={contractText}
              onChangeText={setContractText}
              placeholder="Shartnoma matnini bu yerga kiriting yoki nusxalang..."
              placeholderTextColor={COLORS.muted}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{contractText.length} belgi</Text>

            <TouchableOpacity
              style={[styles.submitBtn, (!contractText.trim() || loading) && styles.submitBtnDisabled]}
              onPress={handleReview}
              disabled={!contractText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bg} size="small" />
              ) : (
                <>
                  <Ionicons name="scan" size={18} color={COLORS.bg} />
                  <Text style={styles.submitBtnText}>Tahlil qilish</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Overall Risk */}
            <View style={styles.overallCard}>
              <Text style={styles.overallLabel}>Umumiy xavf darajasi</Text>
              <Text style={[styles.overallValue, { color: severityColor(result.overallRisk) }]}>
                {severityLabel(result.overallRisk)}
              </Text>
            </View>

            {/* Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Xulosa</Text>
              <Text style={styles.sectionText}>{result.summary}</Text>
            </View>

            {/* Risk Items */}
            {result.risks && result.risks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Xavfli bandlar</Text>
                {result.risks.map((r, i) => (
                  <View key={i} style={[styles.riskCard, { borderLeftColor: severityColor(r.severity) }]}>
                    <View style={styles.riskHeader}>
                      <Text style={styles.riskClause}>{r.clause}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: severityColor(r.severity) + "22" }]}>
                        <Text style={[styles.riskBadgeText, { color: severityColor(r.severity) }]}>
                          {severityLabel(r.severity)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.riskText}>{r.risk}</Text>
                    <View style={styles.suggestionRow}>
                      <Ionicons name="bulb-outline" size={14} color={COLORS.gold} />
                      <Text style={styles.suggestionText}>{r.suggestion}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Recommendations */}
            {result.recommendations && result.recommendations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tavsiyalar</Text>
                {result.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recRow}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.gold} />
                    <Text style={styles.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.newBtn} onPress={handleReset}>
              <Text style={styles.newBtnText}>Yangi shartnoma tekshirish</Text>
            </TouchableOpacity>
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
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  infoTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  infoText: { color: COLORS.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  label: { color: COLORS.muted, fontSize: 13, marginBottom: 8, fontWeight: "500" },
  textArea: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    padding: 14,
    fontSize: 14,
    minHeight: 200,
    lineHeight: 22,
  },
  charCount: { color: COLORS.muted, fontSize: 12, textAlign: "right", marginTop: 4, marginBottom: 16 },
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
  overallCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overallLabel: { color: COLORS.muted, fontSize: 13, marginBottom: 6 },
  overallValue: { fontSize: 22, fontWeight: "800" },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.gold, fontSize: 14, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },
  sectionText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  riskCard: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginBottom: 14,
    gap: 6,
  },
  riskHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  riskClause: { color: COLORS.text, fontSize: 13, fontWeight: "600", flex: 1 },
  riskBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  riskBadgeText: { fontSize: 11, fontWeight: "700" },
  riskText: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  suggestionRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  suggestionText: { color: COLORS.text, fontSize: 13, flex: 1, lineHeight: 19 },
  recRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  recText: { color: COLORS.text, fontSize: 14, flex: 1, lineHeight: 20 },
  newBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  newBtnText: { color: COLORS.gold, fontSize: 15, fontWeight: "600" },
});
