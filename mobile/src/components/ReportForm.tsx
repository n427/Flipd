import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReportReason } from '@/lib/listings';
import { T, F } from '@/lib/theme';

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'prohibited', label: 'Prohibited item' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'other', label: 'Something else' },
];

/**
 * Reason picker + optional note. Content only — the caller supplies the sheet
 * around it, because a profile shows this inside its overflow menu while a
 * listing opens it as a sheet of its own.
 */
export function ReportForm({
  title,
  submitting,
  onSubmit,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  title: string;
  submitting: boolean;
  onSubmit: (reason: ReportReason, note: string) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');

  return (
    <View>
      <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>{title}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6 }}>
        What’s wrong? Reports are private.
      </Text>

      <View style={{ gap: 8, marginTop: 18 }}>
        {REPORT_REASONS.map((r) => {
          const on = reason === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => setReason(r.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
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
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? T.cardinal : T.rule} />
            </Pressable>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="Report details, optional"
        value={note}
        onChangeText={setNote}
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
        onPress={() => reason && onSubmit(reason, note)}
        disabled={submitting || !reason}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || !reason, busy: submitting }}
        style={{
          backgroundColor: T.cardinal,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          marginTop: 18,
          opacity: submitting || !reason ? 0.5 : 1,
        }}
      >
        <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>
          {submitting ? 'Sending…' : 'Submit report'}
        </Text>
      </Pressable>
      <Pressable onPress={onCancel} accessibilityRole="button" style={{ minHeight: 44, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}
