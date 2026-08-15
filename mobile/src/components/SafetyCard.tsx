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
  // Compact on purpose. This sits inside the request sheet, above the message
  // box, and every line it takes is a line of the thing someone actually came
  // to write. The verdict plus a two-line summary is the decision-useful part;
  // the signals list behind it was detail nobody reads mid-flow.
  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Ionicons name={meta.icon} size={15} color={meta.color} />
        <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: meta.color }}>{meta.label}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: F.semibold, fontSize: 10, color: T.muted, letterSpacing: 0.5 }}>
          AI REVIEW
        </Text>
      </View>

      {/* No numberOfLines: clipping mid-sentence is worse than a slightly
          taller card. The length is constrained at the source instead — the
          safety prompt asks for one sentence, 25 words at most. */}
      <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.ink, lineHeight: 18 }}>
        {review.summary}
      </Text>
    </View>
  );
}

const card = {
  backgroundColor: T.fieldbg,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: T.rule,
  paddingHorizontal: 12,
  paddingVertical: 10,
} as const;
