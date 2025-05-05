// src/tools/fpl/team.ts
import { z } from 'zod';
import redis from '../../lib/redis/redis-client';
import { Team, Player, Fixture, Gameweek } from '../../types/fpl';

export async function getTeam({ teamId }: { teamId: number }, _extra: any) {
    try {
        // Get all teams from cache
        const teamsData = await redis.get('fpl:teams');
        const playersData = await redis.get('fpl:players');
        const fixturesData = await redis.get('fpl:fixtures');
        const gameweeksData = await redis.get('fpl:gameweeks');

        if (!teamsData) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Teams data not found in cache',
                    },
                ],
                isError: true,
            };
        }

        const teams: Team[] = JSON.parse(teamsData);
        const team = teams.find((t) => t.id === teamId);

        if (!team) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Team with ID ${teamId} not found`,
                    },
                ],
                isError: true,
            };
        }

        // Enrich with player data if available
        let players: Player[] = [];
        if (playersData) {
            const allPlayers: Player[] = JSON.parse(playersData);
            players = allPlayers.filter((p) => p.team_id === team.id);
        }

        // Get upcoming fixtures if available
        let upcomingFixtures: Fixture[] = [];
        let currentGameweekId = 0;

        if (gameweeksData && fixturesData) {
            const gameweeks = JSON.parse(gameweeksData);
            const fixtures: Fixture[] = JSON.parse(fixturesData);

            const currentGameweek = gameweeks.find(
                (gw: Gameweek) => gw.is_current
            );
            if (currentGameweek) {
                currentGameweekId = currentGameweek.id;

                upcomingFixtures = fixtures
                    .filter(
                        (f) =>
                            f.gameweek_id >= currentGameweekId &&
                            f.gameweek_id < currentGameweekId + 5 &&
                            (f.team_h === team.id || f.team_a === team.id)
                    )
                    .slice(0, 5)
                    .map((f) => {
                        const isHome = f.team_h === team.id;
                        const opponentId = isHome ? f.team_a : f.team_h;
                        const opponent = teams.find((t) => t.id === opponentId);

                        return {
                            ...f,
                            opponent_id: opponentId,
                            opponent_name: opponent?.name || 'Unknown',
                            is_home: isHome,
                        };
                    });
            }
        }

        // Format the response
        const response = {
            team,
            squad: players.map((p) => ({
                id: p.id,
                name:
                    p.full_name ||
                    `${p.first_name || ''} ${p.second_name || ''}`,
                web_name: p.web_name,
                position: p.position || p.element_type,
                points: p.total_points,
            })),
            upcoming_fixtures: upcomingFixtures,
        };

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    } catch (error) {
        console.error('Error getting team:', error);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `Error: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                },
            ],
            isError: true,
        };
    }
}
