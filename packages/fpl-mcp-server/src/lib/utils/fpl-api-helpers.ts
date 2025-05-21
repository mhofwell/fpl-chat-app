// src/lib/utils/fpl-api-helpers.ts

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

export async function fetchFromFPL(endpoint: string): Promise<any> {
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