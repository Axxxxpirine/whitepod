const PENDING_SCENARIO_INSTALL_KEY = '__whitepodPendingScenarioInstall';

export function markPendingScenarioInstall(): void {
  (window as Window & { [PENDING_SCENARIO_INSTALL_KEY]?: boolean })[PENDING_SCENARIO_INSTALL_KEY] = true;
}

export function hasPendingScenarioInstall(): boolean {
  return Boolean((window as Window & { [PENDING_SCENARIO_INSTALL_KEY]?: boolean })[PENDING_SCENARIO_INSTALL_KEY]);
}

export function clearPendingScenarioInstall(): void {
  delete (window as Window & { [PENDING_SCENARIO_INSTALL_KEY]?: boolean })[PENDING_SCENARIO_INSTALL_KEY];
}
