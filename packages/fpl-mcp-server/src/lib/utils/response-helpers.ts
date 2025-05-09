interface StructuredErrorResponse {
    content: [{ type: 'text'; text: string }];
    isError: true;
}

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
): StructuredErrorResponse {
    const dataTimestamp = new Date().toISOString();
    let text = `ERROR:\nType: ${type}\nMessage: ${message}`;

    if (suggestions && suggestions.length > 0) {
        text += `\n\nSUGGESTIONS:\n- ${suggestions.join('\n- ')}`;
    }

    text += `\n\nData timestamp: ${dataTimestamp}`;

    return {
        content: [{ type: 'text' as const, text }], // 'text' as const ensures literal type
        isError: true,
    };
}

// Optional: Helper for DISAMBIGUATION_REQUIRED responses if a common pattern emerges beyond a simple message
// For now, disambiguation messages are usually custom-built in the tools.

// Optional: Helper for successful responses if there's truly common boilerplate
// export function createSuccessResponse(mainHeaderText: string, bodyText: string, rawData?: any, includeRawDataFlag?: boolean) { ... }
// However, success responses are often too unique.
