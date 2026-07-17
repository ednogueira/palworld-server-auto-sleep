import { describe, expect, it } from 'vitest';
import { extractPlayerCount } from '../src/domain/player-count';

describe('extractPlayerCount', () => {
  it('suporta array direto', () => {
    expect(extractPlayerCount([{}, {}, {}])).toBe(3);
  });

  it('suporta players e player_list', () => {
    expect(extractPlayerCount({ players: [{}, {}] })).toBe(2);
    expect(extractPlayerCount({ player_list: [{}] })).toBe(1);
  });

  it('retorna null para formato desconhecido', () => {
    expect(extractPlayerCount({ foo: 'bar' })).toBeNull();
    expect(extractPlayerCount(null)).toBeNull();
  });
});
