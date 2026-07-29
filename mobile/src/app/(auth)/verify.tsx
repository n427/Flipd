import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { T } from '@/lib/theme';

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6,8}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({
      email: String(email),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setError('That code is invalid or expired — request a new one.');
      return;
    }
    // On success, onAuthStateChange fires and the root gate routes to (tabs).
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, backgroundColor: T.bg }}>
      <Text style={{ fontSize: 30, fontWeight: '900', color: T.ink, letterSpacing: -0.5 }}>
        Check your email
      </Text>
      <Text style={{ color: T.muted, fontSize: 15, marginTop: 8, marginBottom: 28, lineHeight: 21 }}>
        We sent a code to{'\n'}<Text style={{ color: T.ink, fontWeight: '700' }}>{String(email)}</Text>
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 8));
          if (error) setError('');
        }}
        placeholder="000000"
        placeholderTextColor={T.rule}
        keyboardType="number-pad"
        returnKeyType="go"
        onSubmitEditing={submit}
        style={{
          backgroundColor: T.surface,
          borderWidth: 1,
          borderColor: error ? T.danger : T.rule,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 16,
          fontSize: 26,
          fontWeight: '700',
          letterSpacing: 8,
          textAlign: 'center',
          color: T.ink,
        }}
      />
      {error ? <Text style={{ color: T.danger, marginTop: 8, fontSize: 13.5 }}>{error}</Text> : null}
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
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{busy ? 'Verifying…' : 'Verify'}</Text>
      </Pressable>
    </View>
  );
}
