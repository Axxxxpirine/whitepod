function isStorageLike(value: unknown): value is Storage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).removeItem === 'function'
  );
}

export function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (isStorageLike(window.localStorage)) return window.localStorage;
  return null;
}
