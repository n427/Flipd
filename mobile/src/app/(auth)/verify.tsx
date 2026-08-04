import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { VERIFY_HELP, SUPPORT_EMAIL } from '@/lib/legal';
import { T, F } from '@/lib/theme';

const RESEND_SECONDS = 30;

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [helpOpen, setHelpOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitting = useRef(false); // synchronous double-submit guard

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
    // Synchronous re-entry guard. `busy` is async state, so a fast double-tap
    // or Enter+click can fire verifyOtp twice with the same code — the first
    // call consumes the OTP, the second returns "expired or invalid". This ref
    // blocks the second call immediately.
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let error;
    try {
      // Build params as an explicit typed object. Passing the literal inline was
      // arriving at the API without `type` ("Verify requires a verification
      // type") under the React Compiler on web — this keeps the field intact.
      const params: { email: string; token: string; type: 'email' } = {
        email: String(email),
        token: code.trim(),
        type: 'email',
      };
      ({ error } = await supabase.auth.verifyOtp(params));
    } catch {
      submitting.current = false;
      setBusy(false);
      setError('Couldn’t reach the server. Check your connection and try again.');
      return;
    }
    setBusy(false);
    if (error) {
      submitting.current = false;
      // If a prior (duplicate) call already logged us in, ignore the stale error.
      const { data } = await supabase.auth.getSession();
      if (data.session) return; // onAuthStateChange will route us
      const msg = error.message?.toLowerCase() ?? '';
      const badCode =
        error.status === 401 || error.status === 403 || msg.includes('invalid') || msg.includes('expired') || msg.includes('token');
      setError(
        badCode
          ? 'That code didn’t work. Request a new one and enter the latest code.'
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
      <View style={{ paddingHorizontal: 28, paddingTop: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => goBack('/(auth)/email')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
            <Text onPress={() => goBack('/(auth)/email')} style={{ fontFamily: F.bold, color: T.cardinal }}>Change</Text>
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
            // Lets iOS/Android offer the emailed code straight from the
            // notification instead of making people retype it.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 12, paddingBottom: 28 }}>
        <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>Code expires in 10 minutes</Text>
        <Pressable onPress={() => setHelpOpen(true)} hitSlop={6}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.cardinal }}>Need help?</Text>
        </Pressable>
      </View>

      {/* Help drawer — answers the common blockers inline. Leaving for Mail
          mid-verification is the one moment someone is least able to come
          back, so email is the last resort rather than the only option. */}
      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} contentStyle={{ paddingHorizontal: 24 }}>
        <SheetGrabber />
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>
              Need help?
            </Text>
            <Pressable onPress={() => setHelpOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={T.muted} />
            </Pressable>
          </View>

          {VERIFY_HELP.map((h, i) => (
            <View key={h.q} style={{ marginTop: i === 0 ? 0 : 16 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: T.ink, marginBottom: 4 }}>{h.q}</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, lineHeight: 20 }}>{h.a}</Text>
            </View>
          ))}

          <Pressable
            onPress={() => {
              setHelpOpen(false);
              Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
            style={{
              marginTop: 24,
              backgroundColor: T.fieldbg,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>Email support</Text>
          </Pressable>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
