import { Team } from 'fpl-domain.types'; 

/**
 * Performs a fuzzy match check.
 * The searchTerm's words must all be present in the text for a match.
 * @param text The text to search within.
 * @param searchTerm The term to search for.
 * @returns True if all words in searchTerm are found in text, false otherwise.
 */
export function fuzzyMatch(text: string | undefined | null, searchTerm: string | undefined | null): boolean {
    if (!text || !searchTerm) return false;

    const normalizedText = text.toLowerCase();
    // Match if all search words (split by space) are present in the text
    const searchWords = searchTerm.toLowerCase().split(' ').filter(s => s.length > 0);

    if (searchWords.length === 0) return false;

    return searchWords.every(searchWord => normalizedText.includes(searchWord));
}

// --- Added from search-players.ts ---
export interface FindTeamResult {
    exactMatch?: Team;
    fuzzyMatches?: Team[]; // For disambiguation
    notFound?: boolean;
    query: string;
}

export function findAndDisambiguateTeams(query: string, allTeams: Team[]): FindTeamResult {
    // Store the original query to include in all return paths
    const originalQuery = query; 

    if (!query) return { notFound: true, query: originalQuery };
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return { notFound: true, query: originalQuery };

    // 1. Exact match on short_name or full name (case-insensitive)
    const exactShortNameMatch = allTeams.find(t => t.short_name.toLowerCase() === trimmedQuery);
    if (exactShortNameMatch) return { exactMatch: exactShortNameMatch, query: originalQuery };
    const exactFullNameMatch = allTeams.find(t => t.name.toLowerCase() === trimmedQuery);
    if (exactFullNameMatch) return { exactMatch: exactFullNameMatch, query: originalQuery };

    // 2. Fuzzy match on full name
    let potentialMatches = allTeams.filter(t => fuzzyMatch(t.name, trimmedQuery));

    // 3. If no full name fuzzy matches, try fuzzy match on short_name
    if (potentialMatches.length === 0) {
        potentialMatches = allTeams.filter(t => fuzzyMatch(t.short_name, trimmedQuery));
    }
    
    // 4. Analyze results
    if (potentialMatches.length === 1) {
        return { exactMatch: potentialMatches[0], query: originalQuery };
    } else if (potentialMatches.length > 1) {
        const directShortNameAmongFuzzy = potentialMatches.find(t => t.short_name.toLowerCase() === trimmedQuery);
        if (directShortNameAmongFuzzy) return { exactMatch: directShortNameAmongFuzzy, query: originalQuery };
        
        const directFullNameAmongFuzzy = potentialMatches.find(t => t.name.toLowerCase() === trimmedQuery);
        if (directFullNameAmongFuzzy) return { exactMatch: directFullNameAmongFuzzy, query: originalQuery };

        return { fuzzyMatches: potentialMatches.slice(0, 5), query: originalQuery };
    }

    return { notFound: true, query: originalQuery };
}
// --- End of added code ---
