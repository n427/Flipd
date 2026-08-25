import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field } from '@/components/Field';
import { HeaderNotificationButton } from '@/components/HeaderNotificationButton';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { WantedCard } from '@/components/WantedCard';
import { fetchWantedFeed, WantedCategory, WantedPost } from '@/lib/wanted';
import { F, S, T } from '@/lib/theme';
import { losAngelesEndOfDayUtc } from '@/lib/wantedPresentation';

const categories: { value: WantedCategory | 'all'; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'goods', label: 'Goods' }, { value: 'services', label: 'Services' }, { value: 'housing', label: 'Housing' }];

export default function WantedFeed() {
  const router = useRouter();
  const [posts, setPosts] = useState<WantedPost[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WantedCategory | 'all'>('all');
  const [mine, setMine] = useState(false);
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');
  const [neededBefore, setNeededBefore] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestGeneration = useRef(0);
  const invalidateRequests = () => { ++requestGeneration.current; setMore(false); };

  const filters = useMemo(() => ({ q: query, category, budget: Number(budget) || undefined, location, neededBefore: neededBefore ? losAngelesEndOfDayUtc(neededBefore) ?? undefined : undefined, mine, limit: 20 } as const), [query, category, budget, location, neededBefore, mine]);
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const requestFilters = filters;
    setMore(false);
    try { const result = await fetchWantedFeed(requestFilters); if (generation !== requestGeneration.current) return; setPosts(result.wanted_posts); setNext(result.next_cursor); setLoadError(''); setState('ready'); }
    catch { if (generation !== requestGeneration.current) return; setLoadError('Couldn’t refresh Wanted. Pull down to retry.'); setState((current) => current === 'ready' ? 'ready' : 'error'); }
  // primitive dependencies intentionally keep reloads predictable
  }, [filters]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const loadMore = async () => { if (!next || more) return; const cursor = next; const generation = requestGeneration.current; const requestFilters = filters; setMore(true); try { const result = await fetchWantedFeed({ ...requestFilters, cursor }); if (generation !== requestGeneration.current || cursor !== next) return; setPosts((old) => [...old, ...result.wanted_posts.filter((post) => !old.some((item) => item.id === post.id))]); setNext(result.next_cursor); setLoadError(''); } catch { if (generation === requestGeneration.current) setLoadError('Couldn’t load more. Try again.'); } finally { if (generation === requestGeneration.current) setMore(false); } };

  return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
    <View style={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, letterSpacing: -0.8 }}>Wanted</Text><HeaderNotificationButton /></View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <Field accessibilityLabel="Search Wanted posts" value={query} onChangeText={(value) => { invalidateRequests(); setQuery(value); }} placeholder="Search campus requests" returnKeyType="search" style={{ flex: 1, height: 46, paddingHorizontal: 14, fontFamily: F.medium, fontSize: 15, color: T.ink, backgroundColor: T.fieldbg, borderRadius: 13 }} containerStyle={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Open filters" onPress={() => setFiltersOpen(true)} style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="options-outline" size={20} color={T.ink} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 13 }}><Chip label="Explore" active={!mine} onPress={() => { if (mine) { invalidateRequests(); setMine(false); } }} /><Chip label="My Wanted" active={mine} onPress={() => { if (!mine) { invalidateRequests(); setMine(true); } }} /></View>
      {loadError && state === 'ready' ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading Wanted" onPress={load}><Text style={{ fontFamily: F.medium, color: T.cardinal, fontSize: 13, marginBottom: 8 }}>{loadError}</Text></Pressable> : null}
      {state === 'loading' ? <><SkeletonCard /><SkeletonCard /></> : state === 'error' ? <Empty title="Couldn’t load Wanted" action="Retry" onPress={load} /> : <FlatList data={posts} keyExtractor={(item) => item.id} renderItem={({ item }) => <WantedCard post={item} onPress={() => router.push(`/wanted/${item.id}`)} />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.cardinal} />} onEndReached={loadMore} onEndReachedThreshold={0.35} ListFooterComponent={more ? <ActivityIndicator color={T.cardinal} /> : null} ListEmptyComponent={<Empty title={mine ? 'No Wanted history yet' : 'No requests match these filters'} action="Post a request" onPress={() => router.push('/wanted/post')} />} contentContainerStyle={{ paddingBottom: 110, flexGrow: posts.length ? undefined : 1 }} />}
    </View>
    <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
      <SheetGrabber />
      <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, marginBottom: 14 }}>Filter Wanted</Text>
      <Text style={label}>Category</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{categories.map((item) => <Chip key={item.value} label={item.label} active={category === item.value} onPress={() => { if (category !== item.value) { invalidateRequests(); setCategory(item.value); } }} />)}</View>
      <Text style={label}>Maximum budget</Text><Field accessibilityLabel="Maximum Wanted budget" value={budget} onChangeText={(value) => { invalidateRequests(); setBudget(value); }} keyboardType="number-pad" placeholder="Any budget" style={input} />
      <Text style={label}>Meetup area</Text><Field accessibilityLabel="Wanted meetup area" value={location} onChangeText={(value) => { invalidateRequests(); setLocation(value); }} placeholder="Anywhere" style={input} />
      <Text style={label}>Needed before (YYYY-MM-DD)</Text><Field accessibilityLabel="Wanted needed before date" value={neededBefore} onChangeText={(value) => { invalidateRequests(); setNeededBefore(value); }} placeholder="Any date" style={input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Show filtered Wanted results" onPress={() => setFiltersOpen(false)} style={primary}><Text style={primaryText}>Show results</Text></Pressable>
    </Sheet>
  </SafeAreaView>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, backgroundColor: active ? T.ink : T.fieldbg }}><Text style={{ fontFamily: F.bold, color: active ? '#fff' : T.muted, fontSize: 13 }}>{label}</Text></Pressable>; }
function Empty({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}><Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>{title}</Text><Pressable onPress={onPress} style={primary}><Text style={primaryText}>{action}</Text></Pressable></View>; }
const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginTop: 15, marginBottom: 7 } as const;
const input = { height: 48, backgroundColor: T.fieldbg, borderRadius: 12, paddingHorizontal: 14, fontFamily: F.medium, color: T.ink, fontSize: 15 } as const;
const primary = { backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', marginTop: 18 } as const;
const primaryText = { fontFamily: F.bold, color: '#fff' } as const;
