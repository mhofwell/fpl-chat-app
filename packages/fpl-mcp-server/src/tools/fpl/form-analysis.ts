// src/tools/fpl/form-analysis.ts
import { McpToolContext, McpToolResponse } from '../../types/mcp-types';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';

interface FormAnalysisParams {
  entityType: 'player' | 'team';  // Analyze a player or team
  entityQuery: string;            // Player name/ID or team name/ID
  timeframe?: number;             // Number of gameweeks to analyze (default: 5)
  metricFocus?: string[];         // Which metrics to focus on (e.g., goals, xG, bonus)
  compareWithPrevious?: boolean;  // Compare with previous equivalent timeframe
  includeRawData?: boolean;       // Include raw data in response
}

export async function getFormAnalysis(
  params: FormAnalysisParams,
  _context: McpToolContext
): Promise<McpToolResponse> {
  try {
    const {
      entityType,
      entityQuery,
      timeframe = 5,
      metricFocus = ['points', 'goals', 'assists', 'bonus'],
      compareWithPrevious = false,
      includeRawData = false
    } = params;
    
    const dataTimestamp = new Date().toISOString();
    
    // Fetch bootstrap data
    const bootstrapData = await fetchFromFPL('/bootstrap-static/');
    const allTeams = bootstrapData.teams;
    const allPlayers = bootstrapData.elements;
    const allGameweeks = bootstrapData.events;
    
    // Find current gameweek
    const currentGameweek = allGameweeks.find((gw: any) => gw.is_current)?.id || 
                          allGameweeks.find((gw: any) => gw.is_next)?.id - 1;
    
    // Calculate analysis starting gameweek
    const startGW = Math.max(1, currentGameweek - timeframe + 1);
    
    // Response variables
    let entityName = '';
    let formMetrics: any = {};
    let trendAnalysis: string[] = [];
    let comparisonResults: any = {};
    
    if (entityType === 'player') {
      // Logic for analyzing player form
      let targetPlayer;
      
      // Determine if entityQuery is an ID
      const numericId = parseInt(entityQuery);
      if (!isNaN(numericId)) {
        targetPlayer = allPlayers.find((p: any) => p.id === numericId);
      } else {
        // Search by name
        targetPlayer = allPlayers.find((p: any) => 
          `${p.first_name} ${p.second_name}`.toLowerCase().includes(entityQuery.toLowerCase()) ||
          p.web_name.toLowerCase().includes(entityQuery.toLowerCase())
        );
      }
      
      if (!targetPlayer) {
        return createStructuredErrorResponse(
          `Player "${entityQuery}" not found.`,
          'NOT_FOUND',
          ['Check player name/ID spelling', 'Try a different spelling or ID']
        );
      }
      
      entityName = `${targetPlayer.first_name} ${targetPlayer.second_name}`;
      
      // Fetch detailed player history
      const playerDetails = await fetchFromFPL(`/element-summary/${targetPlayer.id}/`);
      const playerHistory = playerDetails.history || [];
      
      // Filter relevant gameweeks
      const recentGames = playerHistory
        .filter((game: any) => game.round >= startGW && game.round <= currentGameweek)
        .sort((a: any, b: any) => a.round - b.round);
      
      // Calculate form metrics
      formMetrics = calculatePlayerFormMetrics(recentGames, metricFocus);
      
      // Generate trend analysis
      trendAnalysis = generatePlayerTrendAnalysis(recentGames, formMetrics, targetPlayer);
      
      // Compare with previous period if requested
      if (compareWithPrevious && currentGameweek > timeframe * 2) {
        const previousStartGW = Math.max(1, startGW - timeframe);
        const previousGames = playerHistory
          .filter((game: any) => game.round >= previousStartGW && game.round < startGW)
          .sort((a: any, b: any) => a.round - b.round);
        
        comparisonResults = comparePlayerPeriods(recentGames, previousGames, metricFocus);
      }
      
    } else if (entityType === 'team') {
      // Logic for analyzing team form
      let targetTeam;
      
      // Determine if entityQuery is an ID
      const numericId = parseInt(entityQuery);
      if (!isNaN(numericId)) {
        targetTeam = allTeams.find((t: any) => t.id === numericId);
      } else {
        // Search by name
        targetTeam = allTeams.find((t: any) => 
          t.name.toLowerCase().includes(entityQuery.toLowerCase()) ||
          (t.short_name && t.short_name.toLowerCase().includes(entityQuery.toLowerCase()))
        );
      }
      
      if (!targetTeam) {
        return createStructuredErrorResponse(
          `Team "${entityQuery}" not found.`,
          'NOT_FOUND',
          ['Check team name/ID spelling', 'Try a different spelling or ID']
        );
      }
      
      entityName = targetTeam.name;
      
      // Fetch fixtures
      const fixturesData = await fetchFromFPL('/fixtures/');
      
      // Filter completed team fixtures in timeframe
      const teamFixtures = fixturesData.filter((f: any) => 
        (f.team_h === targetTeam.id || f.team_a === targetTeam.id) &&
        f.finished &&
        f.event >= startGW && 
        f.event <= currentGameweek
      ).sort((a: any, b: any) => a.event - b.event);
      
      // Calculate team form metrics
      formMetrics = calculateTeamFormMetrics(teamFixtures, targetTeam.id);
      
      // Generate trend analysis
      trendAnalysis = generateTeamTrendAnalysis(teamFixtures, formMetrics, targetTeam);
      
      // Compare with previous period if requested
      if (compareWithPrevious && currentGameweek > timeframe * 2) {
        const previousStartGW = Math.max(1, startGW - timeframe);
        const previousFixtures = fixturesData.filter((f: any) => 
          (f.team_h === targetTeam.id || f.team_a === targetTeam.id) &&
          f.finished &&
          f.event >= previousStartGW && 
          f.event < startGW
        ).sort((a: any, b: any) => a.event - b.event);
        
        comparisonResults = compareTeamPeriods(teamFixtures, previousFixtures, targetTeam.id);
      }
    } else {
      return createStructuredErrorResponse(
        `Invalid entity type "${entityType}". Must be "player" or "team".`,
        'VALIDATION_ERROR',
        ['Use entityType=player or entityType=team']
      );
    }
    
    // Build response
    let responseText = `FORM_ANALYSIS: ${entityName} (Last ${timeframe} gameweeks)\n\n`;
    
    // Summary section
    responseText += `SUMMARY:\n`;
    if (entityType === 'player') {
      responseText += `Minutes: ${formMetrics.minutes || 0}\n`;
      responseText += `Points: ${formMetrics.points || 0} (${(formMetrics.pointsPerMin || 0).toFixed(2)} per min)\n`;
      responseText += `Goals: ${formMetrics.goals || 0}\n`;
      responseText += `Assists: ${formMetrics.assists || 0}\n`;
      if (formMetrics.cleanSheets !== undefined) responseText += `Clean Sheets: ${formMetrics.cleanSheets || 0}\n`;
      responseText += `Bonus: ${formMetrics.bonus || 0}\n`;
      responseText += `Expected Goals (xG): ${(formMetrics.xG || 0).toFixed(2)}\n`;
      responseText += `Expected Assists (xA): ${(formMetrics.xA || 0).toFixed(2)}\n`;
    } else {
      responseText += `Games: ${formMetrics.games || 0}\n`;
      responseText += `Record: ${formMetrics.wins || 0}W-${formMetrics.draws || 0}D-${formMetrics.losses || 0}L\n`;
      responseText += `Goals Scored: ${formMetrics.goalsScored || 0} (${(formMetrics.goalsScored / formMetrics.games || 0).toFixed(2)} per game)\n`;
      responseText += `Goals Conceded: ${formMetrics.goalsConceded || 0} (${(formMetrics.goalsConceded / formMetrics.games || 0).toFixed(2)} per game)\n`;
      responseText += `Clean Sheets: ${formMetrics.cleanSheets || 0}\n`;
      responseText += `Points: ${formMetrics.points || 0} (${(formMetrics.points / (formMetrics.games * 3) * 100 || 0).toFixed(1)}% of possible)\n`;
    }
    
    // Trend Analysis
    responseText += `\nTREND_ANALYSIS:\n`;
    trendAnalysis.forEach(trend => {
      responseText += `- ${trend}\n`;
    });
    
    // Comparison section if available
    if (compareWithPrevious && Object.keys(comparisonResults).length > 0) {
      responseText += `\nCOMPARISON_WITH_PREVIOUS_${timeframe}_GAMEWEEKS:\n`;
      
      if (entityType === 'player') {
        const metrics = ['minutes', 'points', 'goals', 'assists', 'bonus', 'xG', 'xA'];
        
        metrics.forEach(metric => {
          if (comparisonResults[metric] !== undefined) {
            const change = comparisonResults[metric].change;
            const changeText = change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
            const changePercent = comparisonResults[metric].percentChange || 0;
            const changePercentText = changePercent > 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`;
            
            responseText += `- ${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${changeText} (${changePercentText})\n`;
          }
        });
      } else {
        // Team comparison
        const metrics = ['points', 'goalsScored', 'goalsConceded', 'cleanSheets', 'wins', 'draws', 'losses'];
        
        metrics.forEach(metric => {
          if (comparisonResults[metric] !== undefined) {
            const change = comparisonResults[metric].change;
            const changeText = change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
            const changePercent = comparisonResults[metric].percentChange || 0;
            const changePercentText = changePercent > 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`;
            
            responseText += `- ${formatMetricName(metric)}: ${changeText} (${changePercentText})\n`;
          }
        });
      }
    }
    
    // Include form rating
    const formRating = calculateFormRating(formMetrics, entityType);
    responseText += `\nFORM_RATING: ${formRating}/10\n`;
    
    responseText += `\nData timestamp: ${dataTimestamp}`;
    
    // Include raw data if requested
    if (includeRawData) {
      const rawData = {
        entityType,
        entityName,
        formMetrics,
        trendAnalysis,
        comparisonResults,
        formRating
      };
      responseText += `\n\nRAW_DATA:\n${JSON.stringify(rawData, null, 2)}`;
    }
    
    return {
      content: [{ type: 'text' as const, text: responseText.trim() }]
    };
  } catch (error: any) {
    console.error('Error in getFormAnalysis:', error);
    
    if (error instanceof FPLApiError) {
      if (error.statusCode === 503 || error.statusCode === 502) {
        return createStructuredErrorResponse(
          'The FPL API is currently unavailable. Please try again in a few minutes.',
          'API_ERROR',
          ['Try again later']
        );
      }
    }
    
    return createStructuredErrorResponse(
      error.message || 'Failed to analyze form. Please try again later.',
      'EXECUTION_ERROR'
    );
  }
}

// Helper functions for player analysis
function calculatePlayerFormMetrics(games: any[], metricFocus: string[]) {
  const metrics: any = {
    games: games.length,
    minutes: 0,
    points: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    bonus: 0,
    yellowCards: 0,
    redCards: 0,
    xG: 0,
    xA: 0
  };
  
  games.forEach(game => {
    metrics.minutes += game.minutes || 0;
    metrics.points += game.total_points || 0;
    metrics.goals += game.goals_scored || 0;
    metrics.assists += game.assists || 0;
    metrics.cleanSheets += game.clean_sheets || 0;
    metrics.bonus += game.bonus || 0;
    metrics.yellowCards += game.yellow_cards || 0;
    metrics.redCards += game.red_cards || 0;
    metrics.xG += parseFloat(game.expected_goals || '0');
    metrics.xA += parseFloat(game.expected_assists || '0');
  });
  
  // Calculate per-minute metrics
  if (metrics.minutes > 0) {
    metrics.pointsPerMin = metrics.points / metrics.minutes;
    metrics.pointsPer90 = metrics.pointsPerMin * 90;
    metrics.goalsPer90 = (metrics.goals / metrics.minutes) * 90;
    metrics.assistsPer90 = (metrics.assists / metrics.minutes) * 90;
  }
  
  return metrics;
}

function generatePlayerTrendAnalysis(games: any[], metrics: any, player: any) {
  const trends: string[] = [];
  
  // Check if player is getting consistent minutes
  if (games.length > 0) {
    const minutesPerGame = metrics.minutes / games.length;
    if (minutesPerGame >= 85) {
      trends.push("Consistently playing full matches");
    } else if (minutesPerGame >= 60) {
      trends.push("Getting regular minutes but sometimes subbed off");
    } else if (minutesPerGame >= 30) {
      trends.push("Limited playing time, often used as a substitute");
    } else {
      trends.push("Very limited playing time");
    }
  }
  
  // Compare actual vs expected goals
  if (metrics.goals > 0 || metrics.xG > 0) {
    const goalDiff = metrics.goals - metrics.xG;
    if (goalDiff >= 2) {
      trends.push("Significantly overperforming xG - may not be sustainable");
    } else if (goalDiff <= -2) {
      trends.push("Underperforming xG - could see improved returns soon");
    }
  }
  
  // Analyze bonus point acquisition
  if (metrics.points > 0) {
    const bonusPerc = (metrics.bonus * 3) / metrics.points * 100;
    if (bonusPerc >= 25) {
      trends.push("Excellent at accumulating bonus points");
    }
  }
  
  // Look for form improvement
  if (games.length >= 3) {
    const recentPoints = games.slice(-3).reduce((sum: number, g: any) => sum + (g.total_points || 0), 0);
    const earlierPoints = games.slice(0, games.length - 3).reduce((sum: number, g: any) => sum + (g.total_points || 0), 0) / Math.max(1, games.length - 3);
    
    if (recentPoints / 3 >= earlierPoints * 1.5 && earlierPoints > 0) {
      trends.push("Form improving - recent performances better than earlier games");
    } else if (recentPoints / 3 <= earlierPoints * 0.5 && recentPoints > 0) {
      trends.push("Form declining - recent performances worse than earlier games");
    }
  }
  
  // Add position-specific trends
  const position = ['GKP', 'DEF', 'MID', 'FWD'][player.element_type - 1];
  
  if (position === 'GKP' || position === 'DEF') {
    if (metrics.cleanSheets / Math.max(1, games.length) >= 0.5) {
      trends.push("Strong defensive returns with frequent clean sheets");
    }
    
    if (position === 'DEF' && (metrics.goals > 0 || metrics.assists > 0)) {
      trends.push("Contributing offensively in addition to defensive returns");
    }
  }
  
  if (position === 'MID' || position === 'FWD') {
    if (metrics.goals > 0 && metrics.assists > 0) {
      trends.push("Balanced attacking returns with both goals and assists");
    } else if (metrics.goals > metrics.assists * 2 && metrics.goals > 0) {
      trends.push("Goal-focused returns - primarily scoring rather than assisting");
    } else if (metrics.assists > metrics.goals * 2 && metrics.assists > 0) {
      trends.push("Creative player focused on assists rather than scoring");
    }
  }
  
  // Add a trend if no games with returns
  if (games.length > 0 && metrics.goals === 0 && metrics.assists === 0 && metrics.cleanSheets === 0) {
    trends.push("No attacking or defensive returns in the analyzed period");
  }
  
  return trends;
}

function comparePlayerPeriods(currentGames: any[], previousGames: any[], metricFocus: string[]) {
  const current = calculatePlayerFormMetrics(currentGames, metricFocus);
  const previous = calculatePlayerFormMetrics(previousGames, metricFocus);
  const comparison: any = {};
  
  // Calculate changes for each relevant metric
  ['minutes', 'points', 'goals', 'assists', 'cleanSheets', 'bonus', 'xG', 'xA'].forEach(metric => {
    if (current[metric] !== undefined && previous[metric] !== undefined) {
      const change = current[metric] - previous[metric];
      let percentChange = 0;
      
      if (previous[metric] > 0) {
        percentChange = (change / previous[metric]) * 100;
      } else if (change > 0) {
        percentChange = 100; // If previous was 0 and now it's something
      }
      
      comparison[metric] = {
        current: current[metric],
        previous: previous[metric],
        change,
        percentChange
      };
    }
  });
  
  return comparison;
}

// Helper functions for team analysis
function calculateTeamFormMetrics(fixtures: any[], teamId: number) {
  const metrics: any = {
    games: fixtures.length,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsScored: 0,
    goalsConceded: 0,
    cleanSheets: 0,
    xGF: 0, // Expected goals for
    xGA: 0  // Expected goals against
  };
  
  fixtures.forEach(fixture => {
    const isHome = fixture.team_h === teamId;
    const homeGoals = fixture.team_h_score || 0;
    const awayGoals = fixture.team_a_score || 0;
    
    // Calculate team goals for this fixture
    const teamGoals = isHome ? homeGoals : awayGoals;
    const opponentGoals = isHome ? awayGoals : homeGoals;
    
    metrics.goalsScored += teamGoals;
    metrics.goalsConceded += opponentGoals;
    
    // Clean sheet logic
    if (opponentGoals === 0) {
      metrics.cleanSheets += 1;
    }
    
    // Win/draw/loss logic
    if (teamGoals > opponentGoals) {
      metrics.wins += 1;
      metrics.points += 3;
    } else if (teamGoals === opponentGoals) {
      metrics.draws += 1;
      metrics.points += 1;
    } else {
      metrics.losses += 1;
    }
    
    // Add expected goals metrics if available
    if (fixture.team_h_expected_goals && fixture.team_a_expected_goals) {
      metrics.xGF += isHome ? parseFloat(fixture.team_h_expected_goals) : parseFloat(fixture.team_a_expected_goals);
      metrics.xGA += isHome ? parseFloat(fixture.team_a_expected_goals) : parseFloat(fixture.team_h_expected_goals);
    }
  });
  
  // Calculate averages
  if (metrics.games > 0) {
    metrics.pointsPerGame = metrics.points / metrics.games;
    metrics.goalsPerGame = metrics.goalsScored / metrics.games;
    metrics.goalsConcededPerGame = metrics.goalsConceded / metrics.games;
  }
  
  return metrics;
}

function generateTeamTrendAnalysis(fixtures: any[], metrics: any, team: any) {
  const trends: string[] = [];
  
  // Analyze overall form
  if (metrics.games > 0) {
    const winPercentage = (metrics.wins / metrics.games) * 100;
    
    if (winPercentage >= 67) {
      trends.push("Excellent form with high win percentage");
    } else if (winPercentage >= 50) {
      trends.push("Good form with more wins than losses");
    } else if (winPercentage >= 33) {
      trends.push("Mixed form with more losses than wins");
    } else {
      trends.push("Poor form with low win percentage");
    }
  }
  
  // Analyze goal scoring
  if (metrics.games > 0) {
    if (metrics.goalsPerGame >= 2.5) {
      trends.push("Very strong attacking returns with high goals per game");
    } else if (metrics.goalsPerGame >= 1.5) {
      trends.push("Good attacking output");
    } else if (metrics.goalsPerGame < 1) {
      trends.push("Struggling to score goals");
    }
  }
  
  // Analyze defense
  if (metrics.games > 0) {
    if (metrics.cleanSheets / metrics.games >= 0.5) {
      trends.push("Strong defense with frequent clean sheets");
    }
    
    if (metrics.goalsConcededPerGame <= 0.5) {
      trends.push("Excellent defensive record with few goals conceded");
    } else if (metrics.goalsConcededPerGame >= 2) {
      trends.push("Defensive issues with high goals conceded per game");
    }
  }
  
  // Compare actual vs expected goals
  if (metrics.xGF > 0 || metrics.goalsScored > 0) {
    const goalDiff = metrics.goalsScored - metrics.xGF;
    if (goalDiff >= 3) {
      trends.push("Significantly overperforming attacking xG - may not be sustainable");
    } else if (goalDiff <= -3) {
      trends.push("Underperforming attacking xG - could see improved goal returns soon");
    }
  }
  
  // Recent form (last 3 games vs earlier games)
  if (fixtures.length >= 5) {
    const recentFixtures = fixtures.slice(-3);
    const earlierFixtures = fixtures.slice(0, fixtures.length - 3);
    
    // Calculate points in recent fixtures
    let recentPoints = 0;
    recentFixtures.forEach(fixture => {
      const isHome = fixture.team_h === team.id;
      const teamGoals = isHome ? fixture.team_h_score : fixture.team_a_score;
      const opponentGoals = isHome ? fixture.team_a_score : fixture.team_h_score;
      
      if (teamGoals > opponentGoals) recentPoints += 3;
      else if (teamGoals === opponentGoals) recentPoints += 1;
    });
    
    // Calculate points in earlier fixtures
    let earlierPoints = 0;
    earlierFixtures.forEach(fixture => {
      const isHome = fixture.team_h === team.id;
      const teamGoals = isHome ? fixture.team_h_score : fixture.team_a_score;
      const opponentGoals = isHome ? fixture.team_a_score : fixture.team_h_score;
      
      if (teamGoals > opponentGoals) earlierPoints += 3;
      else if (teamGoals === opponentGoals) earlierPoints += 1;
    });
    
    const recentAvg = recentPoints / Math.max(1, recentFixtures.length);
    const earlierAvg = earlierFixtures.length > 0 ? earlierPoints / earlierFixtures.length : 0;
    
    if (recentAvg > earlierAvg * 1.5 && earlierAvg > 0) {
      trends.push("Form improving - recent results better than earlier games");
    } else if (recentAvg < earlierAvg * 0.5 && recentAvg > 0) {
      trends.push("Form declining - recent results worse than earlier games");
    }
  }
  
  return trends;
}

function compareTeamPeriods(currentFixtures: any[], previousFixtures: any[], teamId: number) {
  const current = calculateTeamFormMetrics(currentFixtures, teamId);
  const previous = calculateTeamFormMetrics(previousFixtures, teamId);
  const comparison: any = {};
  
  // Calculate changes for each relevant metric
  ['wins', 'draws', 'losses', 'points', 'goalsScored', 'goalsConceded', 'cleanSheets'].forEach(metric => {
    if (current[metric] !== undefined && previous[metric] !== undefined) {
      const change = current[metric] - previous[metric];
      let percentChange = 0;
      
      if (previous[metric] > 0) {
        percentChange = (change / previous[metric]) * 100;
      } else if (change > 0) {
        percentChange = 100; // If previous was 0 and now it's something
      }
      
      comparison[metric] = {
        current: current[metric],
        previous: previous[metric],
        change,
        percentChange
      };
    }
  });
  
  return comparison;
}

// Format metric name for display
function formatMetricName(metric: string): string {
  // Convert camelCase to readable text
  return metric
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim();
}

// Calculate form rating on a 1-10 scale
function calculateFormRating(metrics: any, entityType: string): number {
  let rating = 5; // Start at middle
  
  if (entityType === 'player') {
    // Player form rating calculations
    if (metrics.games > 0) {
      // Adjust for minutes per game
      const minutesPerGame = metrics.minutes / metrics.games;
      if (minutesPerGame >= 85) rating += 1;
      else if (minutesPerGame < 45) rating -= 1;
      
      // Points per game component
      const ppg = metrics.points / metrics.games;
      if (ppg >= 8) rating += 2;
      else if (ppg >= 6) rating += 1.5;
      else if (ppg >= 4) rating += 1;
      else if (ppg <= 2) rating -= 1;
      
      // Goal contribution component
      const goalContrib = metrics.goals + metrics.assists;
      if (goalContrib >= 5) rating += 1.5;
      else if (goalContrib >= 3) rating += 1;
      else if (goalContrib > 0) rating += 0.5;
      
      // Bonus points component
      if (metrics.bonus >= 6) rating += 1;
      else if (metrics.bonus >= 3) rating += 0.5;
    }
  } else {
    // Team form rating calculations
    if (metrics.games > 0) {
      // Win ratio component
      const winRatio = metrics.wins / metrics.games;
      if (winRatio >= 0.8) rating += 2.5;
      else if (winRatio >= 0.6) rating += 2;
      else if (winRatio >= 0.4) rating += 1;
      else if (winRatio <= 0.2) rating -= 1.5;
      
      // Goal difference component
      const goalDiff = metrics.goalsScored - metrics.goalsConceded;
      if (goalDiff >= 5) rating += 1.5;
      else if (goalDiff >= 2) rating += 1;
      else if (goalDiff <= -3) rating -= 1;
      
      // Clean sheets component
      const cleanSheetRatio = metrics.cleanSheets / metrics.games;
      if (cleanSheetRatio >= 0.5) rating += 1;
    }
  }
  
  // Ensure rating stays within 1-10 range
  return Math.max(1, Math.min(10, Math.round(rating * 10) / 10));
}