import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { goBack } from '@/lib/nav';
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
      setError('Use your @usc.edu or @alumni.usc.edu email to sign in.');
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
          ? 'You’ve requested a few codes. If you already got one, tap “I already have a code.”'
          : 'Couldn’t send the code. Try again in a moment.',
      );
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Top bar: Back + step indicator, progress bar under */}
      <View style={{ paddingHorizontal: 28, paddingTop: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => goBack('/(auth)/sign-in')} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={20} color={T.ink} />
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>Back</Text>
          </Pressable>
          <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.muted }}>Step 1 of 2</Text>
        </View>
        {/* Progress bar — step 1 of 2 filled halfway */}
        <View style={{ height: 4, borderRadius: 2, backgroundColor: T.rule, marginTop: 16, overflow: 'hidden' }}>
          <View style={{ width: '50%', height: '100%', borderRadius: 2, backgroundColor: T.cardinal }} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontFamily: F.black, fontSize: 30, color: T.ink, letterSpacing: -0.9, lineHeight: 36 }}>
            What’s your USC email?
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 15.5, color: T.muted, marginTop: 10, marginBottom: 28, lineHeight: 22 }}>
            We’ll email you a one-time code that expires in 10 minutes. No password.
          </Text>

          {/* Field with label + Required tag */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Email address</Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: T.muted }}>Required</Text>
          </View>
          <TextInput
            accessibilityLabel="USC email address"
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
            // Without an explicit type iOS guesses this is a credential field
            // and renders the placeholder with wide AutoFill letter-spacing.
            // 'username' is the right hint for passwordless email sign-in and
            // still lets the keychain suggest the address.
            textContentType="username"
            autoComplete="email"
            style={{
              backgroundColor: T.fieldbg,
              borderWidth: 1.5,
              borderColor: error ? T.danger : T.rule,
              borderRadius: 14,
              paddingHorizontal: 18,
              paddingVertical: 17,
              fontSize: 16,
              fontFamily: F.medium,
              color: T.ink,
            }}
          />
          <Text accessibilityRole={error ? 'alert' : undefined} style={{ fontFamily: F.regular, fontSize: 13, color: error ? T.danger : T.muted, marginTop: 8, lineHeight: 18 }}>
            {error || 'Students use @usc.edu. Alumni can use @alumni.usc.edu.'}
          </Text>

          <Pressable
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            style={{
              backgroundColor: T.cardinal,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
              marginTop: 20,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{busy ? 'Sending…' : 'Send my code'}</Text>
          </Pressable>

          {/* Secondary as an outlined full-width button, matching the reference */}
          <Pressable
            onPress={() => {
              // A code is tied to an email, so we need one before the code screen.
              if (!isUscEmail(email)) {
                setError('Enter your USC email first.');
                return;
              }
              router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
            }}
            accessibilityRole="button"
            style={{
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: T.rule,
              paddingVertical: 17,
              alignItems: 'center',
              marginTop: 12,
            }}
          >
            <Text style={{ fontFamily: F.bold, color: T.ink, fontSize: 15.5 }}>I already have a code</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
