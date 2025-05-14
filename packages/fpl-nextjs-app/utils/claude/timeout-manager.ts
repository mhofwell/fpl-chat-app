// app/utils/timeout-manager.ts

import { CLAUDE_CONFIG, MCP_CONFIG } from '../../config/ai-config';

/**
 * Creates a promise that resolves after the specified timeout
 */
function createTimeoutPromise(ms: number): Promise<never> {
  let timeoutId: NodeJS.Timeout;
  
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
  
  // Ensure the timeout is cleared if the promise is manually cancelled
  (promise as any).clear = () => clearTimeout(timeoutId);
  
  return promise;
}

/**
 * Execute a function with a timeout
 * Returns the result of the function if it completes within the timeout
 * Otherwise, rejects with a timeout error
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = CLAUDE_CONFIG.API_TIMEOUT
): Promise<T> {
  // Create a timeout promise
  const timeoutPromise = createTimeoutPromise(timeoutMs);
  
  try {
    // Race the function against the timeout
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    // Clean up the timeout if needed
    if ((timeoutPromise as any).clear) {
      (timeoutPromise as any).clear();
    }
  }
}

/**
 * Execute an Anthropic API call with a timeout
 */
export async function withAnthropicTimeout<T>(
  fn: () => Promise<T>,
  customTimeoutMs?: number
): Promise<T> {
  return withTimeout(fn, customTimeoutMs || CLAUDE_CONFIG.API_TIMEOUT);
}

/**
 * Execute an MCP tool call with a timeout
 */
export async function withToolTimeout<T>(
  fn: () => Promise<T>,
  customTimeoutMs?: number
): Promise<T> {
  return withTimeout(fn, customTimeoutMs || MCP_CONFIG.TOOL_TIMEOUT);
}

/**
 * Dynamic timeout calculation based on request complexity
 * More complex requests get longer timeouts
 */
export function calculateDynamicTimeout(
  messageLength: number, 
  hasToolCalls: boolean,
  baseTimeout: number = CLAUDE_CONFIG.API_TIMEOUT
): number {
  // Start with the base timeout
  let timeout = baseTimeout;
  
  // Longer messages need more time
  if (messageLength > 1000) {
    timeout += Math.min(messageLength / 10, 5000); // Up to 5 seconds more for long messages
  }
  
  // Tool calls need more time
  if (hasToolCalls) {
    timeout += 5000; // Add 5 seconds for tool calls
  }
  
  return timeout;
}

/**
 * Abort controller with timeout
 * Creates an AbortController that will automatically abort after the specified timeout
 */
export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  // Attach the timeout ID to the controller for cleanup
  (controller as any).timeoutId = timeoutId;
  
  const originalAbort = controller.abort.bind(controller);
  controller.abort = function(reason?: any) {
    clearTimeout((controller as any).timeoutId);
    originalAbort(reason);
  };
  
  return controller;
}

/**
 * Wrapper for fetch with timeout using AbortController
 */
export async function fetchWithTimeout<T>(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = CLAUDE_CONFIG.API_TIMEOUT
): Promise<Response> {
  const controller = createTimeoutController(timeoutMs);
  
  try {
    // Add the signal to the options
    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal,
    };
    
    return await fetch(url, fetchOptions);
  } finally {
    // Clean up the controller
    if (!(controller.signal as any).aborted) {
      controller.abort();
    }
  }
}