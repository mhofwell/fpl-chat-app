// lib/fpl-api/player-name-matcher.ts

import { FPLElement, MatchResult } from '@/types/fpl-mvp';

// Simple Levenshtein distance implementation
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

export class PlayerNameMatcher {
  private playerIndex: Map<string, number[]> = new Map();
  private playerData: Map<number, FPLElement> = new Map();
  private nicknameMap: Map<string, string[]> = new Map();

  constructor(players: FPLElement[]) {
    this.buildIndex(players);
    this.buildNicknameMap();
  }

  private buildIndex(players: FPLElement[]): void {
    players.forEach(player => {
      this.playerData.set(player.id, player);
      this.indexPlayer(player);
    });
  }

  private indexPlayer(player: FPLElement): void {
    const variations = this.generateNameVariations(player);
    
    variations.forEach(name => {
      const normalized = this.normalizeString(name);
      if (!this.playerIndex.has(normalized)) {
        this.playerIndex.set(normalized, []);
      }
      this.playerIndex.get(normalized)!.push(player.id);
    });
  }

  private generateNameVariations(player: FPLElement): string[] {
    const variations = new Set<string>();
    
    // Add all name components
    variations.add(player.web_name);
    if (player.first_name) variations.add(player.first_name);
    if (player.second_name) variations.add(player.second_name);
    
    // Full name
    if (player.first_name && player.second_name) {
      variations.add(`${player.first_name} ${player.second_name}`);
    }
    
    // Common abbreviations
    const webNameParts = player.web_name.split(' ');
    if (webNameParts.length > 1) {
      // First initial + last name
      variations.add(`${webNameParts[0][0]}. ${webNameParts[webNameParts.length - 1]}`);
      
      // Last name only
      variations.add(webNameParts[webNameParts.length - 1]);
    }
    
    // Handle special cases (Van Dijk, De Bruyne, etc.)
    if (player.second_name) {
      const lastNameParts = player.second_name.split(' ');
      if (lastNameParts.length > 1 && ['van', 'de', 'el', 'al'].includes(lastNameParts[0].toLowerCase())) {
        variations.add(lastNameParts.slice(1).join(' '));
      }
    }
    
    return Array.from(variations);
  }

  private buildNicknameMap(): void {
    // Common Premier League player nicknames
    this.nicknameMap.set('bruno fernandes', ['bruno', 'fernandes']);
    this.nicknameMap.set('mohamed salah', ['mo salah', 'salah', 'mo']);
    this.nicknameMap.set('heung-min son', ['son', 'sonny']);
    this.nicknameMap.set('kevin de bruyne', ['kdb', 'de bruyne', 'kevin']);
    this.nicknameMap.set('trent alexander-arnold', ['taa', 'trent']);
    this.nicknameMap.set('marcus rashford', ['rashford', 'rashy']);
    this.nicknameMap.set('roberto firmino', ['firmino', 'bobby']);
    this.nicknameMap.set('gabriel jesus', ['jesus', 'gabby']);
    this.nicknameMap.set('riyad mahrez', ['mahrez']);
    this.nicknameMap.set('virgil van dijk', ['vvd', 'van dijk', 'virgil']);
    this.nicknameMap.set('andrew robertson', ['robbo', 'robertson']);
    this.nicknameMap.set('bernardo silva', ['bernardo', 'silva']);
    this.nicknameMap.set('diogo jota', ['jota']);
    this.nicknameMap.set('raphael varane', ['varane']);
    this.nicknameMap.set('n\'golo kante', ['kante']);
    this.nicknameMap.set('erling haaland', ['haaland']);
    this.nicknameMap.set('martin odegaard', ['odegaard']);
    this.nicknameMap.set('bukayo saka', ['saka']);
    this.nicknameMap.set('gabriel martinelli', ['martinelli', 'gabi']);
  }

  private normalizeString(str: string): string {
    return str.toLowerCase()
      .replace(/[''`]/g, '')  // Remove apostrophes
      .replace(/[àáäâ]/g, 'a')
      .replace(/[èéëê]/g, 'e')
      .replace(/[ìíïî]/g, 'i')
      .replace(/[òóöô]/g, 'o')
      .replace(/[ùúüû]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/ç/g, 'c')
      .trim();
  }

  findPlayer(query: string): MatchResult {
    const normalized = this.normalizeString(query);
    
    // Check for exact match first
    if (this.playerIndex.has(normalized)) {
      const playerIds = this.playerIndex.get(normalized)!;
      
      if (playerIds.length === 1) {
        return { type: 'exact', playerId: playerIds[0] };
      } else {
        // Multiple players with the same name
        const players = playerIds.map(id => this.playerData.get(id)!);
        return {
          type: 'disambiguation_needed',
          options: playerIds,
          message: `Multiple players found with name "${query}". Did you mean:\n${
            players.map(p => `- ${p.web_name} (${this.getTeamShortName(p.team)})`).join('\n')
          }`
        };
      }
    }
    
    // Check nickname mappings
    for (const [fullName, nicknames] of Array.from(this.nicknameMap.entries())) {
      if (nicknames.includes(normalized)) {
        return this.findPlayer(fullName);
      }
    }
    
    // Fuzzy matching
    const threshold = 3; // Maximum edit distance
    const candidates: Array<{ name: string; distance: number; playerIds: number[] }> = [];
    
    for (const [indexedName, playerIds] of Array.from(this.playerIndex.entries())) {
      const distance = levenshteinDistance(normalized, indexedName);
      
      if (distance <= threshold) {
        candidates.push({
          name: indexedName,
          distance,
          playerIds
        });
      }
    }
    
    if (candidates.length === 0) {
      return { type: 'not_found' };
    }
    
    // Sort by similarity
    candidates.sort((a, b) => a.distance - b.distance);
    
    // If the best match is very close (distance 1), treat as exact
    if (candidates[0].distance <= 1 && candidates[0].playerIds.length === 1) {
      return { type: 'exact', playerId: candidates[0].playerIds[0] };
    }
    
    // Return fuzzy matches
    return {
      type: 'fuzzy_matches',
      suggestions: candidates.slice(0, 5).map(c => ({
        name: c.playerIds.map(id => this.playerData.get(id)!.web_name).join(', '),
        playerIds: c.playerIds,
        confidence: 1 - (c.distance / normalized.length)
      }))
    };
  }

  // Helper method to get team names (would need teams data)
  private getTeamShortName(teamId: number): string {
    // This would be populated from the teams data
    const teamNames: { [key: number]: string } = {
      1: 'ARS', 2: 'AVL', 3: 'BOU', 4: 'BRE', 5: 'BHA',
      6: 'BUR', 7: 'CHE', 8: 'CRY', 9: 'EVE', 10: 'FUL',
      11: 'LEE', 12: 'LEI', 13: 'LIV', 14: 'MCI', 15: 'MUN',
      16: 'NEW', 17: 'NOR', 18: 'NOT', 19: 'SHE', 20: 'SOU',
      21: 'TOT', 22: 'WAT', 23: 'WHU', 24: 'WOL', 25: 'LUT'
    };
    
    return teamNames[teamId] || 'UNK';
  }

  // Search multiple players (returns array of IDs)
  searchPlayers(query: string): number[] {
    const result = this.findPlayer(query);
    
    switch (result.type) {
      case 'exact':
        return [result.playerId!];
      case 'disambiguation_needed':
        return result.options || [];
      case 'fuzzy_matches':
        return result.suggestions?.flatMap(s => s.playerIds) || [];
      default:
        return [];
    }
  }
}