// app/utils/error-handler.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { MCP_CONFIG } from '../../config/ai-config';

// Define error types for better handling
export enum ErrorType {
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  VALIDATION_ERROR = 'validation_error',
  SESSION_ERROR = 'session_error',
  TOOL_ERROR = 'tool_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export type ErrorDetails = {
  type: ErrorType;
  message: string;
  originalError?: any;
  statusCode?: number;
  retryable: boolean;
  context?: Record<string, any>;
};

/**
 * Classify error type based on the error received
 */
export function classifyError(error: any): ErrorDetails {
  // Handle Anthropic API errors
  if (error instanceof Anthropic.APIError) {
    return {
      type: ErrorType.API_ERROR,
      message: `API Error: ${error.status} ${error.name} - ${error.message}`,
      originalError: error,
      statusCode: error.status,
      retryable: isRetryableStatusCode(error.status),
    };
  }
  
  // Handle timeout errors
  if (error instanceof Error && 
      (error.message.includes('timeout') || error.message.includes('timed out'))) {
    return {
      type: ErrorType.TIMEOUT_ERROR,
      message: 'Request timed out',
      originalError: error,
      retryable: true,
    };
  }
  
  // Handle session-related errors
  if (error instanceof Error && 
      (error.message.includes('session') || error.message.includes('Session'))) {
    return {
      type: ErrorType.SESSION_ERROR,
      message: error.message,
      originalError: error,
      retryable: true,
    };
  }
  
  // Handle validation errors
  if (error instanceof Error && 
      (error.message.includes('validation') || error.message.includes('invalid'))) {
    return {
      type: ErrorType.VALIDATION_ERROR,
      message: error.message,
      originalError: error,
      retryable: false, // Validation errors typically can't be fixed by retrying
    };
  }
  
  // Handle tool-specific errors
  if (error instanceof Error && error.message.includes('tool')) {
    return {
      type: ErrorType.TOOL_ERROR,
      message: error.message,
      originalError: error,
      retryable: false, // Tool errors might need intervention
    };
  }
  
  // Default to unknown error
  return {
    type: ErrorType.UNKNOWN_ERROR,
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    originalError: error,
    retryable: false,
  };
}

/**
 * Determine if a status code is retryable
 */
function isRetryableStatusCode(statusCode?: number): boolean {
  if (!statusCode) return false;
  
  // 429 = Rate limit, 500s = Server errors, 503 = Service unavailable
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * Handle an error with appropriate recovery strategy
 */
export async function handleError(
  error: any,
  context?: Record<string, any>
): Promise<{
  recoverySuccess: boolean;
  errorDetails: ErrorDetails;
  friendlyMessage: string;
  fallbackResult?: any;
}> {
  // Classify the error
  const errorDetails = classifyError(error);
  errorDetails.context = context;
  
  // Log the error with context - safe access to avoid server component issues
  console.error('Error occurred:', errorDetails.type);
  console.error('Error message:', errorDetails.message);
  if (context) {
    console.error('Error context keys:', Object.keys(context));
  }
  if (errorDetails.statusCode) {
    console.error('Status code:', errorDetails.statusCode);
  }
  
  // Default result with no recovery
  let result = {
    recoverySuccess: false,
    errorDetails,
    friendlyMessage: getFriendlyErrorMessage(errorDetails),
  };
  
  // Apply recovery strategy based on error type
  switch (errorDetails.type) {
    case ErrorType.SESSION_ERROR:
      // Session errors can potentially be recovered by renewing session
      result = await handleSessionError(errorDetails);
      break;
    
    case ErrorType.TIMEOUT_ERROR:
      // Timeout errors might be recovered with a retry
      result = await handleTimeoutError(errorDetails);
      break;
    
    case ErrorType.API_ERROR:
      // API errors might be recovered depending on status code
      result = await handleApiError(errorDetails);
      break;
    
    case ErrorType.TOOL_ERROR:
      // Tool errors might be recovered with fallback options
      result = await handleToolError(errorDetails);
      break;
    
    // Validation errors and unknown errors typically can't be automatically recovered
  }
  
  return result;
}

/**
 * Handle a session error
 */
async function handleSessionError(
  errorDetails: ErrorDetails
): Promise<{
  recoverySuccess: boolean;
  errorDetails: ErrorDetails;
  friendlyMessage: string;
  fallbackResult?: any;
}> {
  // Here you could implement logic to recreate a session
  // For now, just return a friendlier message
  return {
    recoverySuccess: false,
    errorDetails,
    friendlyMessage: 'The session has expired. Please try again.',
  };
}

/**
 * Handle a timeout error
 */
async function handleTimeoutError(
  errorDetails: ErrorDetails
): Promise<{
  recoverySuccess: boolean;
  errorDetails: ErrorDetails;
  friendlyMessage: string;
  fallbackResult?: any;
}> {
  return {
    recoverySuccess: false,
    errorDetails,
    friendlyMessage: 'The request took too long to complete. Please try again or try a simpler query.',
  };
}

/**
 * Handle an API error
 */
async function handleApiError(
  errorDetails: ErrorDetails
): Promise<{
  recoverySuccess: boolean;
  errorDetails: ErrorDetails;
  friendlyMessage: string;
  fallbackResult?: any;
}> {
  // Handle rate limiting separately
  if (errorDetails.statusCode === 429) {
    return {
      recoverySuccess: false,
      errorDetails,
      friendlyMessage: 'The service is currently receiving too many requests. Please try again in a few moments.',
    };
  }
  
  // Server errors
  if (errorDetails.statusCode && errorDetails.statusCode >= 500) {
    return {
      recoverySuccess: false,
      errorDetails,
      friendlyMessage: 'The service is temporarily unavailable. Please try again later.',
    };
  }
  
  // Other API errors
  return {
    recoverySuccess: false,
    errorDetails,
    friendlyMessage: 'There was a problem processing your request. Please try again.',
  };
}

/**
 * Handle a tool error
 */
async function handleToolError(
  errorDetails: ErrorDetails
): Promise<{
  recoverySuccess: boolean;
  errorDetails: ErrorDetails;
  friendlyMessage: string;
  fallbackResult?: any;
}> {
  // Tool errors might have fallback responses
  return {
    recoverySuccess: false,
    errorDetails,
    friendlyMessage: 'There was a problem retrieving data from our sources. Please try a different question.',
  };
}

/**
 * Get a user-friendly error message
 */
function getFriendlyErrorMessage(errorDetails: ErrorDetails): string {
  switch (errorDetails.type) {
    case ErrorType.API_ERROR:
      if (errorDetails.statusCode === 429) {
        return 'The service is currently receiving too many requests. Please try again in a few moments.';
      }
      if (errorDetails.statusCode && errorDetails.statusCode >= 500) {
        return 'The service is temporarily unavailable. Please try again later.';
      }
      return 'There was a problem communicating with the service. Please try again.';
      
    case ErrorType.TIMEOUT_ERROR:
      return 'The request took too long to complete. Please try again or try a simpler query.';
      
    case ErrorType.VALIDATION_ERROR:
      return 'There was a problem with your request format. Please try a different question.';
      
    case ErrorType.SESSION_ERROR:
      return 'Your session has expired or is invalid. Please try again.';
      
    case ErrorType.TOOL_ERROR:
      return 'There was a problem retrieving data from our sources. Please try a different question.';
      
    case ErrorType.UNKNOWN_ERROR:
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}