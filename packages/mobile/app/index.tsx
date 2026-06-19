import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { authClient, clearToken } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBar } from "expo-status-bar";

const menuItems = [
  { route: "/chat", icon: "⚖️", title: "Huquqiy Maslahat", desc: "AI asosida maslahat oling", color: "#C9A227" },
  { route: "/review", icon: "📋", title: "Shartnoma Tahlili", desc: "Risklarni aniqlang", color: "#2196F3" },
  { route: "/draft", icon: "📝", title: "Hujjat Yaratish", desc: "Rasmiy hujjat tayyorlang", color: "#4CAF50" },
  { route: "/history", icon: "📂", title: "Tarix", desc: "Oldingi murojaatlar", color: "#9C27B0" },
];

export default function HomeScreen() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const { data: consultations } = useQuery({
    queryKey: ["consultations"],
    queryFn: async () => { const r = await api.consultations.$get(); return r.json(); },
  });
  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => { const r = await api.documents.$get(); return r.json(); },
  });

  const handleSignOut = async () => {
    await authClient.signOut();
    await clearToken();
    router.replace("/(auth)/sign-in");
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Assalomu alaykum 👋</Text>
            <Text style={s.name}>{session?.user?.name?.split(" ")[0]}</Text>
          </View>
          <View style={s.logoBox}>
            <Text style={s.logoLetter}>S</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statVal}>{consultations?.length ?? 0}</Text>
            <Text style={s.statLabel}>Maslahatlar</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statVal}>{documents?.length ?? 0}</Text>
            <Text style={s.statLabel}>Hujjatlar</Text>
          </View>
        </View>

        {/* Menu */}
        <Text style={s.sectionTitle}>XIZMATLAR</Text>
        {menuItems.map((item, i) => (
          <TouchableOpacity key={i} style={s.menuCard} onPress={() => router.push(item.route as any)}>
            <View style={[s.menuIcon, { backgroundColor: item.color + '20' }]}>
              <Text style={{ fontSize: 22 }}>{item.icon}</Text>
            </View>
            <View style={s.menuText}>
              <Text style={s.menuTitle}>{item.title}</Text>
              <Text style={s.menuDesc}>{item.desc}</Text>
            </View>
            <Text style={[s.menuArrow, { color: item.color }]}>→</Text>
          </TouchableOpacity>
        ))}

        {/* Disclaimer */}
        <View style={s.disclaimerBox}>
          <Text style={s.disclaimer}>
            ⚠️ Sayha AI taqdim etgan ma'lumotlar faqat tanishish xarakteriga ega. Rasmiy advokat maslahatini o'rnini bosmaydi.
          </Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={s.signOut} onPress={handleSignOut}>
          <Text style={s.signOutText}>Chiqish</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0F1A' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { color: '#9B97A8', fontSize: 14 },
  name: { color: '#F0EDE4', fontSize: 24, fontWeight: 'bold' },
  logoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#C9A227', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 22, fontWeight: 'bold', color: '#0D0F1A' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#1A1D33', borderWidth: 1, borderColor: '#2A2D4A', borderRadius: 16, padding: 16 },
  statVal: { color: '#C9A227', fontSize: 28, fontWeight: 'bold' },
  statLabel: { color: '#9B97A8', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#9B97A8', fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 12 },
  menuCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1A1D33', borderWidth: 1, borderColor: '#2A2D4A',
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  menuIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1 },
  menuTitle: { color: '#F0EDE4', fontSize: 16, fontWeight: '600', marginBottom: 3 },
  menuDesc: { color: '#9B97A8', fontSize: 13 },
  menuArrow: { fontSize: 18, fontWeight: 'bold' },
  disclaimerBox: {
    backgroundColor: '#1A1D33', borderWidth: 1, borderColor: '#2A2D4A',
    borderRadius: 16, padding: 14, marginTop: 16, marginBottom: 16,
  },
  disclaimer: { color: '#9B97A8', fontSize: 11, lineHeight: 18, fontStyle: 'italic' },
  signOut: { borderWidth: 1, borderColor: '#2A2D4A', borderRadius: 12, padding: 14, alignItems: 'center' },
  signOutText: { color: '#9B97A8', fontSize: 14 },
});
