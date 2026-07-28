import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isUscEmail } from '@/lib/usc';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isUscEmail(email)) {
      setError('Enter your @usc.edu email.');
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
          ? 'Too many emails just now — wait a minute, or tap “Already have a code?”'
          : 'Could not send the code. Try again.',
      );
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: '800' }}>flipd.</Text>
      <Text style={{ color: '#666' }}>Sign in with your USC email.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@usc.edu"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 }}
      />
      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Sending…' : 'Send code'}</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } })
        }
      >
        <Text style={{ color: '#111', textAlign: 'center', textDecorationLine: 'underline' }}>
          Already have a code?
        </Text>
      </Pressable>
    </View>
  );
}
