import { describe, expect, it } from 'vitest';
import { StateManager } from '../src/domain/state-manager';

describe('StateManager', () => {
  it('aceita transicoes validas', () => {
    const manager = new StateManager('STOPPED');

    expect(manager.transition('STARTING')).toBe(true);
    expect(manager.getState()).toBe('STARTING');

    expect(manager.transition('RUNNING')).toBe(true);
    expect(manager.getState()).toBe('RUNNING');

    expect(manager.transition('STOPPING')).toBe(true);
    expect(manager.getState()).toBe('STOPPING');

    expect(manager.transition('STOPPED')).toBe(true);
    expect(manager.getState()).toBe('STOPPED');
  });

  it('bloqueia transicoes invalidas e duplicadas', () => {
    const manager = new StateManager('STOPPED');

    expect(manager.transition('RUNNING')).toBe(false);
    expect(manager.getState()).toBe('STOPPED');

    expect(manager.transition('STOPPED')).toBe(false);
    expect(manager.getState()).toBe('STOPPED');
  });
});
