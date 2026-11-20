import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BuildingPicker } from '@/components/hud/BuildingPicker';
import { BATTERY_BASIC_BUILDING_TYPE_ID, getBuildingType } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { resourceStockKey } from '@/game/data/resourceStock';
import { GameEngine } from '@/game/engine/GameEngine';
import { useGameStore } from '@/store/useGameStore';

const BATTERY = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.name;

function campaign(): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  return engine;
}

describe('BuildingPicker unlocks', () => {
  beforeEach(() => {
    useGameStore.setState({ engine: null, selectedTool: { kind: 'select' }, worldVersion: 0 });
  });

  it('shows a locked building greyed out with the milestone that unlocks it, and ignores clicks and shortcuts', () => {
    useGameStore.setState({ engine: campaign() });
    render(<BuildingPicker />);

    const battery = screen.getByRole('button', { name: `${BATTERY}, verrouillé` });
    expect(battery).toHaveAttribute('aria-disabled', 'true');
    const tooltip = document.getElementById(battery.getAttribute('aria-describedby')!);
    expect(tooltip).toHaveTextContent('Débloqué par : Premières extractions');

    fireEvent.click(battery);
    fireEvent.keyDown(window, { key: '5' });
    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
  });

  it('enables the building once its milestone is completed', () => {
    const engine = campaign();
    useGameStore.setState({ engine });
    render(<BuildingPicker />);

    const hub = engine.storageInventories.get(engine.getHubId()!)!;
    for (const { resourceType, amount } of engine.getActiveMilestone()!.requirements) {
      hub[resourceStockKey(resourceType)!] += amount;
    }
    act(() => {
      engine.completeActiveMilestone();
      useGameStore.getState().bumpWorldVersion();
    });

    fireEvent.click(screen.getByRole('button', { name: BATTERY }));
    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'building', buildingType: BATTERY_BASIC_BUILDING_TYPE_ID });
  });

  it('locks nothing in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);
    useGameStore.setState({ engine });
    render(<BuildingPicker />);

    expect(screen.queryAllByRole('button', { name: /verrouillé/ })).toHaveLength(0);
  });
});
