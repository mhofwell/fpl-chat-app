# FPL Tools Refactoring Plan

## Overview

This plan outlines the refactoring of FPL tools to create a more consistent, flexible, and maintainable structure. We've focused initially on Core Data and Analysis tools, deferring Strategic tools for a later phase.

## Phase 1: Core Data Tools (COMPLETED)

### 1. PlayerData Tool ✅
- **Consolidate**: Merged functionality from `player.ts` and `player-stats.ts`
- **Filename**: `player-data.ts`
- **Tool name**: `fpl_player_data`
- **Parameters**:
  - `playerQuery`: (string) Player name/ID
  - `includeHistory`: (boolean) Include match history
  - `includeFixtures`: (boolean) Include upcoming fixtures
  - `includeRawData`: (boolean) Include raw API data

### 2. TeamData Tool ✅
- **Refactor**: Enhanced existing `team.ts` with new capabilities
- **Filename**: `team-data.ts`
- **Tool name**: `fpl_team_data`
- **Parameters**:
  - `teamQuery`: (string) Team name/ID
  - `includeFixtures`: (boolean) Include upcoming fixtures
  - `includePlayers`: (boolean) Include key players
  - `includeForm`: (boolean) Include recent form
  - `includeRawData`: (boolean) Include raw data

### 3. FixtureData Tool ✅
- **Consolidate**: Refactored `search-fixtures.ts` to `fixture-data.ts`
- **Filename**: `fixture-data.ts`
- **Tool name**: `fpl_fixture_data`
- **Parameters**:
  - `teamQuery`: (string) One or two teams
  - `gameweekId`: (number) Specific gameweek
  - `range`: (string/number) 'next', 'previous', or specific number
  - `includeStats`: (boolean) Include detailed match stats
  - `includeRawData`: (boolean) Include raw data

### 4. LeagueData Tool ✅
- **Refactor**: Enhanced existing `league-leaders.ts` to `league-data.ts`
- **Filename**: `league-data.ts`
- **Tool name**: `fpl_league_data`
- **Parameters**:
  - `category`: (string) Statistic to rank by
  - `position`: (string) Filter by position
  - `limit`: (number) Number of players to return
  - `includeDetails`: (boolean) Include additional details

## Phase 2: Analysis Tools (COMPLETED)

### 5. PlayerComparison Tool ✅
- **Enhance**: Refactored from `compare-entities.ts`
- **Filename**: `player-comparison.ts`
- **Tool name**: `fpl_player_comparison`
- **Parameters**:
  - `playerQueries`: (array) Multiple players to compare
  - `categories`: (array) Stats to compare
  - `includeFixtures`: (boolean) Include fixture comparison
  - `includeHistory`: (boolean) Include form comparison

### 6. FixtureDifficulty Tool ✅
- **New tool**: Created from scratch
- **Filename**: `fixture-difficulty.ts`
- **Tool name**: `fpl_fixture_difficulty`
- **Parameters**:
  - `teamQuery`: (string) Team to analyze
  - `range`: (number) Number of fixtures to analyze
  - `position`: (string) Position to analyze difficulty for

## Phase 3: Strategic Tools (PLANNED)

### 7. TransferSuggestions Tool
- **New tool**: Will create from scratch
- **Filename**: `transfer-suggestions.ts`
- **Tool name**: `fpl_transfer_suggestions`
- **Parameters**:
  - `budget`: (number) Available budget for transfers
  - `position`: (string) Position to find players for
  - `fixtureDifficulty`: (boolean) Consider fixture difficulty
  - `form`: (boolean) Consider recent form

### 8. TeamOptimizer Tool
- **New tool**: Will create from scratch
- **Filename**: `team-optimizer.ts`
- **Tool name**: `fpl_team_optimizer`
- **Parameters**:
  - `teamId`: (number) FPL team ID
  - `chips`: (array) Available chips

## Implementation Status

1. ✅ Core Data Tools implemented
2. ✅ Analysis Tools implemented
3. ✅ Legacy tools fully deprecated and removed
4. ⬜ Strategic Tools to be implemented in future phase
5. ⬜ Test data created for validation
6. ⬜ Documentation updated

## Design Principles Applied

1. **Parameterized depth**: Each tool allows varying levels of detail through parameters
2. **Consistent response format**: All tools return data in a consistent, predictable structure
3. **Progressive disclosure**: Start with high-level information, then provide details
4. **Context preservation**: Include references to related entities
5. **Normalized data structures**: Use consistent terminology and data shapes across tools

## Migration Plan (COMPLETED)

The migration from legacy tools to new tools has been successfully completed. All legacy tools have been phased out and removed from the codebase.

### Legacy to New Tool Mapping (Historical Reference)

| Legacy Tool | New Tool | Notes |
|-------------|----------|-------|
| fpl_get_player_stats | fpl_player_data | New tool is more flexible |
| fpl_get_player | fpl_player_data | New tool is more flexible |
| fpl_get_team | fpl_team_data | New tool adds form analysis |
| fpl_search_fixtures | fpl_fixture_data | New tool adds range parameter |
| fpl_get_league_leaders | fpl_league_data | New tool adds points category |
| fpl_compare_entities | fpl_player_comparison | New tool focuses on player comparison |

## Next Steps

1. ✅ Complete Phase 1 (Core Data Tools) - DONE
2. ✅ Complete Phase 2 (Analysis Tools) - DONE
3. ✅ Begin phased deprecation of legacy tools - DONE
4. ⬜ Thoroughly test all new tools
5. ⬜ Communicate changes to client developers
6. ⬜ Create documentation for new tools
7. ⬜ Implement Phase 3 (Strategic Tools)