import { NextRequest, NextResponse } from 'next/server';
import { runSweep } from '@/lib/sweep';
import { popupRemindersProducer } from '@/lib/sweep/popup-reminders';

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
  const result = await runSweep([popupRemindersProducer]);
  return NextResponse.json(result);
}
