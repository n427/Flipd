import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackTo } from '@/lib/nav';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import {
  fetchThread,
  sendMessage,
  Message,
  ThreadHead,
  OutgoingAttachment,
} from '@/lib/messages';
import { attachmentError, MAX_ATTACHMENTS_PER_MESSAGE } from '@/lib/validation';
import { priceLabel } from '@/lib/listings';
import { T, F, S } from '@/lib/theme';

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// expo-video is a NATIVE module: it does not exist in the Expo Go binary, and a
// static import would crash this whole screen there — taking the entire
// conversation with it, not just video playback.
//
// So it is required lazily and only in a dev/production build. In Expo Go a
// video renders as a tappable card that opens in the system player instead.
// Text, photos, and sending all keep working.
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let VideoModule: typeof import('expo-video') | null = null;
if (!IS_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    VideoModule = require('expo-video');
  } catch {
    // Older build without the module: fall back to the link card.
    VideoModule = null;
  }
}

function NativeVideo({ uri }: { uri: string }) {
  // Non-null: only rendered when VideoModule loaded.
  const player = VideoModule!.useVideoPlayer(uri);
  const View_ = VideoModule!.VideoView;
  return (
    <View_
      player={player}
      style={{ width: 220, height: 220, borderRadius: 12, backgroundColor: '#000' }}
      contentFit="cover"
      nativeControls
    />
  );
}

// Photos render at their own aspect ratio, bounded so a very tall image can't
// take over the thread. Falls back to a square only when the dimensions are
// unknown (older rows never stored them), which is the previous behaviour.
const BUBBLE_W = 220;
const MAX_H = 320;

function ChatImage({ uri, width, height }: { uri: string; width: number | null; height: number | null }) {
  // expo-image can measure the file itself, so an unknown ratio resolves once
  // the image loads rather than staying cropped.
  const [ratio, setRatio] = useState<number | null>(width && height ? width / height : null);
  const h = ratio ? Math.min(BUBBLE_W / ratio, MAX_H) : BUBBLE_W;
  return (
    <Image
      source={{ uri }}
      style={{ width: BUBBLE_W, height: h, borderRadius: 12, backgroundColor: T.fieldbg }}
      contentFit={ratio ? 'contain' : 'cover'}
      onLoad={(e) => {
        const { width: w, height: hh } = e.source ?? {};
        if (!ratio && w && hh) setRatio(w / hh);
      }}
    />
  );
}

function VideoAttachment({ uri }: { uri: string }) {
  if (VideoModule) return <NativeVideo uri={uri} />;
  return (
    <Pressable
      onPress={() => Linking.openURL(uri)}
      style={{
        width: 220,
        height: 124,
        borderRadius: 12,
        backgroundColor: T.fieldbg,
        borderWidth: 1,
        borderColor: T.rule,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Ionicons name="play-circle" size={30} color={T.cardinal} />
      <Text style={{ fontFamily: F.semibold, fontSize: 13, color: T.ink }}>Play video</Text>
    </Pressable>
  );
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [head, setHead] = useState<ThreadHead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { thread, messages: rows } = await fetchThread(id);
      // A slow response for the thread we just left must not overwrite this
      // one. Expo Router reuses this component across ids, so both requests
      // resolve into the same instance.
      if (thread.id !== id) return;
      setHead(thread);
      setMessages(rows);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [id]);

  // Clear on thread change, before the fetch resolves. Without this the
  // previous conversation stays on screen (state === 'ready') until the new
  // one lands, which reads as the chat being slow to switch.
  useEffect(() => {
    setHead(null);
    setMessages([]);
    setState('loading');
    setDraft('');
    setPending([]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime. A dropped socket falls back to the reload above rather than
  // leaving a dead screen, and signed attachment URLs expire anyway, so a
  // refetch is the right response to a stale view either way.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`thread:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${id}` },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  const pickAttachments = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to send photos and video.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_ATTACHMENTS_PER_MESSAGE - pending.length,
      videoMaxDuration: 60,
    });
    if (res.canceled) return;
    const next: OutgoingAttachment[] = [];
    for (const asset of res.assets) {
      // asset.mimeType can be missing OR a value the allow-list doesn't know
      // (iOS reports HEIC oddly). Fall back on the asset's own kind rather
      // than trusting the string, so a real photo is never refused.
      const reported = asset.mimeType?.toLowerCase().split(';')[0].trim();
      const isVideo = asset.type === 'video';
      const mimeType =
        reported && (reported.startsWith('image/') || reported.startsWith('video/'))
          ? reported
          : isVideo
            ? 'video/mp4'
            : 'image/jpeg';
      // Same limits the server enforces, surfaced before the upload starts.
      const err = attachmentError(mimeType, asset.fileSize ?? 1, asset.duration ? asset.duration / 1000 : null);
      if (err) {
        Alert.alert('Can’t attach that', err);
        continue;
      }
      next.push({
        uri: asset.uri,
        name: asset.fileName ?? `upload-${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
        mimeType,
      });
    }
    setPending((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
  };

  const send = async () => {
    if (sending) return;
    if (!draft.trim() && pending.length === 0) return;
    setSending(true);
    try {
      const message = await sendMessage(id!, draft, pending);
      setMessages((prev) => [...prev, message]);
      setDraft('');
      setPending([]);
    } catch (err) {
      Alert.alert('Could not send', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  if (state === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop }}>
          <Pressable
            onPress={() => goBackTo('/(tabs)/requests')}
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
          >
            <Ionicons name="chevron-back" size={20} color={T.muted} />
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error' || !head) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
          Couldn’t load this conversation.
        </Text>
        <Pressable onPress={() => { setState('loading'); load(); }} style={{ backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop }}>
          <Pressable
            onPress={() => goBackTo('/(tabs)/requests')}
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
          >
            <Ionicons name="chevron-back" size={20} color={T.muted} />
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
          </Pressable>

          {/* Pinned listing header: the subject is never ambiguous, and it is
              the way back to the post. */}
          <Pressable
            onPress={() =>
              head.listing_id && !head.listing_removed
                ? router.push(`/(tabs)/listing/${head.listing_id}`)
                : undefined
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderColor: T.rule,
              borderRadius: 14,
              padding: 10,
              marginBottom: 12,
            }}
          >
            {head.listing_photo ? (
              <Image source={{ uri: head.listing_photo }} style={{ width: 46, height: 46, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: T.fieldbg }} />
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14.5, color: T.ink }}>
                {head.listing_title}
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted, marginTop: 1 }}>
                {head.listing_removed
                  ? 'Listing removed'
                  : head.listing_archived
                    ? 'No longer available'
                    : priceLabel(head.listing_price ?? 0)}
                {head.offer != null ? ` · offered $${head.offer}` : ''}
              </Text>
            </View>
            {head.listing_id && !head.listing_removed ? (
              <Ionicons name="chevron-forward" size={17} color={T.muted} />
            ) : null}
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: S.gutter, paddingBottom: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            head.intro_message ? (
              <View style={{ backgroundColor: T.fieldbg, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 10.5, color: T.muted, letterSpacing: 0.6, marginBottom: 5 }}>
                  THE REQUEST
                </Text>
                <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: '#333' }}>
                  {head.intro_message}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              {item.attachments.length > 0 ? (
                <View style={{ gap: 6, marginBottom: item.body ? 6 : 0, alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
                  {item.attachments.map((a) =>
                    a.url == null ? null : a.kind === 'image' ? (
                      <ChatImage key={a.id} uri={a.url} width={a.width} height={a.height} />
                    ) : (
                      <VideoAttachment key={a.id} uri={a.url} />
                    ),
                  )}
                </View>
              ) : null}
              {item.body ? (
                <View
                  style={{
                    maxWidth: '78%',
                    backgroundColor: item.mine ? T.cardinal : T.fieldbg,
                    borderRadius: 16,
                    paddingVertical: 9,
                    paddingHorizontal: 13,
                  }}
                >
                  <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: item.mine ? '#fff' : T.ink }}>
                    {item.body}
                  </Text>
                </View>
              ) : null}
              <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.muted, marginTop: 3 }}>
                {timeLabel(item.created_at)}
              </Text>
            </View>
          )}
        />

        <View style={{ borderTopWidth: 1, borderTopColor: T.rule, paddingHorizontal: S.gutter, paddingTop: 10, paddingBottom: 10 }}>
          {pending.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {pending.map((a, i) => (
                <View key={`${a.uri}-${i}`} style={{ position: 'relative' }}>
                  <Image source={{ uri: a.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
                  <Pressable
                    onPress={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: T.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Pressable
              onPress={pickAttachments}
              hitSlop={8}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.rule,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="image-outline" size={19} color={T.muted} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, 2000))}
              placeholder="Message"
              placeholderTextColor={T.muted}
              multiline
              style={{
                flex: 1,
                minHeight: 42,
                maxHeight: 120,
                borderWidth: 1,
                borderColor: T.rule,
                borderRadius: 12,
                backgroundColor: T.fieldbg,
                paddingHorizontal: 13,
                paddingTop: 11,
                paddingBottom: 11,
                fontFamily: F.regular,
                fontSize: 15,
                color: T.ink,
              }}
            />
            <Pressable
              onPress={send}
              disabled={sending || (!draft.trim() && pending.length === 0)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                backgroundColor: T.cardinal,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: sending || (!draft.trim() && pending.length === 0) ? 0.5 : 1,
              }}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={19} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
