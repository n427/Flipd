import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafetyReview } from '@/lib/listings';
import { T, F } from '@/lib/theme';

// Verdict styling. Deliberately restrained: 'thin' means we don't know much,
// not that the person is dangerous, so it reads as neutral rather than a
// warning. Only the icon and label differ; no red alarm state.
const META: Record<SafetyReview['verdict'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  looks_good: { label: 'Established profile', icon: 'shield-checkmark-outline', color: '#1E6B33' },
  mixed: { label: 'Some gaps', icon: 'information-circle-outline', color: '#8A6D1A' },
  thin: { label: 'New account', icon: 'help-circle-outline', color: T.muted },
};

/**
 * AI review of the counterparty, shown before someone commits to a request.
 *
 * Renders nothing when `review` is null — the review is advisory, so a failed
 * fetch quietly disappears rather than blocking or alarming.
 */
export function SafetyCard({ review, loading }: { review: SafetyReview | null; loading?: boolean }) {
  if (loading) {
    return (
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <ActivityIndicator size="small" color={T.muted} />
        <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: T.muted }}>Checking their profile…</Text>
      </View>
    );
  }
  if (!review) return null;

  const meta = META[review.verdict] ?? META.thin;
  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Ionicons name={meta.icon} size={16} color={meta.color} />
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: meta.color }}>{meta.label}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: F.semibold, fontSize: 10.5, color: T.muted, letterSpacing: 0.5 }}>
          AI REVIEW
        </Text>
      </View>

      <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: T.ink, lineHeight: 19.5 }}>
        {review.summary}
      </Text>

      {review.signals?.length ? (
        <View style={{ marginTop: 10, gap: 5 }}>
          {review.signals.map((s) => (
            <View key={s} style={{ flexDirection: 'row', gap: 7 }}>
              <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted }}>•</Text>
              <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 12.5, color: T.muted, lineHeight: 18 }}>
                {s}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const card = {
  backgroundColor: T.fieldbg,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: T.rule,
  padding: 14,
} as const;
