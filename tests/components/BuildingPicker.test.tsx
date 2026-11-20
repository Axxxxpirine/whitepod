import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BuildingPicker } from '@/components/hud/BuildingPicker';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  BELT_STRAIGHT_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { resourceStockKey } from '@/game/data/resourceStock';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

const BATTERY = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.name;
const STORAGE = getBuildingType(STORAGE_BUILDING_TYPE_ID)!.name;
const STORAGE_REGOLITH = getBuildingType(STORAGE_BUILDING_TYPE_ID)!.cost!.find((l) => l.resourceType === ResourceType.Regolith)!.amount;
const BELT_SEGMENT_REGOLITH = getBuildingType(BELT_STRAIGHT_BUILDING_TYPE_ID)!.cost![0]!.amount;

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

describe('BuildingPicker costs', () => {
  beforeEach(() => {
    useGameStore.setState({ engine: null, selectedTool: { kind: 'select' }, worldVersion: 0 });
  });

  function hubStock(engine: GameEngine) {
    return engine.storageInventories.get(engine.getHubId()!)!;
  }

  it('shows the cost of each available building and the belt cost per segment', () => {
    const engine = campaign();
    hubStock(engine).regolith = 1000;
    useGameStore.setState({ engine });
    render(<BuildingPicker />);

    const storageCost = screen.getByRole('group', { name: new RegExp(`^Coût de ${STORAGE} : `) });
    expect(storageCost).toHaveTextContent(String(STORAGE_REGOLITH));
    expect(storageCost.querySelector('[data-short]')).toBeNull();
    expect(screen.getByRole('group', { name: /^Coût par segment de Convoyeur : / })).toHaveTextContent(
      String(BELT_SEGMENT_REGOLITH),
    );
    // Locked entries show their unlock hint instead of a cost.
    expect(screen.queryByRole('group', { name: new RegExp(`^Coût de ${BATTERY}`) })).toBeNull();
  });

  it('marks a building the stock cannot pay, and refreshes when the stock moves', () => {
    const engine = campaign();
    hubStock(engine).regolith = 0;
    useGameStore.setState({ engine });
    render(<BuildingPicker />);

    const storageCost = () => screen.getByRole('group', { name: new RegExp(`^Coût de ${STORAGE} : `) });
    expect(storageCost()).toHaveAccessibleName(expect.stringContaining('ressources insuffisantes'));
    expect(storageCost().querySelector('[data-short]')).toHaveClass('text-accent-warm');
    const storage = screen.getByRole('button', { name: STORAGE });
    expect(document.getElementById(storage.getAttribute('aria-describedby')!)).toHaveTextContent('Ressources insuffisantes');

    act(() => {
      hubStock(engine).regolith = 1000;
      useGameStore.getState().bumpWorldVersion();
    });
    expect(storageCost().querySelector('[data-short]')).toBeNull();
  });

  it('shows no cost in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);
    useGameStore.setState({ engine });
    render(<BuildingPicker />);

    expect(screen.queryAllByRole('group', { name: /^Coût/ })).toHaveLength(0);
  });
});
