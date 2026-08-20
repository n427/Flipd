import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormScroll } from '@/components/FormScroll';
import { ScreenHeader } from '@/components/ScreenHeader';
import { canConfirmDeletion, requestAccountDeletion } from '@/lib/accountDeletion';
import { supabase } from '@/lib/supabase';
import { F, S, T } from '@/lib/theme';

export default function DeleteAccount() {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const confirmed = canConfirmDeletion(confirmation);

  const removeAccount = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await requestAccountDeletion();
      // The server has already revoked the identity. Clear only this device's
      // persisted session so the auth watcher returns to sign-in immediately.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account deletion failed safely. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <ScreenHeader title="Delete account" />
      <FormScroll
        contentContainerStyle={{
          paddingHorizontal: S.gutter,
          paddingBottom: S.screenBottom,
        }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7 }}>
          Permanently delete your account
        </Text>
        <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 23, color: T.muted, marginTop: 10 }}>
          This removes your profile, contact details, listings, photos, notification tokens, and access to Flipd. This cannot be undone.
        </Text>

        <View style={{ backgroundColor: T.fieldbg, borderRadius: 14, padding: 16, marginTop: 22, gap: 8 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>What may remain</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 21, color: '#333' }}>
            Flipd may retain anonymized transaction, message, and moderation records when needed for safety, fraud prevention, disputes, or legal obligations. They will no longer show your name, email, phone, social handles, avatar, or device token.
          </Text>
        </View>

        <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink, marginTop: 26, marginBottom: 8 }}>
          Type DELETE to confirm
        </Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          editable={!submitting}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Type DELETE to confirm account deletion"
          style={{
            borderWidth: 1.5,
            borderColor: confirmed ? T.danger : T.rule,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontFamily: F.semibold,
            fontSize: 16,
            color: T.ink,
          }}
        />

        {error ? (
          <Text accessibilityRole="alert" style={{ fontFamily: F.medium, fontSize: 13.5, lineHeight: 19, color: T.danger, marginTop: 12 }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={removeAccount}
          disabled={!confirmed || submitting}
          accessibilityRole="button"
          accessibilityLabel="Permanently delete account"
          accessibilityState={{ disabled: !confirmed || submitting, busy: submitting }}
          style={{
            minHeight: 50,
            borderRadius: 13,
            backgroundColor: T.danger,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 22,
            opacity: !confirmed || submitting ? 0.5 : 1,
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: '#fff' }}>Delete my account</Text>
          )}
        </Pressable>
      </FormScroll>
    </SafeAreaView>
  );
}
