// src/types/extensions.ts
// This file contains type extensions for existing types

import { Fixture, Player, Gameweek } from '@fpl-chat-app/types';
import { FplFixtureStat } from '@fpl-chat-app/types/fpl-api';

declare module '@fpl-chat-app/types' {
  // Extend Fixture with properties specifically needed for tools
  interface Fixture {
    team_h?: number;
    team_a?: number;
    team_h_difficulty?: number;
    team_a_difficulty?: number;
    stats?: FplFixtureStat[];
  }

  // Extend Player type with additional properties
  interface Player {
    team_name?: string;
    team_short?: string;
    points_per_game?: string;
    price_change_week?: number;
    price_change_event_fall?: number;
  }

  // Extend Gameweek with additional properties
  interface Gameweek {
    highest_score?: number;
    chip_plays?: Array<{
      chip_name: string;
      num_played: number;
    }>;
  }
}