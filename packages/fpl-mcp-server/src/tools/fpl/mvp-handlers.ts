// fpl-mcp-server/src/tools/fpl/mvp-handlers.ts

// Note: In production, these would be shared modules or imported differently
// For MVP, we'll define the error type locally and use the API directly

export class FPLApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'FPLApiError';
  }
}

// Direct API access for MCP server
const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

async function fetchFromFPL(endpoint: string): Promise<any> {
  const response = await fetch(`${FPL_API_BASE}${endpoint}`);
  
  if (!response.ok) {
    throw new FPLApiError(
      `FPL API error: ${response.status}`,
      response.status,
      response.headers.get('retry-after') ? parseInt(response.headers.get('retry-after')!) : undefined
    );
  }
  
  return response.json();
}

// Mock implementation of fplMVPTools for MCP server
const fplMVPTools = {
  async getLeagueLeaders(params: any) {
    const data = await fetchFromFPL('/bootstrap-static/');
    const players = data.elements;
    
    // Sort and filter based on category
    let sorted = [...players];
    
    if (params.position) {
      const positionMap: any = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
      sorted = sorted.filter((p: any) => p.element_type === positionMap[params.position]);
    }
    
    // Map category to field
    const categoryMap: any = {
      'goals': 'goals_scored',
      'assists': 'assists',
      'cards': 'yellow_cards',
      'clean_sheets': 'clean_sheets',
      'saves': 'saves',
      'minutes': 'minutes'
    };
    
    const field = categoryMap[params.category] || 'goals_scored';
    sorted = sorted.filter((p: any) => p[field] > 0);
    sorted.sort((a: any, b: any) => b[field] - a[field]);
    sorted = sorted.slice(0, params.limit || 10);
    
    // Get team data
    const teams = data.teams;
    
    return sorted.map((player: any) => {
      const team = teams.find((t: any) => t.id === player.team);
      return {
        id: player.id,
        name: `${player.first_name} ${player.second_name}`,
        teamShort: team ? team.short_name : 'Unknown',
        value: player[field],
        gamesPlayed: player.starts,
        perGame: player.starts > 0 ? (player[field] / player.starts).toFixed(2) : '0',
        form: player.form
      };
    });
  },

  async getPlayerStats(params: any) {
    const data = await fetchFromFPL('/bootstrap-static/');
    const teams = data.teams;
    
    let player;
    if (params.playerId) {
      player = data.elements.find((p: any) => p.id === params.playerId);
    } else if (params.playerName) {
      const searchName = params.playerName.toLowerCase();
      player = data.elements.find((p: any) => 
        p.web_name.toLowerCase().includes(searchName) ||
        `${p.first_name} ${p.second_name}`.toLowerCase().includes(searchName)
      );
    }
    
    if (!player) {
      throw new Error('Player not found');
    }
    
    const team = teams.find((t: any) => t.id === player.team);
    const positionMap: any = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    
    return {
      player: {
        id: player.id,
        name: `${player.first_name} ${player.second_name}`,
        team: team ? team.name : 'Unknown',
        position: positionMap[player.element_type] || 'Unknown'
      },
      currentSeason: {
        goals: player.goals_scored,
        assists: player.assists,
        minutes: player.minutes,
        gamesPlayed: player.starts,
        yellowCards: player.yellow_cards,
        redCards: player.red_cards,
        cleanSheets: player.clean_sheets,
        saves: player.saves,
        goalsPerGame: player.starts > 0 ? (player.goals_scored / player.starts).toFixed(2) : '0',
        assistsPerGame: player.starts > 0 ? (player.assists / player.starts).toFixed(2) : '0'
      },
      fplData: {
        totalPoints: player.total_points,
        currentPrice: (player.now_cost / 10).toFixed(1),
        selectedBy: `${player.selected_by_percent}%`,
        form: player.form
      },
      availability: {
        status: player.status,
        news: player.news,
        newsAdded: player.news_added
      },
      form: params.includeForm ? { last5Games: [] } : null
    };
  },

  async searchPlayers(params: any) {
    const data = await fetchFromFPL('/bootstrap-static/');
    const teams = data.teams;
    
    let filtered = [...data.elements];
    
    // Filter by query
    if (params.query) {
      const query = params.query.toLowerCase();
      filtered = filtered.filter((p: any) =>
        p.web_name.toLowerCase().includes(query) ||
        `${p.first_name} ${p.second_name}`.toLowerCase().includes(query)
      );
    }
    
    // Filter by position
    if (params.position) {
      const positionMap: any = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
      filtered = filtered.filter((p: any) => p.element_type === positionMap[params.position]);
    }
    
    // Filter by team
    if (params.teamName) {
      const team = teams.find((t: any) => 
        t.name.toLowerCase().includes(params.teamName.toLowerCase()) ||
        t.short_name.toLowerCase().includes(params.teamName.toLowerCase())
      );
      if (team) {
        filtered = filtered.filter((p: any) => p.team === team.id);
      }
    }
    
    // Filter by stats
    if (params.minGoals !== undefined) {
      filtered = filtered.filter((p: any) => p.goals_scored >= params.minGoals);
    }
    if (params.minAssists !== undefined) {
      filtered = filtered.filter((p: any) => p.assists >= params.minAssists);
    }
    
    // Sort
    const sortMap: any = {
      'goals': 'goals_scored',
      'assists': 'assists',
      'points': 'total_points',
      'form': 'form',
      'price': 'now_cost'
    };
    
    const sortField = sortMap[params.sortBy] || 'goals_scored';
    filtered.sort((a: any, b: any) => b[sortField] - a[sortField]);
    
    // Limit results
    filtered = filtered.slice(0, params.limit || 10);
    
    // Map to result format
    const positionMap: any = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    
    return filtered.map((player: any) => {
      const team = teams.find((t: any) => t.id === player.team);
      return {
        id: player.id,
        name: `${player.first_name} ${player.second_name}`,
        team: team ? team.short_name : 'Unknown',
        position: positionMap[player.element_type] || 'Unknown',
        stats: {
          goals: player.goals_scored,
          assists: player.assists,
          minutes: player.minutes
        },
        fpl: {
          points: player.total_points,
          price: (player.now_cost / 10).toFixed(1),
          selectedBy: `${player.selected_by_percent}%`,
          form: player.form
        },
        availability: {
          status: player.status,
          news: player.news
        }
      };
    });
  }
};

// Handler for league leaders (top scorers, assists, etc.)
export async function handleGetLeagueLeaders(params: any) {
  try {
    const {
      category = 'goals',
      position,
      limit = 10,
      includeDetails = true
    } = params;
    
    // Validate category
    const validCategories = ['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes'];
    if (!validCategories.includes(category)) {
      return {
        error: true,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      };
    }
    
    // Validate position if provided
    if (position && !['GKP', 'DEF', 'MID', 'FWD'].includes(position)) {
      return {
        error: true,
        message: 'Invalid position. Must be one of: GKP, DEF, MID, FWD'
      };
    }
    
    const leaders = await fplMVPTools.getLeagueLeaders({
      category,
      position,
      limit,
      includeDetails
    });
    
    // Format response
    let responseText = `Top ${limit} by ${category}`;
    if (position) responseText += ` (${position})`;
    responseText += ':\n\n';
    
    leaders.forEach((player: any, index: number) => {
      responseText += `${index + 1}. ${player.name} (${player.teamShort}) - `;
      responseText += `${player.value} ${category}`;
      
      if (player.gamesPlayed > 0) {
        responseText += ` in ${player.gamesPlayed} games`;
        if (player.perGame) {
          responseText += ` (${player.perGame} per game)`;
        }
      }
      
      if (includeDetails && player.form) {
        responseText += ` - Form: ${player.form}`;
      }
      
      responseText += '\n';
    });
    
    responseText += `\nNote: These are actual Premier League ${category}, not FPL points.`;
    
    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    
  } catch (error: any) {
    console.error('Error in handleGetLeagueLeaders:', error);
    
    if (error instanceof FPLApiError) {
      if (error.statusCode === 503 || error.statusCode === 502) {
        return {
          error: true,
          message: 'The FPL API is currently unavailable. Please try again in a few minutes.',
          retryAfter: error.retryAfter
        };
      }
    }
    
    return {
      error: true,
      message: 'Failed to retrieve league leaders. Please try again later.'
    };
  }
}

// Handler for individual player stats
export async function handleGetPlayerStats(params: any) {
  try {
    const {
      playerName,
      playerId,
      includeForm = true
    } = params;
    
    if (!playerName && !playerId) {
      return {
        error: true,
        message: 'Please provide either playerName or playerId'
      };
    }
    
    const stats = await fplMVPTools.getPlayerStats({
      playerName,
      playerId,
      includeForm
    });
    
    // Format response
    let responseText = `${stats.player.name} (${stats.player.team}) - ${stats.player.position}\n\n`;
    
    responseText += `Season Stats:\n`;
    responseText += `- Goals: ${stats.currentSeason.goals}`;
    responseText += ` (${stats.currentSeason.goalsPerGame} per game)\n`;
    responseText += `- Assists: ${stats.currentSeason.assists}`;
    responseText += ` (${stats.currentSeason.assistsPerGame} per game)\n`;
    responseText += `- Minutes: ${stats.currentSeason.minutes}`;
    responseText += ` (${stats.currentSeason.gamesPlayed} games)\n`;
    responseText += `- Cards: ${stats.currentSeason.yellowCards} yellow, ${stats.currentSeason.redCards} red\n`;
    
    if (stats.player.position === 'GKP' || stats.player.position === 'DEF') {
      responseText += `- Clean Sheets: ${stats.currentSeason.cleanSheets}\n`;
    }
    
    if (stats.player.position === 'GKP') {
      responseText += `- Saves: ${stats.currentSeason.saves}\n`;
    }
    
    responseText += `\nFPL Data:\n`;
    responseText += `- Points: ${stats.fplData.totalPoints}\n`;
    responseText += `- Price: £${stats.fplData.currentPrice}m\n`;
    responseText += `- Selected by: ${stats.fplData.selectedBy}\n`;
    responseText += `- Form: ${stats.fplData.form}\n`;
    
    if (stats.availability.news) {
      responseText += `\nAvailability:\n`;
      responseText += `- Status: ${stats.availability.status}\n`;
      responseText += `- News: ${stats.availability.news}\n`;
    }
    
    if (includeForm && stats.form) {
      responseText += `\nLast 5 Games:\n`;
      stats.form.last5Games.forEach((game: any) => {
        responseText += `- GW${game.gameweek}: ${game.goals}g ${game.assists}a ${game.points}pts\n`;
      });
    }
    
    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    
  } catch (error: any) {
    console.error('Error in handleGetPlayerStats:', error);
    
    if ((error as any).message.includes('Multiple players found')) {
      return {
        error: true,
        message: error.message
      };
    }
    
    return {
      error: true,
      message: `Failed to retrieve player stats: ${(error as any).message}`
    };
  }
}

// Handler for player search
export async function handleSearchPlayers(params: any) {
  try {
    const {
      query,
      position,
      minGoals,
      minAssists,
      teamName,
      sortBy = 'goals',
      limit = 10
    } = params;
    
    // Validate sortBy
    const validSortOptions = ['goals', 'assists', 'points', 'form', 'price'];
    if (!validSortOptions.includes(sortBy)) {
      return {
        error: true,
        message: `Invalid sortBy. Must be one of: ${validSortOptions.join(', ')}`
      };
    }
    
    const players = await fplMVPTools.searchPlayers({
      query,
      position,
      minGoals,
      minAssists,
      teamName,
      sortBy,
      limit
    });
    
    if (players.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No players found matching your criteria.'
        }]
      };
    }
    
    // Format response
    let responseText = `Found ${players.length} players`;
    
    // Add search criteria to response
    const criteria = [];
    if (query) criteria.push(`matching "${query}"`);
    if (position) criteria.push(`position: ${position}`);
    if (teamName) criteria.push(`team: ${teamName}`);
    if (minGoals !== undefined) criteria.push(`min goals: ${minGoals}`);
    if (minAssists !== undefined) criteria.push(`min assists: ${minAssists}`);
    
    if (criteria.length > 0) {
      responseText += ` (${criteria.join(', ')})`;
    }
    
    responseText += `, sorted by ${sortBy}:\n\n`;
    
    players.forEach((player: any, index: number) => {
      responseText += `${index + 1}. ${player.name} (${player.team}) - ${player.position}\n`;
      responseText += `   Goals: ${player.stats.goals}, Assists: ${player.stats.assists}\n`;
      responseText += `   FPL: ${player.fpl.points} pts, £${player.fpl.price}m, ${player.fpl.selectedBy}\n`;
      
      if (player.availability.news) {
        responseText += `   ⚠️ ${player.availability.news}\n`;
      }
      
      responseText += '\n';
    });
    
    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    
  } catch (error: any) {
    console.error('Error in handleSearchPlayers:', error);
    
    return {
      error: true,
      message: 'Failed to search players. Please try again later.'
    };
  }
}

// Export all handlers
export const mvpHandlers = {
  getLeagueLeaders: handleGetLeagueLeaders,
  getPlayerStats: handleGetPlayerStats,
  searchPlayers: handleSearchPlayers
};