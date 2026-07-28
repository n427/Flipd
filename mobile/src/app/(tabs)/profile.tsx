import { View, Text, Pressable } from 'react-native';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { user } = useSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 16 }}>Signed in as</Text>
      <Text style={{ fontWeight: '700' }}>{user?.email ?? '—'}</Text>
      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={{ backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
