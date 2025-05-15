// lib/fpl-api/mvp-tools.ts

import { cacheManager } from './cache-manager-mvp';
import { PlayerNameMatcher } from './player-name-matcher';
import { 
  LeagueLeader, 
  PlayerStats, 
  SearchPlayerResult,
  FPLElement,
  FPLTeam
} from '@/types/fpl-mvp';

// Helper to get position name
function getPositionName(elementType: number): string {
  const positions: { [key: number]: string } = { 
    1: 'GKP', 
    2: 'DEF', 
    3: 'MID', 
    4: 'FWD' 
  };
  return positions[elementType] || 'Unknown';
}

// Helper to calculate per-game stats
function calculatePerGame(value: number, minutes: number): string {
  const games = Math.max(1, Math.floor(minutes / 60)); // Rough approximation
  return (value / games).toFixed(2);
}

// Tool 1: Get League Leaders (top scorers, assists, etc.)
export async function getLeagueLeaders(params: {
  category: 'goals' | 'assists' | 'cards' | 'clean_sheets' | 'saves' | 'minutes';
  position?: 'GKP' | 'DEF' | 'MID' | 'FWD';
  limit?: number;
  includeDetails?: boolean;
}): Promise<LeagueLeader[]> {
  const { category, position, limit = 10, includeDetails = true } = params;
  
  try {
    // Get bootstrap data (includes all players)
    const bootstrapData = await cacheManager.getBootstrapData();
    let players: FPLElement[] = bootstrapData.elements;
    const teams: FPLTeam[] = bootstrapData.teams;
    
    // Filter by position if specified
    if (position) {
      const positionMap = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
      players = players.filter(p => p.element_type === positionMap[position]);
    }
    
    // Sort by the requested category
    let sortedPlayers: FPLElement[];
    switch (category) {
      case 'goals':
        sortedPlayers = [...players].sort((a, b) => b.goals_scored - a.goals_scored);
        break;
      case 'assists':
        sortedPlayers = [...players].sort((a, b) => b.assists - a.assists);
        break;
      case 'cards':
        sortedPlayers = [...players].sort((a, b) => {
          const aCards = a.yellow_cards + (a.red_cards * 2);
          const bCards = b.yellow_cards + (b.red_cards * 2);
          return bCards - aCards;
        });
        break;
      case 'clean_sheets':
        sortedPlayers = [...players].sort((a, b) => b.clean_sheets - a.clean_sheets);
        break;
      case 'saves':
        sortedPlayers = [...players].sort((a, b) => b.saves - a.saves);
        break;
      case 'minutes':
        sortedPlayers = [...players].sort((a, b) => b.minutes - a.minutes);
        break;
      default:
        throw new Error(`Unknown category: ${category}`);
    }
    
    // Get top N players
    const topPlayers = sortedPlayers.slice(0, limit);
    
    // Build response
    const results: LeagueLeader[] = topPlayers.map(player => {
      const team = teams.find(t => t.id === player.team);
      const gamesPlayed = Math.floor(player.minutes / 60);
      
      const baseData: LeagueLeader = {
        id: player.id,
        name: player.web_name,
        firstName: player.first_name,
        lastName: player.second_name,
        team: team?.name || 'Unknown',
        teamShort: team?.short_name || 'UNK',
        position: getPositionName(player.element_type),
        value: getCategoryValue(player, category),
        gamesPlayed,
        minutesPlayed: player.minutes
      };
      
      if (includeDetails) {
        return {
          ...baseData,
          perGame: gamesPlayed > 0 ? (getCategoryValue(player, category) / gamesPlayed).toFixed(2) : '0.00',
          form: player.form,
          price: player.now_cost / 10,
          selectedBy: player.selected_by_percent + '%',
          news: player.news,
          status: player.status,
          stats: {
            goals: player.goals_scored,
            assists: player.assists,
            cleanSheets: player.clean_sheets,
            saves: player.saves,
            yellowCards: player.yellow_cards,
            redCards: player.red_cards,
            minutes: player.minutes
          }
        };
      }
      
      return baseData;
    });
    
    return results;
    
  } catch (error) {
    console.error('Error in getLeagueLeaders:', error);
    throw new Error('Failed to retrieve league leaders. The FPL API may be unavailable.');
  }
}

// Tool 2: Get Player Stats
export async function getPlayerStats(params: {
  playerName?: string;
  playerId?: number;
  includeForm?: boolean;
}): Promise<PlayerStats> {
  const { playerName, playerId, includeForm = true } = params;
  
  try {
    // Get bootstrap data
    const bootstrapData = await cacheManager.getBootstrapData();
    const players: FPLElement[] = bootstrapData.elements;
    const teams: FPLTeam[] = bootstrapData.teams;
    
    // Find player
    let player: FPLElement | undefined;
    
    if (playerId) {
      player = players.find(p => p.id === playerId);
    } else if (playerName) {
      const matcher = new PlayerNameMatcher(players);
      const result = matcher.findPlayer(playerName);
      
      if (result.type === 'exact') {
        player = players.find(p => p.id === result.playerId);
      } else if (result.type === 'disambiguation_needed') {
        throw new Error(result.message || 'Multiple players found. Please be more specific.');
      } else if (result.type === 'fuzzy_matches' && result.suggestions && result.suggestions.length > 0) {
        // Take the first fuzzy match
        player = players.find(p => p.id === result.suggestions![0].playerIds[0]);
      }
    }
    
    if (!player) {
      throw new Error(`Player not found: ${playerName || playerId}`);
    }
    
    const team = teams.find(t => t.id === player.team);
    const gamesPlayed = Math.floor(player.minutes / 60);
    
    // Build stats response
    const stats: PlayerStats = {
      player: {
        id: player.id,
        name: player.web_name,
        fullName: `${player.first_name} ${player.second_name}`,
        team: team?.name || 'Unknown',
        position: getPositionName(player.element_type)
      },
      currentSeason: {
        goals: player.goals_scored,
        assists: player.assists,
        cleanSheets: player.clean_sheets,
        saves: player.saves,
        yellowCards: player.yellow_cards,
        redCards: player.red_cards,
        minutes: player.minutes,
        gamesPlayed,
        goalsPerGame: calculatePerGame(player.goals_scored, player.minutes),
        assistsPerGame: calculatePerGame(player.assists, player.minutes),
        minutesPerGame: gamesPlayed > 0 ? Math.round(player.minutes / gamesPlayed) : 0
      },
      fplData: {
        totalPoints: player.total_points,
        currentPrice: player.now_cost / 10,
        selectedBy: player.selected_by_percent + '%',
        form: player.form,
        pointsPerGame: player.points_per_game
      },
      availability: {
        status: player.status,
        news: player.news,
        newsAdded: player.news_added
      }
    };
    
    // Add form data if requested
    if (includeForm) {
      try {
        const playerDetail = await cacheManager.getPlayerDetail(player.id);
        
        if (playerDetail && playerDetail.history) {
          const recentGames = playerDetail.history.slice(-5);
          
          stats.form = {
            last5Games: recentGames.map((game: any) => ({
              gameweek: game.round,
              points: game.total_points,
              goals: game.goals_scored,
              assists: game.assists,
              minutes: game.minutes
            })),
            averagePoints: recentGames.reduce((sum: number, g: any) => sum + g.total_points, 0) / recentGames.length,
            totalGoals: recentGames.reduce((sum: number, g: any) => sum + g.goals_scored, 0),
            totalAssists: recentGames.reduce((sum: number, g: any) => sum + g.assists, 0)
          };
        }
      } catch (error) {
        console.error('Error fetching player form:', error);
        // Continue without form data
      }
    }
    
    return stats;
    
  } catch (error) {
    console.error('Error in getPlayerStats:', error);
    throw error;
  }
}

// Tool 3: Search Players
export async function searchPlayers(params: {
  query?: string;
  position?: 'GKP' | 'DEF' | 'MID' | 'FWD';
  minGoals?: number;
  minAssists?: number;
  teamName?: string;
  sortBy?: 'goals' | 'assists' | 'points' | 'form' | 'price';
  limit?: number;
}): Promise<SearchPlayerResult[]> {
  const { 
    query, 
    position, 
    minGoals, 
    minAssists, 
    teamName, 
    sortBy = 'goals', 
    limit = 10 
  } = params;
  
  try {
    const bootstrapData = await cacheManager.getBootstrapData();
    let players: FPLElement[] = bootstrapData.elements;
    const teams: FPLTeam[] = bootstrapData.teams;
    
    // Apply filters
    if (position) {
      const positionMap = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
      players = players.filter(p => p.element_type === positionMap[position]);
    }
    
    if (minGoals !== undefined) {
      players = players.filter(p => p.goals_scored >= minGoals);
    }
    
    if (minAssists !== undefined) {
      players = players.filter(p => p.assists >= minAssists);
    }
    
    if (teamName) {
      const team = teams.find(t => 
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        t.short_name.toLowerCase() === teamName.toLowerCase()
      );
      
      if (team) {
        players = players.filter(p => p.team === team.id);
      }
    }
    
    if (query) {
      const matcher = new PlayerNameMatcher(players);
      const matchedIds = matcher.searchPlayers(query);
      players = players.filter(p => matchedIds.includes(p.id));
    }
    
    // Sort
    switch (sortBy) {
      case 'goals':
        players.sort((a, b) => b.goals_scored - a.goals_scored);
        break;
      case 'assists':
        players.sort((a, b) => b.assists - a.assists);
        break;
      case 'points':
        players.sort((a, b) => b.total_points - a.total_points);
        break;
      case 'form':
        players.sort((a, b) => parseFloat(b.form) - parseFloat(a.form));
        break;
      case 'price':
        players.sort((a, b) => b.now_cost - a.now_cost);
        break;
    }
    
    // Get top N
    const topPlayers = players.slice(0, limit);
    
    // Build results
    return topPlayers.map(player => {
      const team = teams.find(t => t.id === player.team);
      const gamesPlayed = Math.floor(player.minutes / 60);
      
      return {
        id: player.id,
        name: player.web_name,
        team: team?.name || 'Unknown',
        position: getPositionName(player.element_type),
        stats: {
          goals: player.goals_scored,
          assists: player.assists,
          minutes: player.minutes,
          gamesPlayed,
          goalsPerGame: calculatePerGame(player.goals_scored, player.minutes),
          assistsPerGame: calculatePerGame(player.assists, player.minutes)
        },
        fpl: {
          points: player.total_points,
          price: player.now_cost / 10,
          selectedBy: player.selected_by_percent + '%',
          form: player.form
        },
        availability: {
          status: player.status,
          news: player.news
        }
      };
    });
    
  } catch (error) {
    console.error('Error in searchPlayers:', error);
    throw new Error('Failed to search players. The FPL API may be unavailable.');
  }
}

// Helper function to get category value
function getCategoryValue(player: FPLElement, category: string): number {
  switch (category) {
    case 'goals': return player.goals_scored;
    case 'assists': return player.assists;
    case 'cards': return player.yellow_cards + (player.red_cards * 2);
    case 'clean_sheets': return player.clean_sheets;
    case 'saves': return player.saves;
    case 'minutes': return player.minutes;
    default: return 0;
  }
}

// Export all tools
export const fplMVPTools = {
  getLeagueLeaders,
  getPlayerStats,
  searchPlayers
};