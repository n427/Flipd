import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { loadTransaction } from '@/lib/transaction';
import type { TransactionSource } from '@/lib/wanted-transition';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { kind, id } = await params;
  if (kind !== 'sale' && kind !== 'wanted') {
    return NextResponse.json({ error: "kind must be 'sale' or 'wanted'" }, { status: 400 });
  }
  const source: TransactionSource = { kind, id };
  const transaction = await loadTransaction(source);
  if (!transaction) return NextResponse.json({ error: 'transaction not found' }, { status: 404 });
  if (user.id !== transaction.buyerId && user.id !== transaction.sellerId) {
    return NextResponse.json({ error: 'not your transaction' }, { status: 403 });
  }
  if (transaction.status === 'completed') {
    return NextResponse.json({ error: 'transaction is already completed' }, { status: 409 });
  }

  const completedAt = new Date().toISOString();
  const mutation = source.kind === 'sale'
    ? admin
        .from('reveal_requests')
        .update({ status: 'completed', resolved_at: completedAt })
        .eq('id', source.id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle()
    : admin
        .from('wanted_offers')
        .update({ completed_at: completedAt })
        .eq('id', source.id)
        .eq('status', 'accepted')
        .is('completed_at', null)
        .select('id')
        .maybeSingle();
  const { data, error } = await mutation;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: 'transaction is no longer completable' }, { status: 409 });
  }

  return NextResponse.json({
    transaction: { ...transaction, status: 'completed' as const },
  });
}
