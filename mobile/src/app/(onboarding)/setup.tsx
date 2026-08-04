import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { FormScroll } from '@/components/FormScroll';
import { useSession } from '@/lib/session';
import { fetchMyProfile, uploadAvatar, completeOnboarding } from '@/lib/listings';
import { T, F } from '@/lib/theme';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];

// Signup attribution. `id` must match the CHECK constraint in migration 022 and
// HEARD_FROM in the web app's /api/me route; `label` is display copy only.
// `detailPrompt` opts a channel into the follow-up box — omitted where a
// free-text answer would be meaningless ("Instagram").
const CHANNELS: readonly { id: string; label: string; detailPrompt?: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'friend', label: 'Friend / word of mouth', detailPrompt: 'Who told you about Flipd? (optional)' },
  { id: 'flyer', label: 'Flyer or poster' },
  { id: 'class_club', label: 'Class or club', detailPrompt: 'Which one? (optional)' },
  { id: 'other', label: 'Other', detailPrompt: "How'd you find us? (optional)" },
];

const METHODS = [
  { id: 'instagram', label: 'Instagram handle', placeholder: '@you.sc' },
  { id: 'phone', label: 'Phone number', placeholder: '(213) 555-0100' },
  { id: 'email', label: 'Email', placeholder: 'you@usc.edu' },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

export default function Setup() {
  const router = useRouter();
  const { user, refreshOnboarded } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [year, setYear] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [heardId, setHeardId] = useState<string | null>(null);
  const [heardDetail, setHeardDetail] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [contacts, setContacts] = useState<Record<MethodId, string>>({ instagram: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill from the profile row the signup trigger created, and bounce anyone
  // who already finished. The gate in _layout also checks this, but a user can
  // land here directly after sign-in before that effect settles.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchMyProfile(user.id)
      .then((p) => {
        if (!alive) return;
        const hasContact = Boolean(p?.contact_instagram || p?.contact_phone || p?.contact_email);
        if (p?.display_name && hasContact) {
          router.replace('/(tabs)/feed');
          return;
        }
        if (p?.display_name) setName(p.display_name);
        if (p?.avatar_url) setAvatar(p.avatar_url);
        // The verified sign-in address is the sensible default contact email.
        const email = p?.contact_email ?? user.email ?? '';
        if (email) setContacts((c) => ({ ...c, email }));
        setChecking(false);
      })
      .catch(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [user, router]);

  const heardChannel = CHANNELS.find((c) => c.id === heardId);

  // Switching to a channel with no detail box would otherwise submit an
  // orphaned answer ("Sarah" filed under Instagram), so drop it on change.
  const pickChannel = (id: string) => {
    setHeardId(id);
    if (!CHANNELS.find((c) => c.id === id)?.detailPrompt) setHeardDetail('');
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      setAvatar(await uploadAvatar(res.assets[0].uri));
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const next = () => {
    if (!name.trim()) {
      setError('Your name is required.');
      return;
    }
    if (!year) {
      setError('Pick your class year.');
      return;
    }
    if (!heardId) {
      setError('Let us know how you heard about Flipd.');
      return;
    }
    setError('');
    setStep(2);
  };

  const finish = async () => {
    if (!METHODS.some((m) => contacts[m.id].trim())) {
      setError('Add at least one way to reach you.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await completeOnboarding({
        display_name: name.trim(),
        class_year: year!,
        school_unit: unit,
        heard_from: heardId!,
        heard_from_detail: heardDetail.trim() || null,
        contact_instagram: contacts.instagram.trim() || null,
        contact_phone: contacts.phone.trim() || null,
        contact_email: contacts.email.trim() || null,
      });
      // Re-read before navigating: the watcher would otherwise still see
      // onboarded === 'no' and bounce us straight back here.
      await refreshOnboarded();
      router.replace('/(tabs)/feed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FormScroll contentContainerStyle={{ padding: 24, paddingTop: 32, paddingBottom: 40 }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: T.ink, letterSpacing: -0.9 }}>
          flipd<Text style={{ color: T.gold }}>.</Text>
        </Text>

        {step === 1 ? (
          <>
            <Text style={heading}>Who are you?</Text>
            <Text style={sub}>This is what other Trojans see when you buy or sell.</Text>

            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <Pressable onPress={pickAvatar} disabled={uploading}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} contentFit="cover" />
                ) : (
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: T.fieldbg,
                      borderWidth: 1.5,
                      borderColor: T.rule,
                      borderStyle: 'dashed',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: F.regular, fontSize: 26, color: T.muted }}>+</Text>
                  </View>
                )}
                {uploading ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 40,
                      backgroundColor: 'rgba(0,0,0,0.35)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </Pressable>
              <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 8 }}>Photo (optional)</Text>
            </View>

            <Text style={label}>Full name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={T.muted}
              style={field}
            />

            <Text style={label}>Class year</Text>
            <View style={row}>
              {YEARS.map((y) => (
                <Pressable key={y} onPress={() => setYear(y)} style={chip(year === y)}>
                  <Text style={chipText(year === y)}>{y}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={label}>School or major (optional)</Text>
            <View style={row}>
              {UNITS.map((u) => (
                <Pressable key={u} onPress={() => setUnit(unit === u ? null : u)} style={chip(unit === u)}>
                  <Text style={chipText(unit === u)}>{u}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={label}>How&apos;d you hear about Flipd?</Text>
            <View style={row}>
              {CHANNELS.map((c) => (
                <Pressable key={c.id} onPress={() => pickChannel(c.id)} style={chip(heardId === c.id)}>
                  <Text style={chipText(heardId === c.id)}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            {heardChannel?.detailPrompt ? (
              <TextInput
                value={heardDetail}
                onChangeText={setHeardDetail}
                placeholder={heardChannel.detailPrompt}
                placeholderTextColor={T.muted}
                style={field}
              />
            ) : null}

            {error ? <Text style={errText}>{error}</Text> : null}
            <Pressable onPress={next} style={primaryBtn}>
              <Text style={primaryText}>Continue</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={heading}>How do buyers reach you?</Text>
            <Text style={sub}>Shared only after you approve a request. You set this once.</Text>

            {METHODS.map((m) => (
              <View key={m.id}>
                <Text style={label}>{m.label}</Text>
                <TextInput
                  value={contacts[m.id]}
                  onChangeText={(t) => setContacts((c) => ({ ...c, [m.id]: t }))}
                  placeholder={m.placeholder}
                  placeholderTextColor={T.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={m.id === 'phone' ? 'phone-pad' : m.id === 'email' ? 'email-address' : 'default'}
                  style={field}
                />
              </View>
            ))}

            {error ? <Text style={errText}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setStep(1);
                  setError('');
                }}
                disabled={saving}
                style={{ borderRadius: 14, paddingVertical: 17, paddingHorizontal: 22, backgroundColor: T.fieldbg }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: T.ink }}>Back</Text>
              </Pressable>
              <Pressable onPress={finish} disabled={saving} style={[primaryBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}>
                <Text style={primaryText}>{saving ? 'Saving…' : 'Enter Flipd'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </FormScroll>
    </SafeAreaView>
  );
}

const heading = { fontFamily: F.black, fontSize: 27, color: T.ink, letterSpacing: -0.9, marginTop: 26 } as const;
const sub = { fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, marginBottom: 26, lineHeight: 20 } as const;
const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 } as const;
const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 20 };
const errText = { fontFamily: F.medium, fontSize: 13, color: T.danger, marginBottom: 12 } as const;
const field = {
  backgroundColor: T.fieldbg,
  borderWidth: 1,
  borderColor: T.fieldbg,
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 15,
  fontFamily: F.medium,
  color: T.ink,
  marginBottom: 20,
} as const;
const primaryBtn = {
  backgroundColor: T.cardinal,
  borderRadius: 14,
  paddingVertical: 17,
  alignItems: 'center' as const,
};
const primaryText = { fontFamily: F.bold, fontSize: 16, color: '#fff' } as const;
const chip = (active: boolean) => ({
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? T.cardinal : T.rule,
  backgroundColor: active ? T.cardinal : '#fff',
});
const chipText = (active: boolean) =>
  ({ fontFamily: F.semibold, fontSize: 13, color: active ? '#fff' : T.ink }) as const;
