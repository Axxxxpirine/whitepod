/**
 * The digit a key event stands for, on the top row or the numpad, whatever
 * the keyboard layout: an AZERTY top row types `& é " ' ( - è _ ç à` without
 * Shift, so the character alone misses every toolbar shortcut there (and its
 * `-` and `_` would read as zoom keys).
 */
export function digitOf(event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): string | null {
  if (/^[0-9]$/.test(event.key)) return event.key;
  // With Shift the top row is punctuation on QWERTY and QWERTZ (`+` is Shift+1 on a Swiss keyboard).
  if (event.shiftKey) return null;
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code ?? '');
  return match ? match[1]! : null;
}
