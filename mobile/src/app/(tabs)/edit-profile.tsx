import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchMyProfile, updateMyProfile } from '@/lib/listings';
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const p = await fetchMyProfile(user.id);
      if (p) {
        setName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setUnit(p.school_unit ?? null);
        setYear(p.class_year ?? null);
      }
      setLoading(false);
    })();
  }, [user]);

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
