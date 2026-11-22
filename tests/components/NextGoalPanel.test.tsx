import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextGoalPanel } from '@/components/hud/NextGoalPanel';
import { GameMode } from '@/game/data/gameMode';
import { MILESTONES, getChapterTitle } from '@/game/data/milestoneCatalog';
import { resourceStockKey } from '@/game/data/resourceStock';
import { GameEngine } from '@/game/engine/GameEngine';
import { chapterLabel, unlockLabels } from '@/game/ui/milestonePresentation';
import { beltTypeIds } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';

const FIRST = MILESTONES[0]!;
const SECOND = MILESTONES[1]!;
const FIRST_REQUIREMENT = FIRST.requirements[0]!;
const FIRST_KEY = resourceStockKey(FIRST_REQUIREMENT.resourceType)!;

function campaign(): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  // Start from an empty hub so progress reads from zero.
  engine.storageInventories.get(engine.getHubId()!)![FIRST_KEY] = 0;
  return engine;
}

function hubStock(engine: GameEngine) {
  return engine.storageInventories.get(engine.getHubId()!)!;
}

/** Simulates a world change, as GameCanvas does on every engine 'world' notification. */
function worldChanged(change: () => void = () => {}) {
  act(() => {
    change();
    useGameStore.getState().bumpWorldVersion();
  });
}

describe('NextGoalPanel', () => {
  beforeEach(() => {
    useGameStore.setState({ engine: null, worldVersion: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is hidden in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);
    useGameStore.setState({ engine });
    render(<NextGoalPanel />);

    expect(screen.queryByRole('region', { name: 'Prochain objectif' })).toBeNull();
  });

  it('shows the chapter, the milestone, one bar per requirement and what it unlocks', () => {
    useGameStore.setState({ engine: campaign() });
    render(<NextGoalPanel />);

    expect(screen.getByRole('region', { name: 'Prochain objectif' })).toBeInTheDocument();
    expect(screen.getByText(chapterLabel(FIRST.chapter))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: FIRST.title })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(FIRST.requirements.length);
    expect(screen.getByText(`0 / ${FIRST_REQUIREMENT.amount}`)).toBeInTheDocument();
    expect(screen.getByText(unlockLabels(FIRST.unlocks).join(', '))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Livraisons en cours' })).toBeDisabled();
  });

  it('follows hub deliveries live, capped at the requirement', () => {
    const engine = campaign();
    useGameStore.setState({ engine });
    render(<NextGoalPanel />);

    worldChanged(() => {
      hubStock(engine)[FIRST_KEY] = 12;
    });
    expect(screen.getByText(`12 / ${FIRST_REQUIREMENT.amount}`)).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '12');

    worldChanged(() => {
      hubStock(engine)[FIRST_KEY] = FIRST_REQUIREMENT.amount * 3;
    });
    expect(screen.getByText(`${FIRST_REQUIREMENT.amount} / ${FIRST_REQUIREMENT.amount}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider le palier' })).toBeEnabled();
  });

  it('completes the milestone, confirms it briefly and moves to the next one', () => {
    vi.useFakeTimers();
    const engine = campaign();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);
    useGameStore.setState({ engine });
    render(<NextGoalPanel />);
    worldChanged(() => {
      hubStock(engine)[FIRST_KEY] = FIRST_REQUIREMENT.amount;
    });

    worldChanged(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Valider le palier' }));
    });

    expect(engine.getCompletedMilestoneIds()).toEqual([FIRST.id]);
    expect(hubStock(engine)[FIRST_KEY]).toBe(0);
    expect(onSfx).toHaveBeenCalledWith({ type: 'ui_confirm', context: 'milestone_complete' });
    expect(screen.getByRole('status')).toHaveTextContent(`Palier atteint · ${FIRST.title}`);
    expect(screen.getByRole('heading', { name: SECOND.title })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so once every milestone of the version is reached', () => {
    const engine = campaign();
    for (const milestone of MILESTONES) {
      for (const { resourceType, amount } of milestone.requirements) {
        hubStock(engine)[resourceStockKey(resourceType)!] += amount;
      }
      engine.completeActiveMilestone();
    }
    useGameStore.setState({ engine });
    render(<NextGoalPanel />);

    expect(screen.getByText('Tous les paliers de cette version sont atteints.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('milestone presentation', () => {
  it('names chapters, and falls back to the number for unnamed ones', () => {
    expect(chapterLabel(1)).toBe(`Chapitre 1 · ${getChapterTitle(1)}`);
    expect(chapterLabel(99)).toBe('Chapitre 99');
  });

  it('lists building names before recipe names', () => {
    const refinery = MILESTONES.find((m) => m.unlocks.buildings.length > 0 && m.unlocks.recipes.length > 0)!;
    const labels = unlockLabels(refinery.unlocks);

    expect(labels).toHaveLength(refinery.unlocks.buildings.length + refinery.unlocks.recipes.length);
    expect(labels.some((label) => label.includes('_'))).toBe(false);
  });

  it('names a belt tier once, not each of its pieces', () => {
    expect(unlockLabels({ buildings: [...beltTypeIds('fast')], recipes: ['carbon_dioxide'] })).toEqual([
      'Convoyeur rapide',
      'Synthèse de CO₂',
    ]);
  });
});
