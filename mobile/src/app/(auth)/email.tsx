import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isUscEmail } from '@/lib/usc';
import { T, F } from '@/lib/theme';

export default function EmailScreen() {
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
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
        <Text style={{ fontFamily: F.black, fontSize: 30, color: T.ink, letterSpacing: -0.8 }}>
          What’s your USC email?
        </Text>
        <Text style={{ fontFamily: F.regular, fontSize: 15, color: T.muted, marginTop: 8, marginBottom: 28, lineHeight: 21 }}>
          We’ll email you a one-time code to sign in. No password.
        </Text>

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
          autoFocus
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
          <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{busy ? 'Sending…' : 'Send my code'}</Text>
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
    </KeyboardAvoidingView>
  );
}
