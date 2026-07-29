import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isUscEmail } from '@/lib/usc';
import { T, F } from '@/lib/theme';

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
      {/* Cardinal hero — the brand moment */}
      <View
        style={{
          backgroundColor: T.cardinal,
          paddingTop: 88,
          paddingBottom: 56,
          paddingHorizontal: 28,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 34, color: '#fff', letterSpacing: -1 }}>
          flipd<Text style={{ color: T.gold }}>.</Text>
        </Text>
        <Text
          style={{
            fontFamily: F.extrabold,
            fontSize: 40,
            lineHeight: 44,
            color: '#fff',
            letterSpacing: -1.2,
            marginTop: 28,
          }}
        >
          Buy from{'\n'}people who{'\n'}show up.
        </Text>
        <Text
          style={{
            fontFamily: F.medium,
            fontSize: 15.5,
            lineHeight: 22,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 18,
          }}
        >
          Every buyer and seller verified with @usc.edu. No scams, no strangers, no ghosting.
        </Text>
      </View>

      {/* Form */}
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 34 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 }}>
          USC email
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
          <Text style={{ fontFamily: F.medium, color: T.danger, marginTop: 8, fontSize: 13.5 }}>
            {error}
          </Text>
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
          style={{ marginTop: 20, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>
            I already have a code
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
