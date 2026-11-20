import { formatSeedInput, parseSeedInput } from '@/game/bot/seedInput';

interface ApplySeedAndResetSessionArgs {
  readonly seedInput: string;
  readonly setSeedInput: (value: string) => void;
  readonly resetSession: () => void;
}

export function applySeedAndResetSession({ seedInput, setSeedInput, resetSession }: ApplySeedAndResetSessionArgs): boolean {
  const parsed = parseSeedInput(seedInput);
  if (parsed === null) return false;

  setSeedInput(formatSeedInput(parsed));
  resetSession();
  return true;
}
