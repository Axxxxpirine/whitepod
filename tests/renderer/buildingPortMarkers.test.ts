import { describe, expect, it } from 'vitest';
import { PIXI } from '@/design/tokens';
import { getBuildingType, MERGER_BASIC_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { drawBuildingPortMarkers } from '@/game/renderer/buildingPortMarkers';
import { Direction, PortKind } from '@/game/types';

function strokeColorsByKind(typeId: string): { inputs: number[]; outputs: number[] } {
  const type = getBuildingType(typeId)!;
  const colors: number[] = [];
  drawBuildingPortMarkers(
    {
      moveTo: () => {},
      lineTo: () => {},
      circle: () => {},
      fill: () => {},
      stroke: (style) => colors.push(style.color),
    },
    { id: 1, typeId, origin: { x: 4, y: 4 }, rotation: Direction.North },
    type,
  );
  const inputs: number[] = [];
  const outputs: number[] = [];
  type.ports.forEach((port, index) => (port.kind === PortKind.Input ? inputs : outputs).push(colors[index]!));
  return { inputs, outputs };
}

describe('building port markers', () => {
  it('draws inputs in cyan and outputs in ivory, keeping amber for warnings', () => {
    const { inputs, outputs } = strokeColorsByKind(MERGER_BASIC_BUILDING_TYPE_ID);

    expect(inputs.length).toBeGreaterThan(0);
    expect(outputs.length).toBeGreaterThan(0);
    expect(new Set(inputs)).toEqual(new Set([PIXI.accent]));
    expect(new Set(outputs)).toEqual(new Set([PIXI.ink]));
  });
});
