import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isUscEmail } from '@/lib/usc';
import { T, F } from '@/lib/theme';

const STEPS = [
  {
    n: '1',
    title: 'Verify with your USC email',
    body: 'One-time code sign-in — no passwords. You’re tied to your @usc.edu the whole way through.',
  },
  {
    n: '2',
    title: 'Browse the campus feed',
    body: 'Services, food, popups, sublets, goods — every listing from a real, signed-in USC student.',
  },
  {
    n: '3',
    title: 'Reveal contact',
    body: 'The seller sees your name, school, and year, and has 72 hours to approve. Then you connect and meet up.',
  },
];

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isUscEmail(email)) {
      setError('Use your @usc.edu email to sign in.');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      const rl =
        error.status === 429 ||
        (error as { code?: string }).code === 'over_email_send_rate_limit';
      setError(
        rl
          ? `${error.message} If you already got a code, tap “I already have a code.”`
          : 'Couldn’t send the code. Try again in a moment.',
      );
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: T.bg }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Cardinal hero */}
        <View
          style={{
            backgroundColor: T.cardinal,
            paddingTop: 84,
            paddingBottom: 44,
            paddingHorizontal: 28,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
          }}
        >
          <Text style={{ fontFamily: F.black, fontSize: 30, color: '#fff', letterSpacing: -1 }}>
            flipd<Text style={{ color: T.gold }}>.</Text>
          </Text>
          <Text
            style={{
              fontFamily: F.extrabold,
              fontSize: 38,
              lineHeight: 42,
              color: '#fff',
              letterSpacing: -1.2,
              marginTop: 24,
            }}
          >
            Buy from{'\n'}people who{'\n'}show up.
          </Text>
          <Text
            style={{
              fontFamily: F.medium,
              fontSize: 15,
              lineHeight: 21,
              color: 'rgba(255,255,255,0.85)',
              marginTop: 16,
            }}
          >
            Every buyer and seller verified with @usc.edu. No scams, no strangers, no ghosting.
          </Text>
        </View>

        {/* Three steps — mirrors the marketing site */}
        <View style={{ paddingHorizontal: 24, paddingTop: 32 }}>
          <Text
            style={{
              fontFamily: F.extrabold,
              fontSize: 22,
              color: T.ink,
              letterSpacing: -0.6,
              textAlign: 'center',
              marginBottom: 18,
            }}
          >
            Three steps. No DMs from strangers.
          </Text>
          {STEPS.map((s) => (
            <View
              key={s.n}
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#EFEDE9',
                padding: 20,
                marginBottom: 12,
                flexDirection: 'row',
                gap: 14,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: T.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 14 }}>{s.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: T.ink, letterSpacing: -0.3, marginBottom: 4 }}>
                  {s.title}
                </Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 19, color: T.muted }}>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Sign-in */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 }}>USC email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError('');
            }}
            placeholder="you@usc.edu"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={{
              backgroundColor: T.fieldbg,
              borderWidth: 1,
              borderColor: error ? T.danger : T.fieldbg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 16,
              fontSize: 16,
              fontFamily: F.medium,
              color: T.ink,
            }}
          />
          {error ? (
            <Text style={{ fontFamily: F.medium, color: T.danger, marginTop: 8, fontSize: 13.5 }}>{error}</Text>
          ) : null}
          <Pressable
            onPress={submit}
            disabled={busy}
            style={{
              backgroundColor: T.cardinal,
              borderRadius: 14,
              paddingVertical: 17,
              alignItems: 'center',
              marginTop: 16,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>
              {busy ? 'Sending…' : 'Send my code'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } })
            }
            style={{ marginTop: 18, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>I already have a code</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
