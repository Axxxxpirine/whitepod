/** Deposit amounts in the HUD: thin-space thousands, as in "1 520". */
export function formatAmount(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}
