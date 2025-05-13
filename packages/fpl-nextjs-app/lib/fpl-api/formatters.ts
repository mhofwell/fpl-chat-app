/**
 * Formatting utility functions for FPL data
 * 
 * This module contains reusable formatting functions for player data, team data,
 * statistics, and other FPL-specific information. These functions help ensure
 * consistent formatting across different parts of the application.
 */

import { Player, Team } from '@fpl-chat-app/types';

// Player status mapping for UI display
export const PLAYER_STATUS = {
    a: { label: 'Available', color: 'green', icon: '✓' },
    d: { label: 'Doubtful', color: 'orange', icon: '⚠️' },
    i: { label: 'Injured', color: 'red', icon: '🩹' },
    s: { label: 'Suspended', color: 'red', icon: '🟥' },
    u: { label: 'Unavailable', color: 'gray', icon: '❌' },
    n: { label: 'News', color: 'blue', icon: 'ℹ️' }
};

// Player position mapping for UI display
export const PLAYER_POSITIONS = {
    GKP: { label: 'Goalkeeper', short: 'GK', color: '#EBFF00' },
    DEF: { label: 'Defender', short: 'DEF', color: '#00FFF0' },
    MID: { label: 'Midfielder', short: 'MID', color: '#04F500' },
    FWD: { label: 'Forward', short: 'FWD', color: '#FF003D' }
};

// Stat value formatters with appropriate precision
export const STAT_FORMATTERS = {
    // Basic stats - keep as integers
    minutes: (value: number) => value,
    goals_scored: (value: number) => value,
    assists: (value: number) => value,
    clean_sheets: (value: number) => value,
    goals_conceded: (value: number) => value,
    own_goals: (value: number) => value,
    penalties_saved: (value: number) => value,
    penalties_missed: (value: number) => value,
    yellow_cards: (value: number) => value,
    red_cards: (value: number) => value,
    saves: (value: number) => value,
    bonus: (value: number) => value,
    bps: (value: number) => value,
    total_points: (value: number) => value,
    
    // Percentage stats - format with % sign and 1 decimal place
    selected_by_percent: (value: string | number) => 
        `${parseFloat(value.toString()).toFixed(1)}%`,
    
    // Form stats - keep 2 decimal places
    form: (value: string | number) => 
        parseFloat(value.toString()).toFixed(2),
    points_per_game: (value: string | number) => 
        parseFloat(value.toString()).toFixed(2),
    
    // ICT stats - format to 1 decimal place
    influence: (value: string | number) => 
        parseFloat(value.toString()).toFixed(1),
    creativity: (value: string | number) => 
        parseFloat(value.toString()).toFixed(1),
    threat: (value: string | number) => 
        parseFloat(value.toString()).toFixed(1),
    ict_index: (value: string | number) => 
        parseFloat(value.toString()).toFixed(1),
    
    // Cost - format as £X.Xm
    now_cost: (value: number) => `£${(value / 10).toFixed(1)}m`,
    
    // Format for changes in cost
    cost_change_start: (value: number) => formatPriceChange(value),
    cost_change_event: (value: number) => formatPriceChange(value),
};

/**
 * Format a player's status into a human-readable form
 * @param status The player's status code ('a', 'd', 'i', 's', 'u', 'n')
 * @returns Formatted status object with label, color, and icon
 */
export function formatPlayerStatus(status: string | null | undefined) {
    if (!status) return PLAYER_STATUS.a; // Default to available
    return PLAYER_STATUS[status as keyof typeof PLAYER_STATUS] || PLAYER_STATUS.a;
}

/**
 * Format a player's position into a human-readable form
 * @param position The player's position code ('GKP', 'DEF', 'MID', 'FWD')
 * @returns Formatted position object with label, short code, and color
 */
export function formatPlayerPosition(position: string | undefined) {
    if (!position) return PLAYER_POSITIONS.MID; // Default to midfielder
    return PLAYER_POSITIONS[position as keyof typeof PLAYER_POSITIONS] || PLAYER_POSITIONS.MID;
}

/**
 * Format a price change with appropriate sign and decimal places
 * @param value The price change value (in tenths of millions)
 * @returns Formatted price change string with + or - sign
 */
export function formatPriceChange(value: number) {
    const changeValue = value / 10;
    if (changeValue === 0) return '£0.0m';
    const sign = changeValue > 0 ? '+' : '';
    return `${sign}£${changeValue.toFixed(1)}m`;
}

/**
 * Format a player's chance of playing
 * @param chance The chance of playing percentage (0-100)
 * @returns Formatted string representing chance of playing
 */
export function formatChanceOfPlaying(chance: number | null | undefined) {
    if (chance === null || chance === undefined) return 'Available';
    if (chance === 0) return 'Not available';
    if (chance <= 25) return 'Highly doubtful';
    if (chance <= 50) return 'Doubtful';
    if (chance <= 75) return 'Likely';
    return 'Available';
}

/**
 * Format a player's news with appropriate context and timestamp
 * @param news The news text
 * @param newsAdded Timestamp when the news was added
 * @returns Formatted news object with processed text and relative time
 */
export function formatPlayerNews(news: string | null | undefined, newsAdded: string | null | undefined) {
    if (!news) return null;
    
    const newsText = news.trim();
    
    // Format the timestamp into a relative time if available
    let timeAgo = '';
    if (newsAdded) {
        const newsDate = new Date(newsAdded);
        const now = new Date();
        const diffMs = now.getTime() - newsDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            timeAgo = 'Today';
        } else if (diffDays === 1) {
            timeAgo = 'Yesterday';
        } else if (diffDays < 7) {
            timeAgo = `${diffDays} days ago`;
        } else {
            timeAgo = newsDate.toLocaleDateString();
        }
    }
    
    return {
        text: newsText,
        time: timeAgo,
        summary: summarizeNewsText(newsText)
    };
}

/**
 * Create a summary of news text by extracting the most relevant part
 * @param news The full news text
 * @returns Shortened summary focusing on key information
 */
function summarizeNewsText(news: string): string {
    // If news is already short, return as is
    if (news.length <= 80) return news;
    
    // Look for injury return dates
    const returnMatch = news.match(/(?:expected|likely|could) (?:to )?(?:return|be back|be available) (?:by|on|in|for) ([^\.]+)/i);
    if (returnMatch) {
        return `Return: ${returnMatch[1]}`;
    }
    
    // Look for injury descriptions
    const injuryMatch = news.match(/(?:suffered|sustained|has|with) (?:a|an) ([^ ]+ [^ ]+) (?:injury|strain|knock|problem)/i);
    if (injuryMatch) {
        return `Injury: ${injuryMatch[1]}`;
    }
    
    // Default to first sentence if no patterns match
    const firstSentence = news.split('.')[0];
    if (firstSentence.length <= 80) return firstSentence;
    
    // Last resort: truncate to 80 chars
    return news.substring(0, 77) + '...';
}

/**
 * Format a player's stats with appropriate formatting for each stat type
 * @param player The player object with various stats
 * @param statsToFormat Array of stat keys to format
 * @returns Object with formatted stats
 */
export function formatPlayerStats(
    player: Player,
    statsToFormat: (keyof typeof STAT_FORMATTERS)[] = []
) {
    const result: Record<string, string | number> = {};
    
    // If no specific stats requested, format all that have formatters
    const keys = statsToFormat.length > 0
        ? statsToFormat
        : Object.keys(player).filter(key => 
            key in STAT_FORMATTERS && player[key as keyof Player] !== undefined
          ) as (keyof typeof STAT_FORMATTERS)[];
    
    // Apply formatters to each requested stat
    for (const key of keys) {
        const value = player[key as keyof Player];
        if (value !== undefined && value !== null) {
            const formatter = STAT_FORMATTERS[key];
            result[key] = formatter(value as any);
        }
    }
    
    return result;
}

/**
 * Get a consistent label for the fixture difficulty
 * @param difficulty The fixture difficulty rating (1-5)
 * @returns Object with label and color representing difficulty
 */
export function formatFixtureDifficulty(difficulty: number) {
    switch (difficulty) {
        case 1:
            return { label: 'Very Easy', color: '#01f780' };
        case 2:
            return { label: 'Easy', color: '#92f701' };
        case 3:
            return { label: 'Moderate', color: '#f7f701' };
        case 4:
            return { label: 'Difficult', color: '#f7a501' };
        case 5:
            return { label: 'Very Difficult', color: '#f73a01' };
        default:
            return { label: 'Unknown', color: '#cccccc' };
    }
}

/**
 * Format team data with consistent naming and abbreviations
 * @param team The team object to format
 * @returns Formatted team data for display
 */
export function formatTeamDisplay(team: Team) {
    return {
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        abbr: team.short_name.substring(0, 3).toUpperCase(),
        position: team.position || 0,
        played: team.played || 0,
        points: team.points || 0,
        form: team.form ? parseFloat(team.form).toFixed(2) : '0.00',
        // Add win-draw-loss record
        record: `${team.win || 0}-${team.draw || 0}-${team.loss || 0}`,
    };
}

/**
 * Format date and time for fixtures in a consistent way
 * @param dateString ISO date string from the API
 * @returns Object with formatted date parts
 */
export function formatMatchDateTime(dateString: string) {
    if (!dateString) return { display: 'TBD' };
    
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    const time = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
    
    return {
        display: isToday ? `Today, ${time}` : `${day} ${month}, ${time}`,
        date: `${day} ${month}`,
        time,
        isToday,
        full: date.toLocaleString(),
        timestamp: date.getTime(),
    };
}