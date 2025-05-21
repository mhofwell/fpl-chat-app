// src/lib/utils/response-helpers.ts
import { McpToolResponse } from '../../types/mcp-types';

/**
 * Creates a standardized structured error response object for MCP tools.
 * @param message The main error message.
 * @param type The type of error (e.g., 'NOT_FOUND', 'VALIDATION_ERROR').
 * @param suggestions Optional array of suggestion strings.
 * @returns A structured error response object.
 */
export function createStructuredErrorResponse(
    message: string,
    type: string = 'GENERIC_ERROR',
    suggestions?: string[]
): McpToolResponse {
    const dataTimestamp = new Date().toISOString();
    let text = `ERROR:\nType: ${type}\nMessage: ${message}`;

    if (suggestions && suggestions.length > 0) {
        text += `\n\nSUGGESTIONS:\n- ${suggestions.join('\n- ')}`;
    }

    text += `\n\nData timestamp: ${dataTimestamp}`;

    return {
        content: [{ type: 'text' as const, text }],
        isError: true
    };
}