import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet, SheetGrabber } from '@/components/Sheet';
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
import { Stars } from '@/components/Stars';
import { ReportForm } from '@/components/ReportForm';
import { T, F, S } from '@/lib/theme';

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [profile, setProfile] = useState<FeedSeller | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [ratings, setRatings] = useState<RatingSummary>({ average: null, count: 0, reviews: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blocked, setBlocked] = useState(false);
  // One sheet, two views. Presenting a second Modal while the first is still
  // dismissing misbehaves on iOS, so the menu swaps its content in place.
  const [sheet, setSheet] = useState<null | 'menu' | 'report'>(null);
  // Alert.alert is an empty stub in react-native-web, so every confirmation
  // and error has to surface in-app rather than through a native dialog.
  const [toast, setToast] = useState<string | null>(null);
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

  // Toasts clear themselves so there is nothing extra to dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleBlock = async () => {
    setSheet(null);
    try {
      if (blocked) {
        await unblockUser(String(id));
        setBlocked(false);
        setToast('Unblocked.');
      } else {
        await blockUser(String(id));
        setBlocked(true);
        setToast('Blocked. You won’t see each other’s listings or be able to request contact.');
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not update. Try again.');
    }
  };

  const sendReport = async (reason: ReportReason, note: string) => {
    setReporting(true);
    try {
      await reportUser({ userId: String(id) }, reason, note);
      setSheet(null);
      setToast('Report sent. Our team will take a look.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not send. Try again.');
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
            onPress={() => setSheet('menu')}
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
          // 10 + each card's own 6pt margin = a 16pt edge, matching every
          // other screen's gutter. gridGutter (6) put cards at 12pt.
          paddingHorizontal: 10,
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
          <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
        )}
        />

        {/* Snackbar — the only feedback channel that works on web. */}
        {toast ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: S.screenBottom + 12,
              zIndex: 20,
              backgroundColor: T.ink,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: '#fff', lineHeight: 19 }}>{toast}</Text>
          </View>
        ) : null}

        {/* Overflow menu + report, sharing one sheet. */}
        <Sheet visible={sheet !== null} onClose={() => setSheet(null)}>
          <SheetGrabber />
          {sheet === 'menu' ? (
            <View>
              <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.ink, letterSpacing: -0.3, marginBottom: 6 }}>
                {profile?.display_name || 'This Trojan'}
              </Text>
              <Pressable
                onPress={toggleBlock}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 }}
              >
                <Ionicons name={blocked ? 'person-add-outline' : 'ban-outline'} size={20} color={blocked ? T.ink : T.danger} />
                <Text style={{ fontFamily: F.semibold, fontSize: 15.5, color: blocked ? T.ink : T.danger }}>
                  {blocked ? 'Unblock' : 'Block'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSheet('report')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 15,
                  borderTopWidth: 1,
                  borderTopColor: T.rule,
                }}
              >
                <Ionicons name="flag-outline" size={20} color={T.ink} />
                <Text style={{ fontFamily: F.semibold, fontSize: 15.5, color: T.ink }}>Report</Text>
              </Pressable>
              <Pressable onPress={() => setSheet(null)} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <ReportForm
              title={`Report ${profile?.display_name || 'this Trojan'}`}
              submitting={reporting}
              onSubmit={sendReport}
              onCancel={() => setSheet('menu')}
              cancelLabel="Back"
            />
          )}
        </Sheet>
    </SafeAreaView>
  );
}
