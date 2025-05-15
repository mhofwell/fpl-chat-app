// app/api/chat/stream/tools.ts
import { fplMVPToolsForClaude } from './mvp-tools';

// For MVP, use only the FPL tools that work with real data
export const toolsForClaude = fplMVPToolsForClaude;