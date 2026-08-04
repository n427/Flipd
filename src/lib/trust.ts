import { admin } from '@/lib/supabase/admin';

// Trust signals shown to a seller deciding whether to approve a request.
//
// Counts are derived live from reveal_requests rather than kept in counter
// columns on profiles. A denormalized counter reads faster but drifts the
// moment a write path forgets to bump it, and at campus scale these queries are
// two indexed counts. Correctness is worth more than the microseconds here.

export type SwapCounts = { asBuyer: number; asSeller: number };

export async function fetchSwapCounts(userId: string): Promise<SwapCounts> {
  const [buyer, seller] = await Promise.all([
    admin
      .from('reveal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', userId)
      .eq('status', 'completed'),
    admin
      .from('reveal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('status', 'completed'),
  ]);
  return { asBuyer: buyer.count ?? 0, asSeller: seller.count ?? 0 };
}
