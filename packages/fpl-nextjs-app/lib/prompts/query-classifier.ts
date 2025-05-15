// lib/prompts/query-classifier.ts

export interface QueryClassification {
  intent: 'fpl-fantasy' | 'fpl-stats' | 'general';
  confidence: number;
  reasoning: string;
}

export function classifyQuery(message: string): QueryClassification {
  const lowerMessage = message.toLowerCase();
  
  // Strong indicators of fantasy intent
  const fantasyIndicators = {
    explicit: ['fpl', 'fantasy', 'fantasy points', 'fpl points'],
    context: ['points', 'value', 'price', 'worth', 'cost', 'ownership', 'selected'],
    action: ['captain', 'transfer', 'buy', 'sell', 'pick', 'team'],
    comparison: ['better than', 'worth more', 'good value', 'differential']
  };
  
  // Strong indicators of real stats intent
  const statsIndicators = {
    explicit: ['real goals', 'actual goals', 'premier league goals', 'scored'],
    context: ['top scorer', 'most goals', 'leading scorer', 'goals in'],
    action: ['scored against', 'goals this season', 'assists to']
  };
  
  let fantasyScore = 0;
  let statsScore = 0;
  
  // Check for explicit mentions (highest weight)
  fantasyIndicators.explicit.forEach(term => {
    if (lowerMessage.includes(term)) fantasyScore += 3;
  });
  
  statsIndicators.explicit.forEach(term => {
    if (lowerMessage.includes(term)) statsScore += 3;
  });
  
  // Context clues (medium weight)
  fantasyIndicators.context.forEach(term => {
    if (lowerMessage.includes(term) && !lowerMessage.includes('goal')) {
      fantasyScore += 2;
    }
  });
  
  statsIndicators.context.forEach(term => {
    if (lowerMessage.includes(term)) statsScore += 2;
  });
  
  // Action words (lower weight)
  fantasyIndicators.action.forEach(term => {
    if (lowerMessage.includes(term)) fantasyScore += 1;
  });
  
  // Special case: "points" without "goal" context
  if (lowerMessage.includes('points') && 
      !lowerMessage.includes('goal') && 
      !lowerMessage.includes('scored')) {
    fantasyScore += 2;
  }
  
  // Player name + "points" pattern
  const playerPointsPattern = /\b(salah|haaland|palmer|son|kane|isak).*points\b/;
  if (playerPointsPattern.test(lowerMessage)) {
    fantasyScore += 2;
  }
  
  // Determine intent based on scores
  const totalScore = fantasyScore + statsScore;
  
  if (totalScore === 0) {
    return { intent: 'general', confidence: 0.5, reasoning: 'No clear indicators' };
  }
  
  const fantasyConfidence = fantasyScore / totalScore;
  const statsConfidence = statsScore / totalScore;
  
  if (fantasyConfidence > 0.6) {
    return { 
      intent: 'fpl-fantasy', 
      confidence: fantasyConfidence,
      reasoning: `Fantasy indicators: ${fantasyScore}, Stats indicators: ${statsScore}`
    };
  } else if (statsConfidence > 0.6) {
    return { 
      intent: 'fpl-stats', 
      confidence: statsConfidence,
      reasoning: `Stats indicators: ${statsScore}, Fantasy indicators: ${fantasyScore}`
    };
  } else {
    return { 
      intent: 'general', 
      confidence: 0.5,
      reasoning: `Mixed signals - Fantasy: ${fantasyScore}, Stats: ${statsScore}`
    };
  }
}