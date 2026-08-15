import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { leaveAfterDelete } from '@/lib/nav';
import { useSession } from '@/lib/session';
import {
  fetchListing,
  deleteListing,
  setListingArchived,
  createReveal,
  fetchSavedIds,
  fetchSafetyReview,
  SafetyReview,
  toggleSaved,
  ListingDetail,
  priceLabel,
  reportUser,
  ReportReason,
  fetchReminderIds,
  toggleReminder,
} from '@/lib/listings';
import { findThreadForListing } from '@/lib/messages';
import { ReportForm } from '@/components/ReportForm';
import { formatEventWindow } from '@/lib/events';
import { T, F, S } from '@/lib/theme';
import { containsContactInfo, CONTACT_BLOCKED_MESSAGE } from '@/lib/validation';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { SafetyCard } from '@/components/SafetyCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ListingDetailSkeleton } from '@/components/Skeletons';
import { MapPreview } from '@/components/MapPreview';
import { Sheet, SheetGrabber } from '@/components/Sheet';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [reminded, setReminded] = useState(false);

  // Hydrate the bookmark state once (cheap; own-row read).
  useEffect(() => {
    if (!user) return;
    fetchSavedIds(user.id)
      .then((ids) => setSaved(ids.includes(String(id))))
      .catch(() => {});
    fetchReminderIds(user.id)
      .then((ids) => setReminded(ids.includes(String(id))))
      .catch(() => {});
  }, [user, id]);

  const onToggleReminder = async () => {
    if (!user) return;
    const prev = reminded;
    setReminded(!prev); // optimistic
    try {
      setReminded(await toggleReminder(user.id, String(id), prev));
    } catch {
      setReminded(prev); // revert on failure
    }
  };

  const onToggleSave = async () => {
    if (!user) return;
    const prev = saved;
    setSaved(!prev); // optimistic
    try {
      const now = await toggleSaved(user.id, String(id), prev);
      setSaved(now);
    } catch {
      setSaved(prev); // revert on failure
    }
  };

  // Expo Router reuses this component for every /listing/<id>, so state
  // survives the navigation: without this the previous listing stays on screen
  // (state === 'ready') until the new fetch lands, which reads as a flicker
  // through the wrong post. Clearing on id change shows the loader instead.
  useEffect(() => {
    setListing(null);
    setState('loading');
    setThreadId(null);
    setSafety(null);
    setSheetOpen(false);
  }, [id]);

  const load = useCallback(async () => {
    try {
      const l = await fetchListing(String(id));
      // The route component is reused across ids, so a slow response for a
      // previous listing can land after we've already moved on. Ignore it.
      if (String(l?.id ?? '') !== String(id)) return;
      if (!l) {
        setState('notfound');
        return;
      }
      setListing(l);
      setState('ready');
      // Non-blocking: a failed lookup leaves the CTA as "Message seller".
      findThreadForListing(String(id)).then(setThreadId);
    } catch {
      setState('error');
    }
  }, [id]);

  // Reload whenever the screen regains focus so edits made on the edit screen
  // (and mark-sold/relist) reflect immediately on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isOwner = !!user && !!listing && user.id === listing.seller_id;
  // Popups carry both ends of the window; a half-set pair renders no pill.
  const eventPill =
    listing?.event_start && listing?.event_end
      ? formatEventWindow(listing.event_start, listing.event_end)
      : null;

  const onToggleSold = async () => {
    if (!listing) return;
    setBusy(true);
    try {
      await setListingArchived(listing.id, !listing.archived);
      await load();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!listing) return;
    Alert.alert('Delete listing?', 'This permanently removes it and its photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteListing(listing.id);
            leaveAfterDelete();
          } catch (e) {
            setBusy(false);
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);
  };

  // --- Buyer reveal flow ---
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportToast, setReportToast] = useState<string | null>(null);

  useEffect(() => {
    if (!reportToast) return;
    const t = setTimeout(() => setReportToast(null), 4200);
    return () => clearTimeout(t);
  }, [reportToast]);

  const sendReport = async (reason: ReportReason, note: string) => {
    if (!listing) return;
    setReporting(true);
    try {
      await reportUser({ listingId: listing.id }, reason, note);
      setReportOpen(false);
      setReportToast('Report sent. Our team will take a look.');
    } catch (e) {
      setReportToast(e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setReporting(false);
    }
  };
  // AI review of the seller, fetched when the request sheet opens so the buyer
  // reads it before committing. Advisory: null just renders nothing.
  const [safety, setSafety] = useState<SafetyReview | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [intro, setIntro] = useState('');
  const [offer, setOffer] = useState('');
  const [sending, setSending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  // Same check the server runs. Here it only buys fast feedback: the API
  // rejects independently with a 422.
  const introBlocked = containsContactInfo(intro);
  const canSend = intro.trim().length > 0 && !introBlocked && intro.length <= 600;

  const openSheet = () => {
    if (!user) return;
    setSheetOpen(true);
    // Fetch once per open. Failures resolve to null and the card just doesn't
    // render — a safety hint must never stand between someone and the flow.
    if (listing?.seller_id) {
      setSafetyLoading(true);
      fetchSafetyReview(listing.seller_id, 'seller')
        .then(setSafety)
        .catch(() => setSafety(null))
        .finally(() => setSafetyLoading(false));
    }
  };

  const sendReveal = async () => {
    if (!listing || !canSend) return;
    setSending(true);
    try {
      const parsedOffer = parseInt(offer, 10);
      const res = await createReveal(
        listing.id,
        intro.trim(),
        Number.isFinite(parsedOffer) && parsedOffer > 0 ? parsedOffer : null,
      );
      if (res.ok) {
        setSheetOpen(false);
        setIntro('');
        setRequested(true);
        Alert.alert('Request sent', 'The seller has 72 hours to reply. If they approve, your chat opens right here in Flipd.');
      } else if (res.status === 409) {
        setSheetOpen(false);
        setRequested(true);
        Alert.alert('Already asked', 'You already have a request on this listing.');
      } else {
        Alert.alert('Could not send', res.error);
      }
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  // The floating header rides on top of the skeleton too, so the way back is
  // available while the listing is still loading.
  if (state === 'loading')
    return (
      <View style={{ flex: 1 }}>
        <ListingDetailSkeleton />
        <ScreenHeader floating />
      </View>
    );
  if (state === 'error') return <View style={c.center}><Text style={{ fontFamily: F.medium, color: T.muted }}>Couldn&apos;t load this listing.</Text></View>;
  if (state === 'notfound' || !listing) return <View style={c.center}><Text style={{ fontFamily: F.medium, color: T.muted }}>Listing not found.</Text></View>;

  const hasCoords = listing.lat != null && listing.lng != null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`;
  const sellerLine = [listing.seller?.display_name, listing.seller?.school_unit, listing.seller?.class_year]
    .filter(Boolean)
    .join(' · ');

  return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} style={{ backgroundColor: T.bg }}>
        <View>
          <PhotoCarousel photos={listing.photo_urls} />
          {/* The carousel runs full-bleed to the top, so this uses the floating
              variant — same chevron and label as every other screen, just in a
              pill over the photo instead of a solid row above it. */}
          <ScreenHeader floating />
        </View>

        <View style={{ padding: 20 }}>
          {/* Title + save */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Text style={{ flex: 1, fontFamily: F.extrabold, fontSize: 24, color: T.ink, letterSpacing: -0.6, lineHeight: 29 }}>
              {listing.title}
            </Text>
            {!isOwner ? (
              <Pressable onPress={onToggleSave} hitSlop={8} style={{ paddingTop: 2 }}>
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={26} color={saved ? T.cardinal : T.muted} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {eventPill ? (
              /* A popup leads with when it runs; it has no price to show. */
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FDF2F2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Ionicons name="calendar-outline" size={14} color={T.cardinal} />
                <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.cardinal }}>{eventPill}</Text>
              </View>
            ) : (
              <>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: listing.price > 0 ? T.ink : T.cardinal }}>
                  {priceLabel(listing.price)}
                </Text>
                {listing.negotiable ? (
                  <View style={{ backgroundColor: T.fieldbg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 12, color: T.muted }}>Open to offers</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* Remind me — popups only, and never for your own listing. */}
          {eventPill && !isOwner ? (
            <Pressable
              onPress={onToggleReminder}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 14,
                borderRadius: 14,
                paddingVertical: 14,
                backgroundColor: reminded ? T.cardinal : '#fff',
                borderWidth: 1,
                borderColor: reminded ? T.cardinal : T.rule,
              }}
            >
              <Ionicons name={reminded ? 'notifications' : 'notifications-outline'} size={17} color={reminded ? '#fff' : T.ink} />
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: reminded ? '#fff' : T.ink }}>
                {reminded ? 'Reminder on' : 'Remind me'}
              </Text>
            </Pressable>
          ) : null}

          {/* Description */}
          {listing.description ? (
            <>
              <Text style={sectionLabel}>Details</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 15, color: '#333', lineHeight: 23 }}>
                {listing.description}
              </Text>
            </>
          ) : null}

          {/* Location */}
          <Text style={sectionLabel}>Where you’ll meet</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.ink }}>
            {listing.place_name || listing.location || 'USC · pickup'}
          </Text>
          {hasCoords && MAPS_KEY ? (
            <>
              {/* MapPreview rather than a bare Image: expo-image can resolve
                  the extensionless /staticmap URL to a 200 it never paints,
                  leaving a silent blank box. MapPreview uses RN Image and
                  surfaces explicit loading/failed states. */}
              <View style={{ marginTop: 12 }}>
                <MapPreview
                  lat={listing.lat!}
                  lng={listing.lng!}
                  height={160}
                  label={listing.place_name || listing.location || undefined}
                />
              </View>
              <Pressable onPress={() => Linking.openURL(mapsUrl)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="navigate-outline" size={15} color={T.cardinal} />
                <Text style={{ fontFamily: F.semibold, color: T.cardinal }}>Open in Google Maps</Text>
              </Pressable>
            </>
          ) : null}

          {/* Seller */}
          {listing.seller ? (
            <>
              <Text style={sectionLabel}>Seller</Text>
              <Pressable
                onPress={() => router.push(`/u/${listing.seller_id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: T.rule,
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                {listing.seller.avatar_url ? (
                  <Image source={{ uri: listing.seller.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: T.rule }} contentFit="cover" />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.fieldbg, borderWidth: 1, borderColor: T.rule, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={20} color={T.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
                    {listing.seller.display_name || 'A Trojan'}
                  </Text>
                  <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginTop: 1 }}>
                    {[listing.seller.school_unit, listing.seller.class_year].filter(Boolean).join(' · ') || 'USC'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={T.muted} />
              </Pressable>
            </>
          ) : null}

          {isOwner ? (
            <View style={{ marginTop: 24, gap: 10 }}>
              {listing.archived ? (
                <View style={{ backgroundColor: T.fieldbg, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.bold, color: T.muted, fontSize: 13 }}>
                    Sold — hidden from the feed
                  </Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => router.push(`/listing/${listing.id}/edit`)}
                disabled={busy}
                style={{ backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>Edit listing</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={onToggleSold}
                  disabled={busy}
                  style={{ flex: 1, backgroundColor: T.fieldbg, borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: F.bold, color: T.ink, fontSize: 15 }}>
                    {listing.archived ? 'Relist' : 'Mark sold'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onDelete}
                  disabled={busy}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: T.danger, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: F.bold, color: T.danger, fontSize: 15 }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* An open conversation outranks the request CTA: someone who
                  already has a thread wants back into it, not to start over. */}
              <Pressable
                onPress={threadId ? () => router.push(`/messages/${threadId}`) : requested ? undefined : openSheet}
                disabled={!threadId && requested}
                style={{
                  backgroundColor: !threadId && requested ? T.fieldbg : T.cardinal,
                  borderRadius: 14,
                  paddingVertical: 17,
                  alignItems: 'center',
                  marginTop: 24,
                }}
              >
                <Text style={{ fontFamily: F.bold, color: !threadId && requested ? T.muted : '#fff', fontSize: 16 }}>
                  {threadId ? 'Open chat' : requested ? 'Request sent' : 'Message seller'}
                </Text>
              </Pressable>
              {/* Quiet by design — reporting should be findable without
                  competing with the primary action above it. */}
              <Pressable
                onPress={() => setReportOpen(true)}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 }}
              >
                <Ionicons name="flag-outline" size={15} color={T.muted} />
                <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: T.muted }}>Report listing</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Snackbar — Alert.alert is a no-op stub on react-native-web. */}
        {reportToast ? (
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
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: '#fff', lineHeight: 19 }}>{reportToast}</Text>
          </View>
        ) : null}

        <Sheet visible={reportOpen} onClose={() => setReportOpen(false)}>
          <SheetGrabber />
          <ReportForm
            title="Report this listing"
            submitting={reporting}
            onSubmit={sendReport}
            onCancel={() => setReportOpen(false)}
          />
        </Sheet>

        {/* Reveal request sheet */}
        <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
          <SheetGrabber />
          <View>
            <View>
              <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>
                Message {listing.seller?.display_name?.split(' ')[0] || 'the seller'}
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 20 }}>
                They see your name, school, and year with your message, and have 72 hours to reply.
              </Text>

              <View style={{ marginTop: 14 }}>
                <SafetyCard review={safety} loading={safetyLoading} />
              </View>

              <TextInput
                value={intro}
                onChangeText={(t) => setIntro(t.slice(0, 700))}
                placeholder="Say what you're after and when you could meet."
                placeholderTextColor={T.muted}
                multiline
                style={{
                  marginTop: 16,
                  minHeight: 96,
                  borderWidth: 1,
                  borderColor: introBlocked ? T.danger : T.rule,
                  borderRadius: 12,
                  backgroundColor: T.fieldbg,
                  padding: 12,
                  fontFamily: F.regular,
                  fontSize: 15,
                  color: T.ink,
                  textAlignVertical: 'top',
                }}
              />
              {/* Blocked rather than silently stripped: a buyer who thinks their
                  number went through would wait forever for a text. */}
              <Text
                style={{
                  fontFamily: F.regular,
                  fontSize: 12.5,
                  color: introBlocked ? T.danger : T.muted,
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                {introBlocked ? CONTACT_BLOCKED_MESSAGE : `${intro.length}/600`}
              </Text>

              {listing.negotiable && !listing.event_start ? (
                <TextInput
                  value={offer}
                  onChangeText={(t) => setOffer(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="Your offer (optional)"
                  placeholderTextColor={T.muted}
                  keyboardType="number-pad"
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: T.rule,
                    borderRadius: 12,
                    backgroundColor: T.fieldbg,
                    padding: 13,
                    fontFamily: F.medium,
                    fontSize: 15,
                    color: T.ink,
                  }}
                />
              ) : null}

              <Pressable
                onPress={sendReveal}
                disabled={sending || !canSend}
                style={{
                  marginTop: 16,
                  backgroundColor: T.cardinal,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: sending || !canSend ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: '#fff' }}>
                  {sending ? 'Sending…' : 'Send request'}
                </Text>
              </Pressable>

              <Pressable onPress={() => setSheetOpen(false)} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Sheet>
      </ScrollView>
  );
}

const c = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, backgroundColor: T.bg },
  muted: { color: '#666' },
};
const sectionLabel = {
  fontFamily: F.bold,
  fontSize: 12,
  color: T.muted,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
  marginTop: 24,
  marginBottom: 8,
} as const;
