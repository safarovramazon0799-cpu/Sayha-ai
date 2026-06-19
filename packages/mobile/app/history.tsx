import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
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

type Consultation = {
  id: string;
  title: string;
  messages: string; // JSON string
  category: string;
  createdAt: string | number;
};

type Document = {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: string | number;
};

type Tab = "consultations" | "documents";

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const DOC_TYPE_LABELS: Record<string, string> = {
  ijara: "Ijara",
  xizmat: "Xizmat",
  mehnat: "Mehnat",
  sotib_olish: "Sotib olish",
  sheriklik: "Sheriklik",
  maxfiylik: "NDA",
  shartnoma: "Shartnoma",
  ishonchnoma: "Ishonchnoma",
  davo_ariza: "Davo",
  ariza: "Ariza",
};

export default function HistoryScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("consultations");
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [cons, docs] = await Promise.all([
        api.get("/api/consultations"),
        api.get("/api/documents"),
      ]);
      setConsultations(Array.isArray(cons) ? cons : []);
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (e) {
      // silently fail on mobile history
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tarix</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "consultations" && styles.tabActive]}
          onPress={() => setTab("consultations")}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={16}
            color={tab === "consultations" ? COLORS.gold : COLORS.muted}
          />
          <Text style={[styles.tabText, tab === "consultations" && styles.tabTextActive]}>
            Maslahatlar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "documents" && styles.tabActive]}
          onPress={() => setTab("documents")}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={tab === "documents" ? COLORS.gold : COLORS.muted}
          />
          <Text style={[styles.tabText, tab === "documents" && styles.tabTextActive]}>
            Hujjatlar
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        >
          {tab === "consultations" && (
            <>
              {consultations.length === 0 ? (
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="Maslahatlar yo'q"
                  subtitle="AI bilan suhbat boshlang"
                  onPress={() => router.push("/chat")}
                  btnLabel="Suhbat boshlash"
                />
              ) : (
                consultations.map((c) => {
                  let lastMsg = "";
                  try {
                    const msgs = JSON.parse(c.messages);
                    if (Array.isArray(msgs) && msgs.length > 0) {
                      const ai = msgs.filter((m: any) => m.role === "assistant").pop();
                      lastMsg = ai?.content ?? "";
                    }
                  } catch {}
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.card}
                      onPress={() => toggleExpand(c.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardHeader}>
                        <Ionicons name="chatbubble-outline" size={16} color={COLORS.gold} />
                        <Text style={styles.cardDate}>{formatDate(String(c.createdAt))}</Text>
                        <Ionicons
                          name={expandedId === c.id ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={COLORS.muted}
                        />
                      </View>
                      <Text style={styles.cardQuestion} numberOfLines={expandedId === c.id ? undefined : 2}>
                        {c.title}
                      </Text>
                      {expandedId === c.id && lastMsg ? (
                        <View style={styles.answerBox}>
                          <Text style={styles.answerText}>{lastMsg}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {tab === "documents" && (
            <>
              {documents.length === 0 ? (
                <EmptyState
                  icon="document-text-outline"
                  title="Hujjatlar yo'q"
                  subtitle="Yangi hujjat yarating"
                  onPress={() => router.push("/draft")}
                  btnLabel="Hujjat yaratish"
                />
              ) : (
                documents.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.card}
                    onPress={() => toggleExpand(d.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.docTypeBadge}>
                        <Text style={styles.docTypeBadgeText}>
                          {DOC_TYPE_LABELS[d.type] || d.type}
                        </Text>
                      </View>
                      <Text style={styles.cardDate}>{formatDate(String(d.createdAt))}</Text>
                      <Ionicons
                        name={expandedId === d.id ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={COLORS.muted}
                      />
                    </View>
                    <Text style={styles.cardQuestion} numberOfLines={expandedId === d.id ? undefined : 1}>
                      {d.title}
                    </Text>
                    {expandedId === d.id && (
                      <View style={styles.answerBox}>
                        <Text style={styles.answerText}>{d.content}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  onPress,
  btnLabel,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  btnLabel: string;
}) {
  return (
    <View style={emptyStyles.container}>
      <Ionicons name={icon as any} size={48} color={COLORS.border} />
      <Text style={emptyStyles.title}>{title}</Text>
      <Text style={emptyStyles.subtitle}>{subtitle}</Text>
      <TouchableOpacity style={emptyStyles.btn} onPress={onPress}>
        <Text style={emptyStyles.btnText}>{btnLabel}</Text>
      </TouchableOpacity>
    </View>
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
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: COLORS.gold },
  tabText: { color: COLORS.muted, fontSize: 14, fontWeight: "500" },
  tabTextActive: { color: COLORS.gold },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardDate: { flex: 1, color: COLORS.muted, fontSize: 12 },
  cardQuestion: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  answerBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    marginTop: 4,
  },
  answerText: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  docTypeBadge: {
    backgroundColor: COLORS.gold + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  docTypeBadgeText: { color: COLORS.gold, fontSize: 11, fontWeight: "700" },
});

const emptyStyles = StyleSheet.create({
  container: { alignItems: "center", paddingTop: 60, gap: 10 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  subtitle: { color: COLORS.muted, fontSize: 14 },
  btn: {
    marginTop: 12,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  btnText: { color: COLORS.bg, fontSize: 14, fontWeight: "700" },
});
