import type { BeltFailure, BuildingTypeId, PlacementFailure, SelectedTool } from '@/game/types';

export type GameSfxEvent =
  | {
      readonly type: 'building_place_success';
      readonly buildingType: BuildingTypeId;
    }
  | {
      readonly type: 'building_place_fail';
      readonly buildingType: BuildingTypeId;
      readonly reason: PlacementFailure;
    }
  | {
      readonly type: 'building_remove_success';
      readonly buildingType: BuildingTypeId;
    }
  | {
      readonly type: 'belt_place_success';
      readonly segmentCount: number;
    }
  | {
      readonly type: 'belt_place_fail';
      readonly reason: BeltFailure;
    }
  | {
      readonly type: 'energy_link_connect';
    }
  | {
      readonly type: 'energy_link_disconnect';
    }
  | {
      readonly type: 'energy_link_fail';
      readonly action: 'connect' | 'disconnect';
    }
  | {
      readonly type: 'extractor_on';
    }
  | {
      readonly type: 'tool_select';
      readonly tool: SelectedTool['kind'];
    }
  | {
      readonly type: 'rotate_click';
    }
  | {
      readonly type: 'cancel_pop';
    }
  | {
      readonly type: 'ui_confirm';
      readonly context: 'reset_session';
    }
  | {
      readonly type: 'ui_back';
      readonly context: 'reset_session' | 'console_close' | 'debug_close';
    };

export type GameSfxListener = (event: GameSfxEvent) => void;
