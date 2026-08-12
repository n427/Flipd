import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Switch, SwitchProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FormScroll } from '@/components/FormScroll';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchMyProfile, updateMyProfile, uploadAvatar, NotifyEvent, NotifyPrefs } from '@/lib/listings';
import { T, F, S } from '@/lib/theme';

const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const NOTIFY_EVENTS: { id: NotifyEvent; label: string }[] = [
  { id: 'new_request', label: 'New request on your listing' },
  { id: 'approval', label: 'Request approved (your chat is open)' },
  { id: 'new_message', label: 'New message in a conversation' },
  { id: 'reminder', label: 'Reminder before a request expires' },
  { id: 'expiry', label: 'Your request expired' },
  { id: 'popup_reminder', label: 'A popup or event you saved is starting soon' },
];

// `activeThumbColor` is a react-native-web-only prop, absent from RN's
// SwitchProps types, and the only way to stop the on-state thumb falling back
// to Material teal (#009688) in the browser. Native ignores the unknown key.
const WEB_ACTIVE_THUMB = { activeThumbColor: '#fff' } as unknown as SwitchProps;

export default function EditProfile() {
  const router = useRouter();
  const { user } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [unit, setUnit] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<NotifyPrefs>({});

  const [loadFailed, setLoadFailed] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const p = await fetchMyProfile(user.id);
      if (p) {
        setName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setUnit(p.school_unit ?? null);
        setYear(p.class_year ?? null);
        setAvatar(p.avatar_url ?? null);
        setEmail(p.contact_email ?? '');
        setPrefs(p.notify_prefs ?? {});
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // A single toggle per event controls every channel. All default ON, so
  // "enabled" means none is explicitly false. `app` and `push` are both written
  // because the web preference grid uses `app` and older rows use `push`.
  const eventOn = (id: NotifyEvent) =>
    prefs[id]?.email !== false && prefs[id]?.push !== false && prefs[id]?.app !== false;
  const setEvent = (id: NotifyEvent, on: boolean) =>
    setPrefs((prev) => ({ ...prev, [id]: { ...prev[id], email: on, push: on, app: on } }));

  // Pick + upload a profile photo. Uploads immediately (separate from Save) so
  // the new URL is persisted even if the user backs out without saving fields.
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
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(res.assets[0].uri);
      setAvatar(url);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim()) {
      setError('Add your name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateMyProfile(user.id, {
        display_name: name.trim(),
        bio: bio.trim() || null,
        school_unit: unit,
        class_year: year,
        contact_email: email.trim() || null,
        notify_prefs: prefs,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>Couldn’t load your profile.</Text>
        <Pressable onPress={loadProfile} style={{ backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <ScreenHeader />
        <FormScroll contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: S.screenBottom }}>
          <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.8, marginBottom: 20 }}>
            Edit profile
          </Text>

        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                // Outline keeps the avatar edge readable against a light photo
                // and matches the ring on the empty state.
                style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: T.rule }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: T.fieldbg,
                  borderWidth: 1.5,
                  borderColor: T.rule,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.muted }}>Add photo</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 48,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar} style={{ marginTop: 8 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: T.cardinal }}>
              {avatar ? 'Change photo' : 'Add a photo'}
            </Text>
          </Pressable>
        </View>

        <Text style={label}>
          Name<Text style={{ color: T.cardinal }}> *</Text>
        </Text>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={T.muted} style={field} />

        <Text style={label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="A line about you"
          placeholderTextColor={T.muted}
          multiline
          style={[field, { height: 80, textAlignVertical: 'top', paddingTop: 14 }]}
        />

        <Text style={label}>School</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {UNITS.map((u) => (
            <Pressable key={u} onPress={() => setUnit(u)} style={chip(unit === u)}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: unit === u ? '#fff' : T.ink }}>{u}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={label}>Year</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {YEARS.map((y) => (
            <Pressable key={y} onPress={() => setYear(y)} style={chip(year === y)}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: year === y ? '#fff' : T.ink }}>{y}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={label}>Email</Text>
        {/* Tied to the verified USC account the session is built on, so it is
            shown for reference but never editable here. */}
        <TextInput
          value={email}
          editable={false}
          placeholder="Contact email"
          placeholderTextColor={T.muted}
          style={[field, { backgroundColor: T.fieldbg, color: T.muted }]}
        />
        <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.muted, marginTop: -12, marginBottom: 20, lineHeight: 18 }}>
          Tied to your verified account, so it cannot be changed here.
        </Text>

        <Text style={label}>Notifications</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginBottom: 12, marginTop: -2, lineHeight: 19 }}>
          Push and email for each event.
        </Text>
        <View style={{ marginBottom: 20, borderWidth: 1, borderColor: T.rule, borderRadius: 14, overflow: 'hidden' }}>
          {NOTIFY_EVENTS.map((ev, i) => (
            <View
              key={ev.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 13,
                paddingHorizontal: 15,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: T.rule,
                gap: 12,
              }}
            >
              <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: T.ink, flex: 1 }}>{ev.label}</Text>
              <Switch
                value={eventOn(ev.id)}
                onValueChange={(on) => setEvent(ev.id, on)}
                // react-native-web defaults the *thumb* to Material teal
                // (#009688) once on, which fought the cardinal track. Pin every
                // colour in both states so the control matches the app.
                trackColor={{ false: T.rule, true: T.cardinal }}
                thumbColor="#fff"
                {...WEB_ACTIVE_THUMB}
                ios_backgroundColor={T.rule}
                style={{ transform: [{ scale: 0.9 }] }}
              />
            </View>
          ))}
        </View>

        {error ? <Text style={{ fontFamily: F.medium, color: T.danger, marginBottom: 8 }}>{error}</Text> : null}

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 17, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
        </Pressable>
        </FormScroll>
      </SafeAreaView>
  );
}

const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 } as const;
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
const chip = (active: boolean) => ({
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? T.cardinal : T.rule,
  backgroundColor: active ? T.cardinal : '#fff',
});
