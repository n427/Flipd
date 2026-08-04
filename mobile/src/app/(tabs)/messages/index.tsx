import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchThreads, ThreadSummary } from '@/lib/messages';
import { T, F, S } from '@/lib/theme';

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function Messages() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setThreads(await fetchThreads());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  // Reload on focus so a reply sent from the thread reflects in the list.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.cardinal} />}
        ListHeaderComponent={
          <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7, marginBottom: 14 }}>
            Messages
          </Text>
        }
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center', lineHeight: 21 }}>
              {state === 'error'
                ? 'Couldn’t load messages. Pull to retry.'
                : 'No conversations yet. Ask about a listing, and once the seller approves you can talk here.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/messages/${item.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
          >
            {item.counterpart?.avatar_url ? (
              <Image
                source={{ uri: item.counterpart.avatar_url }}
                style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: T.rule }}
                contentFit="cover"
              />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.fieldbg, borderWidth: 1, borderColor: T.rule }} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: item.unread ? F.extrabold : F.bold, fontSize: 15, color: T.ink }}
                >
                  {item.counterpart?.display_name ?? 'Flipd member'}
                </Text>
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.muted }}>
                  {timeAgo(item.last_message_at)}
                </Text>
              </View>
              <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted, marginTop: 1 }}>
                {item.listing_title}
              </Text>
              {item.last_message ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: item.unread ? F.semibold : F.regular,
                    fontSize: 13.5,
                    color: item.unread ? T.ink : T.muted,
                    marginTop: 2,
                  }}
                >
                  {item.last_message}
                </Text>
              ) : null}
            </View>
            {item.unread ? (
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: T.cardinal }} />
            ) : (
              <Ionicons name="chevron-forward" size={17} color={T.muted} />
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
