import { NextRequest, NextResponse } from 'next/server';
import { runSweep, wantedLifecycleProducer } from '@/lib/sweep';
import { popupRemindersProducer } from '@/lib/sweep/popup-reminders';
import { requestLifecycleProducer } from '@/lib/sweep/request-lifecycle';
import { digestProducer } from '@/lib/digest';

// Secret-guarded sweep, called hourly by Supabase pg_cron with
// `Authorization: Bearer $CRON_SECRET`. Every producer decides what is DUE
// rather than what time it is, so running late, twice, or at any frequency is
// safe. Adding a producer means adding it to the array below — never a second
// cron entry.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // The producer list lives here, not in the harness: runSweep stays
  // producer-agnostic so its isolation guarantee is testable without a
  // database. Each producer isolates its own failures, so adding one cannot
  // break the others.
  const result = await runSweep([
    popupRemindersProducer,
    requestLifecycleProducer,
    wantedLifecycleProducer,
    digestProducer,
  ]);
  return NextResponse.json(result);
}
