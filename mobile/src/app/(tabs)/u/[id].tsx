import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, Alert, Modal, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import {
  fetchPublicProfile,
  fetchUserListings,
  fetchRatings,
  fetchBlockedIds,
  blockUser,
  unblockUser,
  reportUser,
  ReportReason,
  FeedSeller,
  FeedListing,
  RatingSummary,
} from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F, S } from '@/lib/theme';

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'prohibited', label: 'Prohibited item' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'other', label: 'Something else' },
];

// Compact star row for an average score (supports halves).
function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={T.gold}
        />
      ))}
    </View>
  );
}

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [profile, setProfile] = useState<FeedSeller | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [ratings, setRatings] = useState<RatingSummary>({ average: null, count: 0, reviews: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reporting, setReporting] = useState(false);

  const isSelf = user?.id === id;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [p, l, r, blockedIds] = await Promise.all([
        fetchPublicProfile(String(id)),
        fetchUserListings(String(id)),
        fetchRatings(String(id)),
        isSelf ? Promise.resolve([]) : fetchBlockedIds(),
      ]);
      setProfile(p);
      setListings(l);
      setRatings(r);
      setBlocked(blockedIds.includes(String(id)));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [id, isSelf]);

  useEffect(() => {
    load();
  }, [load]);

  // Overflow menu: Block/Unblock + Report.
  const openMenu = () => {
    const options = [
      blocked ? 'Unblock' : 'Block',
      'Report',
      'Cancel',
    ];
    Alert.alert(profile?.display_name || 'This Trojan', undefined, [
      {
        text: options[0],
        style: blocked ? 'default' : 'destructive',
        onPress: toggleBlock,
      },
      { text: 'Report', onPress: () => setReportOpen(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleBlock = async () => {
    try {
      if (blocked) {
        await unblockUser(String(id));
        setBlocked(false);
      } else {
        await blockUser(String(id));
        setBlocked(true);
        Alert.alert('Blocked', 'You won’t see each other’s listings or be able to request contact.');
      }
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const sendReport = async () => {
    if (!reportReason) return;
    setReporting(true);
    try {
      await reportUser({ userId: String(id) }, reportReason, reportNote);
      setReportOpen(false);
      setReportReason(null);
      setReportNote('');
      Alert.alert('Report sent', 'Thanks. Our team will take a look.');
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setReporting(false);
    }
  };

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  // Full error screen with retry when the profile failed to load.
  if (state === 'error' && !profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>Couldn’t load this profile.</Text>
        <Pressable onPress={load} style={{ backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const unitYear = [profile?.school_unit, profile?.class_year].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        {!isSelf ? (
          <Pressable
            onPress={openMenu}
            hitSlop={10}
            style={{ position: 'absolute', top: S.screenTop, right: 18, zIndex: 10, padding: 4 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={T.ink} />
          </Pressable>
        ) : null}

        {blocked ? (
          <View style={{ backgroundColor: '#FDF2F2', paddingTop: S.screenTop, paddingBottom: 10, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: T.danger, textAlign: 'center' }}>
              You’ve blocked this person.
            </Text>
          </View>
        ) : null}

        <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{
          paddingHorizontal: S.gridGutter,
          paddingTop: S.screenTop,
          paddingBottom: S.screenBottom,
        }}
        ListHeaderComponent={
          <View style={{ padding: 10, alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: T.rule }} contentFit="cover" />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: T.fieldbg, borderWidth: 1, borderColor: T.rule }} />
            )}
            <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink }}>
              {profile?.display_name ?? 'A Trojan'}
            </Text>
            {unitYear ? <Text style={{ fontFamily: F.regular, color: T.muted }}>{unitYear}</Text> : null}

            {ratings.average != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Stars value={ratings.average} />
                <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.ink }}>{ratings.average.toFixed(1)}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>
                  ({ratings.count} {ratings.count === 1 ? 'rating' : 'ratings'})
                </Text>
              </View>
            ) : ratings.count === 0 && state === 'ready' ? (
              <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>No ratings yet</Text>
            ) : null}

            {state === 'error' ? <Text style={{ color: T.danger }}>Couldn’t load this profile.</Text> : null}

            {ratings.reviews.some((r) => r.text) ? (
              <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 10 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Reviews</Text>
                {ratings.reviews
                  .filter((r) => r.text)
                  .slice(0, 5)
                  .map((r, i) => (
                    <View key={i} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 12, padding: 12, gap: 6 }}>
                      <Stars value={r.score} size={13} />
                      <Text style={{ fontFamily: F.regular, fontSize: 14, color: '#333', lineHeight: 20 }}>{r.text}</Text>
                    </View>
                  ))}
              </View>
            ) : null}

            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink, alignSelf: 'flex-start', marginTop: 18 }}>
              Listings
            </Text>
          </View>
        }
        ListEmptyComponent={
          state === 'ready' ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.medium, color: T.muted }}>No active listings.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
        )}
        />

        {/* Report sheet */}
        <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 36 }}>
              <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>
                Report {profile?.display_name || 'this Trojan'}
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6 }}>
                What’s wrong? Reports are private.
              </Text>

              <View style={{ gap: 8, marginTop: 18 }}>
                {REPORT_REASONS.map((r) => {
                  const on = reportReason === r.key;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setReportReason(r.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderWidth: 1.5,
                        borderColor: on ? T.cardinal : T.rule,
                        backgroundColor: on ? '#FDF2F2' : '#fff',
                        borderRadius: 14,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text style={{ fontFamily: F.semibold, fontSize: 15, color: T.ink }}>{r.label}</Text>
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={on ? T.cardinal : T.rule}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={reportNote}
                onChangeText={setReportNote}
                placeholder="Add details (optional)"
                placeholderTextColor={T.muted}
                multiline
                maxLength={500}
                style={{
                  backgroundColor: T.fieldbg,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 72,
                  textAlignVertical: 'top',
                  fontFamily: F.medium,
                  fontSize: 15,
                  color: T.ink,
                  marginTop: 12,
                }}
              />

              <Pressable
                onPress={sendReport}
                disabled={reporting || !reportReason}
                style={{
                  backgroundColor: T.cardinal,
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 18,
                  opacity: reporting || !reportReason ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>
                  {reporting ? 'Sending…' : 'Submit report'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setReportOpen(false)} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  );
}
