import { describe, expect, it } from 'vitest';
import {
  counterpartId,
  loadTransaction,
  parseTransactionSourceIds,
  type TransactionAdapter,
} from './transaction';

function transactionFixture(): TransactionAdapter {
  return {
    async loadSale(id) {
      if (id !== 'sale-1') return null;
      return {
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        listing_title: 'Desk lamp',
        offer: 24,
        status: 'completed',
      };
    },
    async loadWanted(id) {
      if (id !== 'wanted-1') return null;
      return {
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        price: 24,
        status: 'accepted',
        completed_at: null,
        wanted_post: { title: 'Desk lamp' },
      };
    },
  };
}

describe('loadTransaction', () => {
  it('normalizes a completed sale transaction', async () => {
    const transaction = await loadTransaction(
      { kind: 'sale', id: 'sale-1' },
      transactionFixture(),
    );

    expect(transaction).toMatchObject({
      source: { kind: 'sale', id: 'sale-1' },
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      title: 'Desk lamp',
      price: 24,
      status: 'completed',
    });
    expect(counterpartId(transaction!, 'buyer-1')).toBe('seller-1');
  });

  it('normalizes an accepted Wanted offer as approved until completed_at is set', async () => {
    const transaction = await loadTransaction(
      { kind: 'wanted', id: 'wanted-1' },
      transactionFixture(),
    );

    expect(transaction).toMatchObject({
      source: { kind: 'wanted', id: 'wanted-1' },
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      title: 'Desk lamp',
      price: 24,
      status: 'approved',
    });
    expect(counterpartId(transaction!, 'seller-1')).toBe('buyer-1');
  });

  it('normalizes a Wanted offer with completed_at as completed', async () => {
    const adapter = transactionFixture();
    adapter.loadWanted = async () => ({
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      price: 24,
      status: 'accepted',
      completed_at: '2026-08-25T12:00:00.000Z',
      wanted_post: { title: 'Desk lamp' },
    });

    const transaction = await loadTransaction({ kind: 'wanted', id: 'wanted-1' }, adapter);

    expect(transaction?.status).toBe('completed');
  });

  it('rejects sale and Wanted rows that are not transaction states', async () => {
    const adapter = transactionFixture();
    adapter.loadSale = async () => ({
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      listing_title: 'Desk lamp',
      offer: null,
      status: 'pending',
    });
    adapter.loadWanted = async () => ({
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      price: 24,
      status: 'declined',
      completed_at: null,
      wanted_post: { title: 'Desk lamp' },
    });

    await expect(loadTransaction({ kind: 'sale', id: 'sale-1' }, adapter)).resolves.toBeNull();
    await expect(loadTransaction({ kind: 'wanted', id: 'wanted-1' }, adapter)).resolves.toBeNull();
  });
});

describe('parseTransactionSourceIds', () => {
  it('accepts exactly one non-empty sale or Wanted source ID', () => {
    expect(parseTransactionSourceIds({ request_id: 'sale-1' })).toEqual({
      kind: 'sale',
      id: 'sale-1',
    });
    expect(parseTransactionSourceIds({ wanted_offer_id: 'wanted-1' })).toEqual({
      kind: 'wanted',
      id: 'wanted-1',
    });
    expect(parseTransactionSourceIds({ request_id: 'sale-1', wanted_offer_id: 'wanted-1' })).toBeNull();
    expect(parseTransactionSourceIds({ request_id: 42, wanted_offer_id: 'wanted-1' })).toBeNull();
  });
});
