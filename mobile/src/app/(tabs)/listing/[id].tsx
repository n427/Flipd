import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

// Stub — the real listing detail (photos, map, reveal) is a later screen.
export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#666' }}>Listing {String(id)} — detail coming soon</Text>
    </View>
  );
}
