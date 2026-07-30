import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchMyProfile, updateMyProfile, uploadAvatar } from '@/lib/listings';
import { T, F } from '@/lib/theme';

const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];

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
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const p = await fetchMyProfile(user.id);
      if (p) {
        setName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setUnit(p.school_unit ?? null);
        setYear(p.class_year ?? null);
        setAvatar(p.avatar_url ?? null);
        setInstagram(p.contact_instagram ?? '');
        setPhone(p.contact_phone ?? '');
        setEmail(p.contact_email ?? '');
      }
      setLoading(false);
    })();
  }, [user]);

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
        contact_instagram: instagram.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
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

  return (
    <ScrollView style={{ backgroundColor: T.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.8, marginBottom: 20 }}>
        Edit profile
      </Text>

      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" />
          ) : (
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: T.fieldbg,
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

      <Text style={label}>Name</Text>
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

      <Text style={label}>Contact methods</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginBottom: 12, marginTop: -2, lineHeight: 19 }}>
        Only shared with the other person when a request is approved — you pick which each time.
      </Text>
      <TextInput
        value={instagram}
        onChangeText={setInstagram}
        placeholder="Instagram username"
        placeholderTextColor={T.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone number"
        placeholderTextColor={T.muted}
        keyboardType="phone-pad"
        style={field}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Contact email"
        placeholderTextColor={T.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={field}
      />

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
    </ScrollView>
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
