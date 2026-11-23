import { describe, it, expect } from 'vitest';
import { ConnectionRegistry } from '@/game/data/ConnectionRegistry';

describe('ConnectionRegistry', () => {
  it('register → get returns the same connection', () => {
    const reg = new ConnectionRegistry();
    const id = reg.register(
      { building: 1, port: 'out' },
      { building: 2, port: 'in' },
    )!;
    expect(reg.get(id)).toEqual({
      id,
      from: { building: 1, port: 'out' },
      to: { building: 2, port: 'in' },
    });
  });

  it('IDs are strictly increasing', () => {
    const reg = new ConnectionRegistry();
    const id1 = reg.register({ building: 1, port: 'a' }, { building: 2, port: 'a' })!;
    reg.unregister(id1);
    const id2 = reg.register({ building: 1, port: 'a' }, { building: 2, port: 'a' })!;
    expect(id2).toBeGreaterThan(id1);
  });

  it('unregister removes from map and from both buildings index', () => {
    const reg = new ConnectionRegistry();
    const id = reg.register({ building: 1, port: 'a' }, { building: 2, port: 'a' })!;
    expect(reg.unregister(id)).toBe(true);
    expect(reg.get(id)).toBeNull();
    expect(reg.getConnectionsOf(1)).toEqual([]);
    expect(reg.getConnectionsOf(2)).toEqual([]);
  });

  it('getConnectionsOf returns connections where building appears in from OR to', () => {
    const reg = new ConnectionRegistry();
    reg.register({ building: 1, port: 'a' }, { building: 2, port: 'a' });
    reg.register({ building: 3, port: 'a' }, { building: 1, port: 'b' });
    expect(reg.getConnectionsOf(1)).toHaveLength(2);
    expect(reg.getConnectionsOf(2)).toHaveLength(1);
    expect(reg.getConnectionsOf(3)).toHaveLength(1);
  });

  it('getConnectionsOf returns [] for unknown building', () => {
    const reg = new ConnectionRegistry();
    expect(reg.getConnectionsOf(999)).toEqual([]);
  });

  it('id overflow returns null', () => {
    const reg = new ConnectionRegistry();
    // force nextId past max
    for (let i = 0; i < 65535; i++) {
      const id = reg.register({ building: 1, port: `p${i}` }, { building: 2, port: `p${i}` });
      expect(id).not.toBeNull();
    }
    expect(reg.hasIdCapacity()).toBe(false);
    expect(reg.register({ building: 1, port: 'x' }, { building: 2, port: 'x' })).toBeNull();
  });

  it('reuses freed ids once every id has been handed out', () => {
    const reg = new ConnectionRegistry();
    for (let i = 0; i < 65535; i++) {
      reg.register({ building: 1, port: `p${i}` }, { building: 2, port: `p${i}` });
    }
    reg.unregister(1234);
    expect(reg.hasIdCapacity()).toBe(true);
    expect(reg.register({ building: 1, port: 'x' }, { building: 2, port: 'x' })).toBe(1234);
    expect(reg.isPortConnected(1, 'x')).toBe(true);
    expect(reg.hasIdCapacity()).toBe(false);
  });

  it('isPortConnected tracks both endpoints', () => {
    const reg = new ConnectionRegistry();
    reg.register({ building: 1, port: 'out' }, { building: 2, port: 'in' });
    expect(reg.isPortConnected(1, 'out')).toBe(true);
    expect(reg.isPortConnected(2, 'in')).toBe(true);
    expect(reg.isPortConnected(1, 'in')).toBe(false);
  });

  it('unregisterAllFor drops every connection touching a building', () => {
    const reg = new ConnectionRegistry();
    reg.register({ building: 1, port: 'a' }, { building: 2, port: 'a' });
    reg.register({ building: 3, port: 'a' }, { building: 1, port: 'b' });
    reg.register({ building: 4, port: 'a' }, { building: 5, port: 'a' });
    expect(reg.unregisterAllFor(1)).toBe(2);
    expect(reg.getConnectionsOf(1)).toEqual([]);
    expect(reg.getConnectionsOf(2)).toEqual([]);
    expect(reg.getConnectionsOf(3)).toEqual([]);
    expect(reg.getConnectionsOf(4)).toHaveLength(1);
    expect(reg.getAll().size).toBe(1);
  });

  it('serialize/deserialize roundtrip restores instances and indexes', () => {
    const reg = new ConnectionRegistry();
    const id = reg.register({ building: 1, port: 'out' }, { building: 2, port: 'in' })!;

    const restored = ConnectionRegistry.deserialize(reg.serialize());

    expect(restored.get(id)).toEqual({
      id,
      from: { building: 1, port: 'out' },
      to: { building: 2, port: 'in' },
    });
    expect(restored.isPortConnected(1, 'out')).toBe(true);
    expect(restored.isPortConnected(2, 'in')).toBe(true);
  });

  it('deserialize throws on unknown version', () => {
    expect(() =>
      ConnectionRegistry.deserialize({
        version: 999,
        nextId: 1,
        connections: [],
      }),
    ).toThrow(/version/);
  });
});
