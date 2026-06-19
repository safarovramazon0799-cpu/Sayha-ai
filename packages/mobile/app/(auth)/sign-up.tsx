import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient, captureToken } from "../../lib/auth";

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setError("");
    if (password.length < 8) {
      setError("Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    setLoading(true);
    const result = await authClient.signUp.email(
      { name, email, password },
      { onSuccess: captureToken }
    );
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Xatolik yuz berdi.");
    } else {
      router.replace("/");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>S</Text>
            </View>
            <Text style={styles.logoText}>Sayha AI</Text>
          </View>

          <Text style={styles.title}>Hisob yarating</Text>
          <Text style={styles.subtitle}>Bepul ro'yxatdan o'ting</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Ism familiya</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Abdullayev Akbar" placeholderTextColor="#4A4D6A" />

            <Text style={styles.label}>Email manzil</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              placeholder="siz@example.com" placeholderTextColor="#4A4D6A"
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Parol</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              placeholder="Kamida 8 belgi" placeholderTextColor="#4A4D6A" secureTextEntry />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp} disabled={loading}>
              {loading ? <ActivityIndicator color="#0D0F1A" /> : <Text style={styles.buttonText}>Ro'yxatdan o'tish</Text>}
            </TouchableOpacity>

            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity style={styles.linkBtn}>
                <Text style={styles.linkText}>Hisobingiz bormi? <Text style={styles.linkHighlight}>Kirish</Text></Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0F1A' },
  container: { padding: 24, paddingTop: 48 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 48 },
  logoBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#C9A227', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 20, fontWeight: 'bold', color: '#0D0F1A' },
  logoText: { fontSize: 22, fontWeight: 'bold', color: '#F0EDE4' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#F0EDE4', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#9B97A8', marginBottom: 32 },
  form: { gap: 8 },
  label: { fontSize: 13, color: '#9B97A8', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: '#1A1D33', borderWidth: 1, borderColor: '#2A2D4A',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#F0EDE4', fontSize: 15,
  },
  errorBox: {
    backgroundColor: 'rgba(231,76,60,0.1)', borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.3)', borderRadius: 12, padding: 12, marginTop: 8,
  },
  errorText: { color: '#E74C3C', fontSize: 13 },
  button: { backgroundColor: '#C9A227', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { backgroundColor: '#2A2D4A' },
  buttonText: { color: '#0D0F1A', fontWeight: 'bold', fontSize: 16 },
  linkBtn: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#9B97A8', fontSize: 14 },
  linkHighlight: { color: '#C9A227', fontWeight: '600' },
});
