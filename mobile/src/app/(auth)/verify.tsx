import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { T, F } from '@/lib/theme';

const RESEND_SECONDS = 30;

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resend countdown so people don't spam requests (each new code invalidates
  // the previous one — the #1 cause of "my code doesn't work").
  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const valid = /^\d{6,8}$/.test(code.trim());

  const submit = async () => {
    if (!valid) {
      setError('Codes are 6 to 8 digits. Paste the whole thing.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    let error;
    try {
      ({ error } = await supabase.auth.verifyOtp({ email: String(email), token: code.trim(), type: 'email' }));
    } catch {
      setBusy(false);
      setError('Couldn’t reach the server. Check your connection and try again.');
      return;
    }
    setBusy(false);
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      const badCode =
        error.status === 401 || error.status === 403 || msg.includes('invalid') || msg.includes('expired') || msg.includes('token');
      setError(
        badCode
          ? 'That code didn’t work. It may have expired, or a newer code replaced it. Resend and use the latest one.'
          : 'Something went wrong. Try again in a moment.',
      );
      return;
    }
    // On success, onAuthStateChange fires and the root gate routes to (tabs).
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError('');
    setNotice('');
    const { error } = await supabase.auth.signInWithOtp({ email: String(email), options: { shouldCreateUser: true } });
    if (error) {
      const rl = error.status === 429 || (error as { code?: string }).code === 'over_email_send_rate_limit';
      setError(rl ? 'Give it a minute before requesting another code.' : 'Couldn’t resend. Try again in a moment.');
      return;
    }
    setCode('');
    setCooldown(RESEND_SECONDS);
    setNotice('New code sent. Use the most recent one.');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Top bar: Back + step indicator, full progress bar */}
      <View style={{ paddingHorizontal: 28, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={20} color={T.ink} />
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>Back</Text>
          </Pressable>
          <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.muted }}>Step 2 of 2</Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: T.rule, marginTop: 16, overflow: 'hidden' }}>
          <View style={{ width: '100%', height: '100%', borderRadius: 2, backgroundColor: T.cardinal }} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontFamily: F.black, fontSize: 30, color: T.ink, letterSpacing: -0.9, lineHeight: 36 }}>
            Enter your code
          </Text>
          <Text style={{ fontFamily: F.regular, color: T.muted, fontSize: 15.5, marginTop: 10, marginBottom: 26, lineHeight: 22 }}>
            Sent to <Text style={{ fontFamily: F.bold, color: T.ink }}>{String(email)}</Text>.{' '}
            <Text onPress={() => router.back()} style={{ fontFamily: F.bold, color: T.cardinal }}>Change</Text>
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Verification code</Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: T.muted }}>{code.length}/8</Text>
          </View>
          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, 8));
              if (error) setError('');
              if (notice) setNotice('');
            }}
            placeholder="000000"
            placeholderTextColor="#C9C6C0"
            keyboardType="number-pad"
            returnKeyType="go"
            autoFocus
            onSubmitEditing={submit}
            style={{
              backgroundColor: T.fieldbg,
              borderWidth: 1.5,
              borderColor: error ? T.danger : T.rule,
              borderRadius: 14,
              paddingHorizontal: 18,
              paddingVertical: 18,
              fontSize: 28,
              fontFamily: F.bold,
              letterSpacing: 8,
              textAlign: 'center',
              color: T.ink,
            }}
          />
          <Text style={{ fontFamily: F.regular, fontSize: 13, color: error ? T.danger : T.muted, marginTop: 8, lineHeight: 18 }}>
            {error || notice || 'Codes are 6 to 8 digits. Paste the whole thing.'}
          </Text>

          <Pressable
            onPress={submit}
            disabled={busy || !valid}
            style={{
              backgroundColor: T.cardinal,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
              marginTop: 20,
              opacity: busy || !valid ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{busy ? 'Verifying…' : 'Verify'}</Text>
          </Pressable>

          {/* Resend with countdown */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 }}>
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted }}>Didn’t get it?</Text>
            <Pressable onPress={resend} disabled={cooldown > 0} hitSlop={6}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: cooldown > 0 ? T.muted : T.cardinal }}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingBottom: 8 }}>
        <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>Code expires in 10 minutes</Text>
        <Pressable onPress={() => Linking.openURL('mailto:support@flipdcampus.com')} hitSlop={6}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.cardinal }}>Need help?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
