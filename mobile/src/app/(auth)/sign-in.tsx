import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isUscEmail } from '@/lib/usc';
import { T } from '@/lib/theme';

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
      // Mirror the web app's working call. emailRedirectTo selects the same
      // email template context that reliably delivers on the web.
      options: { shouldCreateUser: true, emailRedirectTo: 'https://flipdcampus.com/auth/callback' },
    });
    setBusy(false);
    if (error) {
      const rl =
        error.status === 429 ||
        (error as { code?: string }).code === 'over_email_send_rate_limit';
      setError(
        rl
          ? 'Too many emails just now — wait a minute, or tap “I already have a code.”'
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
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 0 }}>
        {/* Brand hero */}
        <Text style={{ fontSize: 52, fontWeight: '900', color: T.ink, letterSpacing: -1.5 }}>
          flipd<Text style={{ color: T.cardinal }}>.</Text>
        </Text>
        <Text style={{ fontSize: 17, color: T.ink, marginTop: 10, fontWeight: '600' }}>
          The USC marketplace.
        </Text>
        <Text style={{ fontSize: 15, color: T.muted, marginTop: 4, marginBottom: 32, lineHeight: 21 }}>
          Buy and sell with people who show up. Verified with your @usc.edu — no scams, no strangers.
        </Text>

        {/* Email */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, marginBottom: 8 }}>USC email</Text>
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
            backgroundColor: T.surface,
            borderWidth: 1,
            borderColor: error ? T.danger : T.rule,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 15,
            fontSize: 16,
            color: T.ink,
          }}
        />
        {error ? <Text style={{ color: T.danger, marginTop: 8, fontSize: 13.5 }}>{error}</Text> : null}

        {/* CTA */}
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{
            backgroundColor: T.cardinal,
            borderRadius: 14,
            paddingVertical: 17,
            alignItems: 'center',
            marginTop: 18,
            opacity: busy ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
            {busy ? 'Sending…' : 'Send my code'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } })
          }
          style={{ marginTop: 18, alignItems: 'center' }}
        >
          <Text style={{ color: T.muted, fontSize: 14.5 }}>
            I already have a code
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
