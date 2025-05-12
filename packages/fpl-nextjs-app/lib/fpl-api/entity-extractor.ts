// lib/fpl-api/entity-extractor.ts
import { Player, Team, Gameweek } from '@fpl-chat-app/types';

export interface ExtractedEntities {
    players: Player[];
    teams: Team[];
    gameweeks: Gameweek[];
    keywords: string[];
}

/**
 * Extracts FPL entities (players, teams, gameweeks) from a user question
 * @param question The user's question
 * @param allPlayers List of all available players
 * @param allTeams List of all available teams
 * @param allGameweeks List of all available gameweeks
 * @returns Object containing arrays of extracted entities
 */
export function extractEntities(
    question: string,
    allPlayers: Player[],
    allTeams: Team[],
    allGameweeks: Gameweek[]
): ExtractedEntities {
    const lowercaseQuestion = question.toLowerCase();
    const entities: ExtractedEntities = {
        players: [],
        teams: [],
        gameweeks: [],
        keywords: extractKeywords(lowercaseQuestion),
    };

    // Extract player names
    entities.players = allPlayers.filter((player) => {
        const webName = player.web_name.toLowerCase();
        const fullName = player.full_name.toLowerCase();
        return (
            lowercaseQuestion.includes(webName) ||
            lowercaseQuestion.includes(fullName)
        );
    });

    // Extract team names
    entities.teams = allTeams.filter((team) => {
        const teamName = team.name.toLowerCase();
        const shortName = team.short_name.toLowerCase();
        return (
            lowercaseQuestion.includes(teamName) ||
            lowercaseQuestion.includes(shortName)
        );
    });

    // Extract gameweek references
    const currentGameweek = allGameweeks.find((gw) => gw.is_current);
    const nextGameweek = allGameweeks.find((gw) => gw.is_next);

    // Check explicit gameweek mentions (GW1, gameweek 5, etc.)
    const gameweekPattern = /(?:gameweek\s+(\d+)|gw(\d+)|week\s+(\d+))/gi;
    const gameweekMatches = [];
    let match;
    while ((match = gameweekPattern.exec(lowercaseQuestion)) !== null) {
        gameweekMatches.push(match);
    }

    if (gameweekMatches.length > 0) {
        for (const match of gameweekMatches) {
            const gwId = parseInt(match[1] || match[2] || match[3]);
            const gameweek = allGameweeks.find((gw) => gw.id === gwId);
            if (
                gameweek &&
                !entities.gameweeks.some((g) => g.id === gameweek.id)
            ) {
                entities.gameweeks.push(gameweek);
            }
        }
    } else {
        // Check relative gameweek references
        if (
            lowercaseQuestion.includes('this week') ||
            lowercaseQuestion.includes('current gameweek') ||
            lowercaseQuestion.includes('this gameweek')
        ) {
            if (
                currentGameweek &&
                !entities.gameweeks.includes(currentGameweek)
            ) {
                entities.gameweeks.push(currentGameweek);
            }
        }

        if (
            lowercaseQuestion.includes('next week') ||
            lowercaseQuestion.includes('next gameweek') ||
            lowercaseQuestion.includes('upcoming gameweek')
        ) {
            if (nextGameweek && !entities.gameweeks.includes(nextGameweek)) {
                entities.gameweeks.push(nextGameweek);
            }
        }
    }

    return entities;
}

/**
 * Extract FPL-related keywords from the user question
 * @param question The user's question in lowercase
 * @returns Array of extracted keywords
 */
function extractKeywords(question: string): string[] {
    const keywords: string[] = [];

    // General FPL stats and metrics
    const statKeywords = [
        'points',
        'score',
        'scored',
        'stats',
        'statistics',
        'goals',
        'assists',
        'clean sheets',
        'bonus',
        'bps',
        'price',
        'cost',
        'value',
        'form',
        'injured',
        'injury',
        'captain',
        'vice-captain',
        'bench',
        'transfer',
        'wildcard',
        'free hit',
        'bench boost',
        'triple captain',
        'differential',
        'fixtures',
        'schedule',
        'upcoming',
        'deadline',
        'rank',
        'top scorer',
        'best player',
        'performance',
        'predict',
    ];

    for (const keyword of statKeywords) {
        if (question.includes(keyword)) {
            keywords.push(keyword);
        }
    }

    // Question types
    if (question.includes('who should')) keywords.push('recommendation');
    if (question.includes('when is')) keywords.push('timing');
    if (question.includes('how many')) keywords.push('quantity');
    if (question.includes('compare')) keywords.push('comparison');
    if (question.includes('vs') || question.includes(' or '))
        keywords.push('comparison');
    if (question.includes('best')) keywords.push('recommendation');

    return keywords;
}

/**
 * Formats extracted entities into a context string for Claude
 * @param entities The extracted entities
 * @param additionalData Additional FPL data to include in the context
 * @returns A formatted context string
 */
export function formatEntityContext(
    entities: ExtractedEntities,
    additionalData: { [key: string]: any } = {}
): string {
    let context = '';

    // Add player information
    if (entities.players.length > 0) {
        context += '### Players\n';
        for (const player of entities.players) {
            context += `- ${player.full_name} (${player.web_name}), ${player.position}, ${player.team_id}\n`;
            if (player.form) context += `  - Form: ${player.form}\n`;
            if (player.points_per_game)
                context += `  - Points per game: ${player.points_per_game}\n`;
            if (player.total_points)
                context += `  - Total points: ${player.total_points}\n`;
            if (player.selected_by_percent)
                context += `  - Selected by: ${player.selected_by_percent}%\n`;
        }
        context += '\n';
    }

    // Add team information
    if (entities.teams.length > 0) {
        context += '### Teams\n';
        for (const team of entities.teams) {
            context += `- ${team.name} (${team.short_name})\n`;
        }
        context += '\n';
    }

    // Add gameweek information
    if (entities.gameweeks.length > 0) {
        context += '### Gameweeks\n';
        for (const gameweek of entities.gameweeks) {
            context += `- ${gameweek.name}: `;
            if (gameweek.is_current) context += '[CURRENT] ';
            if (gameweek.is_next) context += '[NEXT] ';
            if (gameweek.deadline_time)
                context += `Deadline: ${gameweek.deadline_time}`;
            if (gameweek.finished) context += ' [FINISHED]';
            context += '\n';
        }
        context += '\n';
    }

    // Add additional data
    if (Object.keys(additionalData).length > 0) {
        context += '### Additional Data\n';
        for (const [key, value] of Object.entries(additionalData)) {
            if (typeof value === 'object') {
                context += `- ${key}: ${JSON.stringify(value)}\n`;
            } else {
                context += `- ${key}: ${value}\n`;
            }
        }
        context += '\n';
    }

    // Add keywords context
    if (entities.keywords.length > 0) {
        context += '### Detected Topics\n';
        context += `- ${entities.keywords.join(', ')}\n\n`;
    }

    return context;
}
