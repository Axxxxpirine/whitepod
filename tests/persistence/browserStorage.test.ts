import { afterEach, describe, expect, it } from 'vitest';
import { getLocalStorage } from '@/game/persistence/browserStorage';

describe('browserStorage', () => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (localStorageDescriptor) {
      Object.defineProperty(window, 'localStorage', localStorageDescriptor);
    }
  });

  it('returns null when localStorage access throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(getLocalStorage()).toBeNull();
  });
});
