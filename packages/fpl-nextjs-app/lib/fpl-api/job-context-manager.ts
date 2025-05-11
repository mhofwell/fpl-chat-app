import { fplApiService } from './service';
import { FplFixture } from '../../../../types/fpl-api.types'; // Correct path

export interface JobContext {
    isMatchDay: boolean;
    currentGameweekId?: number;
}

export async function getJobContext(): Promise<JobContext> {
    try {
        const currentGameweek = await fplApiService.getCurrentGameweek();
        if (!currentGameweek) {
            return { isMatchDay: false };
        }

        const fixtures: FplFixture[] = await fplApiService.getFixtures(currentGameweek.id);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day

        const isMatchDay = fixtures.some(fixture => {
            if (!fixture.kickoff_time) return false;
            const kickoffDate = new Date(fixture.kickoff_time);
            kickoffDate.setHours(0, 0, 0, 0); // Normalize kickoff to start of day
            return kickoffDate.getTime() === today.getTime();
        });

        return { isMatchDay, currentGameweekId: currentGameweek.id };
    } catch (error) {
        console.error('Error fetching job context:', error);
        return { isMatchDay: false }; // Default to false on error
    }
}
