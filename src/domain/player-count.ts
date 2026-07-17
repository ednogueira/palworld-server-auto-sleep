export function extractPlayerCount(response: unknown): number | null {
  if (Array.isArray(response)) {
    return response.length;
  }

  if (response === null || typeof response !== 'object') {
    return null;
  }

  const record = response as Record<string, unknown>;

  if (Array.isArray(record.players)) {
    return record.players.length;
  }

  if (Array.isArray(record.player_list)) {
    return record.player_list.length;
  }

  return null;
}
