import { describe, expect, it } from 'vitest';
import { EnergyNetwork } from '@/game/systems/EnergyNetwork';

describe('EnergyNetwork cache behavior', () => {
  it('ticks version on successful register, connect, disconnect, and unregister', () => {
    const network = new EnergyNetwork();

    expect(network.version).toBe(0);
    network.registerBuilding(1);
    expect(network.version).toBe(1);
    network.registerBuilding(2);
    expect(network.version).toBe(2);
    expect(network.connect(1, 2)).toBe(true);
    expect(network.version).toBe(3);
    expect(network.disconnect(1, 2)).toBe(true);
    expect(network.version).toBe(4);
    network.unregisterBuilding(2);
    expect(network.version).toBe(5);
  });

  it('does not tick version on no-op mutations', () => {
    const network = new EnergyNetwork();
    network.registerBuilding(1);
    network.registerBuilding(2);
    const versionAfterRegister = network.version;

    network.registerBuilding(1);
    expect(network.version).toBe(versionAfterRegister);

    expect(network.connect(1, 2)).toBe(true);
    const versionAfterConnect = network.version;
    expect(network.connect(1, 2)).toBe(false);
    expect(network.version).toBe(versionAfterConnect);

    expect(network.disconnect(1, 2)).toBe(true);
    const versionAfterDisconnect = network.version;
    expect(network.disconnect(1, 2)).toBe(false);
    expect(network.version).toBe(versionAfterDisconnect);

    network.unregisterBuilding(99);
    expect(network.version).toBe(versionAfterDisconnect);
  });

  it('invalidates cached component lookups after mutations', () => {
    const network = new EnergyNetwork();
    network.registerBuilding(1);
    network.registerBuilding(2);
    network.registerBuilding(3);

    expect(network.connect(1, 2)).toBe(true);
    expect(network.getComponentFor(1)).toEqual([1, 2]);
    expect(network.getComponentFor(2)).toEqual([1, 2]);

    expect(network.connect(2, 3)).toBe(true);
    expect(network.getComponentFor(1)).toEqual([1, 2, 3]);
    expect(network.getComponentFor(3)).toEqual([1, 2, 3]);

    expect(network.disconnect(2, 3)).toBe(true);
    expect(network.getComponentFor(1)).toEqual([1, 2]);
    expect(network.getComponentFor(3)).toEqual([3]);
  });

  it('invalidates cached component lists when registering a new singleton', () => {
    const network = new EnergyNetwork();
    network.registerBuilding(1);
    network.registerBuilding(2);
    expect(network.connect(1, 2)).toBe(true);

    expect(network.getComponents()).toEqual([[1, 2]]);

    network.registerBuilding(3);

    expect(network.getComponents()).toEqual([[1, 2], [3]]);
  });
});
