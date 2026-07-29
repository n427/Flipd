import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { T, F } from '@/lib/theme';

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
      <Text style={{ fontFamily: F.extrabold, fontSize: 30, color: T.ink, letterSpacing: -0.8 }}>
        Check your email
      </Text>
      <Text style={{ fontFamily: F.regular, color: T.muted, fontSize: 15, marginTop: 8, marginBottom: 28, lineHeight: 21 }}>
        We sent a code to{'\n'}<Text style={{ fontFamily: F.bold, color: T.ink }}>{String(email)}</Text>
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 8));
          if (error) setError('');
        }}
        placeholder="000000"
        placeholderTextColor="#C9C6C0"
        keyboardType="number-pad"
        returnKeyType="go"
        onSubmitEditing={submit}
        style={{
          backgroundColor: T.fieldbg,
          borderWidth: 1,
          borderColor: error ? T.danger : T.fieldbg,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 16,
          fontSize: 28,
          fontFamily: F.bold,
          letterSpacing: 10,
          textAlign: 'center',
          color: T.ink,
        }}
      />
      {error ? <Text style={{ fontFamily: F.medium, color: T.danger, marginTop: 8, fontSize: 13.5 }}>{error}</Text> : null}
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
        <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{busy ? 'Verifying…' : 'Verify'}</Text>
      </Pressable>
    </View>
  );
}
