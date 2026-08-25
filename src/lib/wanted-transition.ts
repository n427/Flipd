export type TransactionSource =
  | { kind: 'sale'; id: string }
  | { kind: 'wanted'; id: string };

export function parseTransactionSource(row: {
  request_id: string | null;
  wanted_offer_id: string | null;
}): TransactionSource | null {
  if (Boolean(row.request_id) === Boolean(row.wanted_offer_id)) return null;
  return row.request_id
    ? { kind: 'sale', id: row.request_id }
    : { kind: 'wanted', id: row.wanted_offer_id! };
}
