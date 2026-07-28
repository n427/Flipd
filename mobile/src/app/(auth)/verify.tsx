import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

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
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>Enter your code</Text>
      <Text style={{ color: '#666' }}>Sent to {String(email)}</Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="123456"
        keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 20, letterSpacing: 4 }}
      />
      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Verifying…' : 'Verify'}</Text>
      </Pressable>
    </View>
  );
}
