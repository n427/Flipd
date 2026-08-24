type DeleteQuery = {
  eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
};

type ConversationDatabase = {
  from(table: string): { delete(): DeleteQuery };
};

export async function deleteConversationForRequest(
  database: ConversationDatabase,
  requestId: string,
): Promise<void> {
  const { error } = await database.from('message_threads').delete().eq('request_id', requestId);
  if (error) throw new Error(error.message);
}
