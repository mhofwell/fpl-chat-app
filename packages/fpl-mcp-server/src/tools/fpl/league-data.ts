// src/tools/fpl/league-data.ts
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { McpToolContext, McpToolResponse } from '../../types/mcp-types';

interface LeagueDataParams {
    category: string;
    position?: string;
    limit?: number;
    includeDetails?: boolean;
    includeRawData?: boolean;
}

export async function getLeagueData(
    params: LeagueDataParams, 
    _context: McpToolContext
): Promise<McpToolResponse> {
    try {
        const {
            category = 'goals',
            position,
            limit = 10,
            includeDetails = true,
            includeRawData = false
        } = params;
        
        const dataTimestamp = new Date().toISOString();
        
        // Validate category
        const validCategories = ['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes', 'bonus', 'points'];
        if (!validCategories.includes(category)) {
            return createStructuredErrorResponse(
                `Invalid category. Must be one of: ${validCategories.join(', ')}`,
                'VALIDATION_ERROR'
            );
        }
        
        // Validate position if provided
        if (position && !['GKP', 'DEF', 'MID', 'FWD'].includes(position)) {
            return createStructuredErrorResponse(
                'Invalid position. Must be one of: GKP, DEF, MID, FWD',
                'VALIDATION_ERROR'
            );
        }
        
        const data = await fetchFromFPL('/bootstrap-static/');
        const players = data.elements;
        
        // Sort and filter based on category
        let sorted = [...players];
        
        if (position) {
            const positionMap: Record<string, number> = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };
            sorted = sorted.filter((p: any) => p.element_type === positionMap[position]);
        }
        
        // Map category to field
        const categoryMap: Record<string, string> = {
            'goals': 'goals_scored',
            'assists': 'assists',
            'cards': 'yellow_cards',
            'clean_sheets': 'clean_sheets',
            'saves': 'saves',
            'minutes': 'minutes',
            'bonus': 'bonus',
            'points': 'total_points'
        };
        
        const field = categoryMap[category] || 'goals_scored';
        sorted = sorted.filter((p: any) => p[field] > 0);
        sorted.sort((a: any, b: any) => b[field] - a[field]);
        sorted = sorted.slice(0, limit || 10);
        
        // Get team data
        const teams = data.teams;
        
        const leaders = sorted.map((player: any) => {
            const team = teams.find((t: any) => t.id === player.team);
            return {
                id: player.id,
                name: `${player.first_name} ${player.second_name}`,
                web_name: player.web_name,
                teamId: player.team,
                teamName: team ? team.name : 'Unknown',
                teamShort: team ? team.short_name : 'Unknown',
                elementType: player.element_type,
                position: ['GKP', 'DEF', 'MID', 'FWD'][player.element_type - 1] || 'Unknown',
                value: player[field],
                gamesPlayed: player.starts,
                perGame: player.minutes > 0 ? ((player[field] / player.minutes) * 90).toFixed(2) : '0',
                form: player.form,
                price: player.now_cost / 10,
                totalPoints: player.total_points,
                selectedBy: player.selected_by_percent
            };
        });
        
        // Format response
        let responseText = `LEAGUE_LEADERS: Top ${limit} by ${category}`;
        if (position) responseText += ` (${position})`;
        responseText += '\n\n';
        
        leaders.forEach((player: any, index: number) => {
            responseText += `${index + 1}. ${player.name} (${player.teamShort}) - `;
            
            if (category === 'points') {
                responseText += `${player.value} FPL points`;
            } else {
                responseText += `${player.value} ${category}`;
            }
            
            if (player.gamesPlayed > 0) {
                responseText += ` in ${player.gamesPlayed} starts`;
                if (player.perGame && category !== 'points') {
                    responseText += ` (${player.perGame} per 90 mins)`;
                }
            }
            
            if (includeDetails) {
                const details = [];
                
                if (player.form) details.push(`Form: ${player.form}`);
                if (player.price) details.push(`£${player.price}m`);
                if (player.totalPoints && category !== 'points') details.push(`${player.totalPoints}pts`);
                if (player.selectedBy) details.push(`${player.selectedBy}% selected`);
                
                if (details.length > 0) {
                    responseText += ` - ${details.join(', ')}`;
                }
            }
            
            responseText += '\n';
        });
        
        if (category !== 'points') {
            responseText += `\nNote: These are actual Premier League ${category}, not FPL points.`;
        }
        
        responseText += `\n\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(leaders, null, 2);
        }
        
        return {
            content: [{
                type: 'text' as const,  // Fix: Use 'text' as a literal type
                text: responseText
            }]
        };
        
    } catch (error: any) {
        console.error('Error in getLeagueData:', error);
        
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
            error.message || 'Failed to retrieve league leaders. Please try again later.',
            'EXECUTION_ERROR'
        );
    }
}