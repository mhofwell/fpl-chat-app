import { APIError } from '@anthropic-ai/sdk/error';
import { ErrorType, ErrorResponse } from '@/lib/types/fpl-types';

export function handleAnthropicError(error: any): ErrorResponse {
    console.error('Anthropic API error:', error);

    // Handle specific Anthropic API errors
    if (error instanceof APIError) {
        if (error.status === 429) {
            return {
                error: 'Rate limit exceeded',
                type: 'rate_limit',
                retryable: true,
                userMessage:
                    "I'm receiving too many requests right now. Please try again in a moment.",
            };
        }

        if (error.status === 401) {
            return {
                error: 'Authentication failed',
                type: 'unauthorized',
                retryable: false,
                userMessage:
                    "I'm having trouble connecting to my AI service. Please contact support.",
            };
        }

        if (error.status >= 500) {
            return {
                error: 'Server error',
                type: 'server_error',
                retryable: true,
                userMessage:
                    "I'm experiencing technical difficulties. Please try again shortly.",
            };
        }

        if (error.status === 400) {
            return {
                error: 'Invalid request',
                type: 'invalid_request',
                retryable: false,
                userMessage:
                    "I couldn't process that message. Please try rephrasing your question.",
            };
        }
    }

    // Handle network errors
    if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT'
    ) {
        return {
            error: 'Network error',
            type: 'network',
            retryable: true,
            userMessage:
                "I'm having trouble connecting to the internet. Please check your connection and try again.",
        };
    }

    // Default error
    return {
        error: error.message || 'Unknown error',
        type: 'unknown',
        retryable: true,
        userMessage:
            'Something went wrong. Please try again, or try asking your question differently.',
    };
}
