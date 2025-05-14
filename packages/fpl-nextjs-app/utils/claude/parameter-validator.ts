// app/utils/parameter-validator.ts

import { TOOL_USAGE_CONFIG } from '../../config/ai-config';

// Validation rule types
type ValidationRule = (value: any) => boolean;

type FieldValidationRules = {
  [fieldName: string]: ValidationRule;
};

type SchemaValidationRules = {
  requiredFields?: string[];
  fieldValidation?: FieldValidationRules;
  customValidation?: (params: Record<string, any>) => boolean;
};

// Validation schema for each tool
const VALIDATION_SCHEMAS: Record<string, SchemaValidationRules> = {
  'get-player': {
    requiredFields: ['playerQuery'],
    fieldValidation: {
      playerQuery: (value) => typeof value === 'string' && value.trim().length > 0,
      teamId: (value) => value === undefined || (typeof value === 'number' && value > 0),
      teamName: (value) => value === undefined || (typeof value === 'string' && value.trim().length > 0),
      position: (value) => {
        if (value === undefined) return true;
        return typeof value === 'string' && ['GKP', 'DEF', 'MID', 'FWD'].includes(value);
      },
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
  },
  
  'get-team': {
    requiredFields: ['teamQuery'],
    fieldValidation: {
      teamQuery: (value) => typeof value === 'string' && value.trim().length > 0,
      includeFixtures: (value) => value === undefined || typeof value === 'boolean',
      includePlayers: (value) => value === undefined || typeof value === 'boolean',
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
  },
  
  'get-gameweek': {
    fieldValidation: {
      gameweekId: (value) => value === undefined || (typeof value === 'number' && value > 0 && value <= 38),
      type: (value) => {
        if (value === undefined) return true;
        return typeof value === 'string' && ['current', 'next', 'previous'].includes(value.toLowerCase());
      },
      includeFixtures: (value) => value === undefined || typeof value === 'boolean',
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
    // Custom validation: must provide either gameweekId or type
    customValidation: (params) => {
      return params.gameweekId !== undefined || params.type !== undefined;
    },
  },
  
  'search-players': {
    fieldValidation: {
      query: (value) => value === undefined || (typeof value === 'string' && value.trim().length > 0),
      teamName: (value) => value === undefined || (typeof value === 'string' && value.trim().length > 0),
      position: (value) => {
        if (value === undefined) return true;
        return typeof value === 'string' && ['GKP', 'DEF', 'MID', 'FWD'].includes(value);
      },
      minPrice: (value) => value === undefined || (typeof value === 'number' && value >= 0),
      maxPrice: (value) => value === undefined || (typeof value === 'number' && value >= 0),
      minTotalPoints: (value) => value === undefined || (typeof value === 'number' && value >= 0),
      sortBy: (value) => {
        if (value === undefined) return true;
        return typeof value === 'string' && [
          'total_points_desc', 
          'now_cost_asc', 
          'now_cost_desc',
          'form_desc',
          'selected_by_percent_desc',
          'price_rise_desc',
          'price_rise_asc'
        ].includes(value);
      },
      limit: (value) => value === undefined || (typeof value === 'number' && value > 0 && value <= 100),
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
  },
  
  'search-fixtures': {
    fieldValidation: {
      teamQuery: (value) => value === undefined || (typeof value === 'string' && value.trim().length > 0),
      gameweekId: (value) => value === undefined || (typeof value === 'number' && value > 0 && value <= 38),
      difficultyMin: (value) => value === undefined || (typeof value === 'number' && value >= 1 && value <= 5),
      difficultyMax: (value) => value === undefined || (typeof value === 'number' && value >= 1 && value <= 5),
      sortBy: (value) => {
        if (value === undefined) return true;
        return typeof value === 'string' && [
          'kickoff_time_asc',
          'kickoff_time_desc',
          'difficulty_desc',
          'difficulty_asc'
        ].includes(value);
      },
      includeDetails: (value) => value === undefined || typeof value === 'boolean',
      limit: (value) => value === undefined || (typeof value === 'number' && value > 0 && value <= 100),
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
  },
  
  'compare-entities': {
    requiredFields: ['entity1Query', 'entity2Query', 'entityType'],
    fieldValidation: {
      entity1Query: (value) => typeof value === 'string' && value.trim().length > 0,
      entity2Query: (value) => typeof value === 'string' && value.trim().length > 0,
      entityType: (value) => typeof value === 'string' && ['player', 'team'].includes(value.toLowerCase()),
      includeRawData: (value) => value === undefined || typeof value === 'boolean',
    },
  },
};

/**
 * Validates parameters for a specific tool call
 * Returns an object with validation result and error details if invalid
 */
export function validateToolParameters(
  toolName: string,
  params: Record<string, any>
): { valid: boolean; errors?: string[] } {
  // Get validation schema for this tool
  const schema = VALIDATION_SCHEMAS[toolName];
  
  // If no schema defined, use generic validation from tool config
  if (!schema) {
    const configRules = TOOL_USAGE_CONFIG.VALIDATION_RULES[toolName as keyof typeof TOOL_USAGE_CONFIG.VALIDATION_RULES];
    
    if (!configRules) {
      // No validation rules found, consider it valid
      return { valid: true };
    }
    
    const missingFields = configRules.requiredFields?.filter(
      (field) => params[field] === undefined
    );
    
    if (missingFields && missingFields.length > 0) {
      return { 
        valid: false, 
        errors: missingFields.map(field => `Missing required field: ${field}`) 
      };
    }
    
    return { valid: true };
  }
  
  const errors: string[] = [];
  
  // Check required fields
  if (schema.requiredFields) {
    for (const field of schema.requiredFields) {
      if (params[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Check field validation rules
  if (schema.fieldValidation) {
    for (const [field, validator] of Object.entries(schema.fieldValidation)) {
      // Only validate fields that are present
      if (params[field] !== undefined && !validator(params[field])) {
        errors.push(`Invalid value for field: ${field}`);
      }
    }
  }
  
  // Run custom validation if defined
  if (schema.customValidation && !schema.customValidation(params)) {
    errors.push('Parameters do not meet custom validation rules');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Fix parameters for a specific tool call if possible
 * Returns fixed parameters or original parameters if no fixes are needed/possible
 */
export function fixToolParameters(
  toolName: string,
  params: Record<string, any>
): Record<string, any> {
  // Clone the parameters to avoid modifying the original
  const fixedParams = { ...params };
  
  // Apply tool-specific fixes
  switch (toolName) {
    case 'get-player':
      // Ensure playerQuery is a string
      if (typeof fixedParams.playerQuery === 'number') {
        fixedParams.playerQuery = String(fixedParams.playerQuery);
      }
      
      // Convert teamId to number if it's a string that looks like a number
      if (typeof fixedParams.teamId === 'string' && /^\d+$/.test(fixedParams.teamId)) {
        fixedParams.teamId = parseInt(fixedParams.teamId, 10);
      }
      break;
      
    case 'get-team':
      // Convert teamId to number if it's a string that looks like a number
      if (typeof fixedParams.teamId === 'string' && /^\d+$/.test(fixedParams.teamId)) {
        fixedParams.teamId = parseInt(fixedParams.teamId, 10);
      }
      break;
      
    case 'get-gameweek':
      // Convert gameweekId to number if it's a string that looks like a number
      if (typeof fixedParams.gameweekId === 'string' && /^\d+$/.test(fixedParams.gameweekId)) {
        fixedParams.gameweekId = parseInt(fixedParams.gameweekId, 10);
      }
      
      // Normalize type to lowercase
      if (typeof fixedParams.type === 'string') {
        fixedParams.type = fixedParams.type.toLowerCase();
      }
      break;
      
    case 'search-players':
      // Convert numeric strings to numbers
      if (typeof fixedParams.minPrice === 'string' && /^\d+(\.\d+)?$/.test(fixedParams.minPrice)) {
        fixedParams.minPrice = parseFloat(fixedParams.minPrice);
      }
      if (typeof fixedParams.maxPrice === 'string' && /^\d+(\.\d+)?$/.test(fixedParams.maxPrice)) {
        fixedParams.maxPrice = parseFloat(fixedParams.maxPrice);
      }
      if (typeof fixedParams.minTotalPoints === 'string' && /^\d+$/.test(fixedParams.minTotalPoints)) {
        fixedParams.minTotalPoints = parseInt(fixedParams.minTotalPoints, 10);
      }
      if (typeof fixedParams.limit === 'string' && /^\d+$/.test(fixedParams.limit)) {
        fixedParams.limit = parseInt(fixedParams.limit, 10);
      }
      break;
      
    case 'search-fixtures':
      // Convert numeric strings to numbers
      if (typeof fixedParams.gameweekId === 'string' && /^\d+$/.test(fixedParams.gameweekId)) {
        fixedParams.gameweekId = parseInt(fixedParams.gameweekId, 10);
      }
      if (typeof fixedParams.difficultyMin === 'string' && /^\d+$/.test(fixedParams.difficultyMin)) {
        fixedParams.difficultyMin = parseInt(fixedParams.difficultyMin, 10);
      }
      if (typeof fixedParams.difficultyMax === 'string' && /^\d+$/.test(fixedParams.difficultyMax)) {
        fixedParams.difficultyMax = parseInt(fixedParams.difficultyMax, 10);
      }
      if (typeof fixedParams.limit === 'string' && /^\d+$/.test(fixedParams.limit)) {
        fixedParams.limit = parseInt(fixedParams.limit, 10);
      }
      break;
      
    case 'compare-entities':
      // Normalize entityType to lowercase
      if (typeof fixedParams.entityType === 'string') {
        fixedParams.entityType = fixedParams.entityType.toLowerCase();
      }
      break;
  }
  
  return fixedParams;
}

/**
 * Validate and fix parameters for a specific tool call
 * Returns an object with validation result, fixed parameters, and error details if invalid
 */
export function validateAndFixToolParameters(
  toolName: string,
  params: Record<string, any>
): { 
  valid: boolean; 
  fixedParams: Record<string, any>;
  errors?: string[];
  paramsChanged: boolean;
} {
  // Fix parameters if possible
  const fixedParams = fixToolParameters(toolName, params);
  
  // Check if parameters were changed
  const paramsChanged = JSON.stringify(fixedParams) !== JSON.stringify(params);
  
  // Validate the fixed parameters
  const validation = validateToolParameters(toolName, fixedParams);
  
  return {
    valid: validation.valid,
    fixedParams,
    errors: validation.errors,
    paramsChanged,
  };
}