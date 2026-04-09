# Project Progress - FPL Chat App

## Current Status

## Phase 1 To-Do List

### 1. MCP Client Integration (Priority: Critical) ✅ COMPLETED

- [x] Created server actions for MCP communication
- [x] Implemented `initializeMcpSession` function
- [x] Added session management with UUID generation
- [x] Created utility functions for MCP requests (callMcpTool, listMcpTools)
- [x] Implemented SSE response parsing
- [x] Tested echo tool functionality

### 2. Chat Interface on Home Page (Priority: Critical) ✅ COMPLETED

- [x] Replace current hero component with chat interface
- [x] Build message input component with auto-resize
- [x] Add submit button with Send icon
- [x] Implement loading states handling
- [x] Style chat interface with dark theme
- [x] Center layout with proper spacing
- [x] Add FPL-specific quick action buttons
- [x] Build message list component with auto-scroll
- [x] Add message bubble components (user/assistant)

### 3. Connect Client to Server (Priority: Critical) ✅ COMPLETED

- [x] Created server actions for MCP communication (no API routes needed)
- [x] Implemented SSE response parsing in server actions
- [x] Added error handling for connection failures
- [x] Tested end-to-end message flow with echo tool
- [x] Session management implemented (in-memory for now)
- [x] Connection status visible in test page

### 5. Update Home Page (Priority: High) ✅ COMPLETED

- [x] Remove tutorial/hero components
- [x] Integrate chat as main component
- [x] Add MCP session initialization on page load
- [x] Handle both authenticated and anonymous users
- [x] Add proper loading and error states
- [x] Include FPL branding/context

### 6. Session Management Strategy (Priority: High)

- [ ] Implement anonymous session creation for non-authenticated users
- [ ] Link MCP sessions to Supabase auth when user logs in
- [ ] Persist chat history for authenticated users
- [ ] Clear anonymous sessions after inactivity
- [ ] Handle session migration (anonymous → authenticated)

### 7. Testing & Validation (Priority: Medium) ⚠️ PARTIALLY COMPLETE

- [x] Test message sending and receiving
- [x] Validate anonymous and authenticated sessions
- [x] Test error scenarios (server down, network issues)
- [ ] Test session persistence and migration
- [ ] Test with multiple concurrent users

### 8. Environment & Deployment (Priority: Low for MVP) ⚠️ PARTIALLY COMPLETE

- [x] Add MCP server URL to environment variables
- [ ] Update README with setup instructions
- [ ] Document API endpoints
- [ ] Add health check endpoint to MCP server

## Next Phase: Claude Integration (Priority: Critical)

### Claude Conversation Requirements: Iteration 1

1. **Streaming Responses** ✅

- Implement streaming API integration with Anthropic Claude ✅
- Update chat UI to handle streaming tokens in real-time ✅
- Show partial responses as they arrive ✅
- Handle markdown rendering during streaming ✅

2. **Error Handling** ✅

- Gracefully handle API errors (rate limits, network issues, invalid responses) ✅
- Display user-friendly error messages in chat ✅
- Implement retry logic for transient failures ✅
- Fallback messages when Claude is unavailable ✅

3. **FPL Expert System Prompt** ✅

- Create system prompt establishing Claude as EPL/FPL expert ✅
- Include context about current season, gameweek, and rules (TODO: add dynamic context) ****\*\*\*****
- Define tone and expertise level ✅
- Set boundaries for FPL-specific assistance ✅

### Claude Conversation Requirements: Iteration 2

4.  **Rate Limiting/Throttling**

- Client-side request throttling to prevent spam
- Cost control through usage limits
- User feedback when rate limited

5. **Message History Management**

- Implement sliding window for context (e.g., last 10 messages)
- Balance context vs token usage
- Handle conversation truncation gracefully

6. **Enhanced Loading States**

- Typing indicators before stream starts
- Handle latency between send and first token
- Progress indication for long responses

7. **Token Usage Tracking** (Optional for MVP)

- Monitor approximate token usage
- Cost tracking and alerts
- Message length warnings

### Claude Conversation Requirements: Iteration 3

8. **Streaming Edge Cases**

- Handle partial markdown/code blocks
- Manage interrupted streams
- Clean up incomplete responses

9. **Session Management**

- Store conversations in localStorage/database
- New conversation vs continue existing
- Conversation history for authenticated users

### Implementation Plan

1. Start with core requirements (streaming, errors, prompt)
2. Add rate limiting and history management
3. Enhance loading states and edge cases
4. Implement session persistence
5. Add token tracking if needed

## Phase 2: FPL Tool Implementation (Priority: Critical)

### Stage 1: Basic Tool Infrastructure ✅ COMPLETED

- [x] Create simple FPL API client from scratch
- [x] Implement bootstrap-static data loading and caching:
    - [x] Load `/bootstrap-static/` on server startup (~2-3MB, contains all players/teams)
    - [x] Build player name → ID index for fast lookups
    - [x] Cache bootstrap data in memory
- [x] Created `get_player_info` tool with basic functionality
- [x] Test end-to-end: User → Claude → MCP Tool → FPL API → Response
- [x] Basic error handling for FPL API failures
- [x] Fixed streaming tool parameters issue (accumulate JSON deltas)

### Stage 1.5: Enhanced Player Info Tool (Current Focus) 🔄

#### Objective: Create a comprehensive, structured approach for the `get_player_info` tool that will serve as a template for all other tools

- [ ] **Enhance data returned from bootstrap-static**:
    - [ ] Basic stats: `goals_scored`, `assists`, `clean_sheets`, `minutes`, `starts`, `yellow_cards`, `red_cards`, `team`
    - [ ] Advanced stats: `expected_goals`, `expected_assists`, `expected_goal_involvements`
    - [ ] ICT Index: `influence`, `creativity`, `threat`, `ict_index`
    - [ ] Form data: `form`, `points_per_game`, recent gameweek history, `points_per_game_rank`, `form_rank`
    - [ ] Ownership: `selected_by_percent`, `transfers_in`, `transfers_out`
    - [ ] Value: `now_cost`, `cost_change_start`, `value_season`
    - [ ] News: `news`, news_added`

- [ ] **Implement structured response format EXAMPLE**:
    ```typescript
    {
      basic: { 
        name: "M.Salah",
        team: "Liverpool", 
        position: "MID",
        price: 13.6,
        total_points: 344
      },
      scoring: { 
        goals: 10,
        assists: 8,
        bonus: 25,
        expected_goals: 11.24,
        expected_assists: 6.87
      },
      form: { 
        rating: "9.2",
        last_5_games: [8, 2, 2, 2, 10],
        points_per_game: "8.1"
      },
      ownership: { 
        selected_by: "66.3%",
        transfers_in: 125000,
        transfers_out: 45000
      },
      playing: {
        minutes: 1234,
        starts: 14,
        chance_of_playing: 100
      }
    }
    ```

- [ ] **Update tool implementation**:
    - [ ] Modify `formatPlayer` to return structured data
    - [ ] Keep original text format for Claude's response
    - [ ] Add logic to focus on relevant sections based on query

- [ ] **Improve tool description**:
    ```
    "Returns comprehensive player data including:
    - Basic info: name, team, position, price, total points
    - Scoring: goals, assists, bonus, xG, xA
    - Form: rating, last 5 games, points per game
    - Ownership: selection %, transfers
    - Playing time: minutes, starts, injury status"
    ```

- [ ] **Test various query types**:
    - [ ] "Show me Salah's goals" → Emphasize scoring section
    - [ ] "Is Haaland in form?" → Emphasize form section
    - [ ] "Who owns Palmer?" → Emphasize ownership section
    - [ ] "Is Martinelli injured?" → Check news/status fields

- [ ] **Document patterns for future tools**:
    - [ ] Structured response format
    - [ ] Comprehensive data from bootstrap
    - [ ] Clear tool descriptions
    - [ ] Query-aware responses

### Stage 2: Enhanced Tools & Data

- [ ] Add the remaining basic tools:
    - [ ] `get_team_players` - List players from a specific team
    - [ ] `get_team` - List stats and form for a particular EPL team
    - [ ] `get_fixtures` - Upcoming fixtures for current gameweek
- [ ] Create simple data formatters (raw API → readable formats)
- [ ] Add basic in-memory caching (simple Map object)
- [ ] Then add comparison tools:
    - [ ] `compare_players` - Side-by-side player comparison
    - [ ] `get_player_form` - Recent performance analysis

### Stage 3: Redis Integration (Now Higher Priority)

- [ ] Move bootstrap-static cache from memory to Redis
- [ ] Cache individual player detail responses (element-summary)
- [ ] Set appropriate TTLs:
    - [ ] Bootstrap data: 6 hours (players don't change often)
    - [ ] Player details: 15 minutes (stats update frequently)
    - [ ] Live match data: 2 minutes
- [ ] Add cache invalidation strategies
- [ ] Monitor cache hit rates and performance

### Stage 4: Type Extraction & Resources

- [ ] Extract TypeScript interfaces from working code
- [ ] Create shared types package with discovered patterns
- [ ] Consider converting static data to MCP resources:
    - [ ] Team names, IDs, and colors
    - [ ] Position mappings
    - [ ] Gameweek schedule
- [ ] Document tool parameters and response formats

## Phase 3: Future Enhancements

- [ ] Advanced FPL analysis tools (ML predictions, form trends)
- [ ] Live match data integration
- [ ] Multi-user league comparisons
- [ ] Chat history persistence for authenticated users
- [ ] Rate limiting for anonymous users
- [ ] Cost optimization with token usage tracking

## Success Criteria for Phase 1

1. Any user can access chat on home page without authentication ✅ (Chat UI accessible to all)
2. User can send messages to Claude via server actions ✅ (Claude integration working)
3. Claude can respond to user messages ✅ (Basic request/response implemented)
4. Sessions work for both anonymous and authenticated users ✅ (Session management working)
5. Proper error handling throughout ✅ (Error handling implemented)
6. Responsive design works on mobile and desktop ⚠️ (Basic responsive design, needs testing)

## Recent Achievements (June 2, 2025)

- Successfully established MCP client-server communication
- Implemented server actions pattern (more secure than direct browser-to-MCP)
- Created session management with UUID generation
- Fixed SSE response parsing issues
- Verified echo tool functionality
- Built chat UI interface matching design mockup
- Implemented auto-resizing textarea with proper styling
- Added FPL-themed UI with custom fonts (Inter & Outfit)
- Created centered layout with navbar and footer
- Updated branding to "Your FPL Assistant" / "Let's make some picks ⚽️"
- Added FPL-specific quick action buttons (Players, Teams, Fixtures, Fantasy, History)
- Integrated MCP session initialization on page load
- **Implemented Claude integration via Anthropic SDK**
- **Created server action for Claude chat functionality**
- **Added FPL expert system prompt**
- **Connected chat UI to Claude responses**
- **Fixed build errors and maintained MCP for future tool integration**
- **Implemented streaming responses with real-time token display**
- **Added markdown rendering with react-markdown and remark-gfm**
- **Created API route for streaming to avoid serialization errors**
- **Added support for code blocks, lists, tables, and formatted text**
- **Implemented streaming cursor indicator during response generation**
- **Implemented comprehensive error handling with user-friendly messages**
- **Added retry logic with exponential backoff for transient failures**
- **Created error type detection (rate limits, network, auth, server errors)**
- **Added fallback messages for all error scenarios**

## Notes

- Chat is public-facing, no authentication required
- Consider rate limiting for anonymous users in future phases
- Keep the UI simple for MVP - enhance later
- Prioritize reliable communication over features
- Test thoroughly with the example questions from product overview
- **Phase 2 Redis Strategy**: Start with in-memory caching, add Redis in Stage 3 for production-ready caching
- **Type-First vs Code-First**: Building working tools first, extracting types later ensures practical interfaces
- **Build vs Copy Decision**: Creating tools from scratch ensures understanding; use example as reference, not starting point
- **Start Minimal**: One tool (get_player_info) is enough to prove the entire flow works
- **Bootstrap-Static Reality**: 2-3MB endpoint is mandatory - no lighter alternative for player names exists
- **Caching Strategy**: In-memory for Stage 1 (simple), Redis for Stage 3 (production-ready)
- **Two-Step Player Lookup**: bootstrap-static for names→IDs, element-summary for detailed data

<!-- Need to think about conversation management: Save, Delete, Create, Continue Previous -->

<!-- NOTE BELOW on PRE-SEEDING CLAUDE WITH CONTEXT -->

There are several ways to provide FPL context to Claude:

1. System Prompt Context (What you're currently doing)

You're embedding context directly in the system prompt. This is good for:

- Static context that doesn't change often (rules, general strategy)
- Session-wide context like current gameweek, season stats
- Global information that applies to all conversations

The advantage is that Claude always has this information available from the start of any conversation.

2. Pre-seeded Conversation History

Instead of just starting with a user message, you could pre-populate the conversation with context:
messages: [
{
role: 'assistant',
content: 'Welcome! I have the latest FPL data loaded. Current leaders: Haaland (12 goals), Salah (10
goals)...'
},
{
role: 'user',
content: 'Thanks! What about midfielder options under £7m?'
},
{
role: 'assistant',
content: 'Based on current form and fixtures, here are top budget midfielders...'
},
{
role: 'user',
content: message // The actual user's question
}
]

This gives Claude examples of the kind of data available and conversation style.

3. Dynamic Tool-Based Context

Instead of hardcoding stats, you could have tools that fetch current data:

- get_season_stats - Returns top scorers, assists, etc.
- get_current_gameweek - Returns deadline, fixtures
- get_price_changes - Returns recent price movements

Claude would call these tools when needed, ensuring data is always fresh.

4. Hybrid Approach (Recommended)

Combine methods:

- System prompt: Core FPL rules, Claude's role, general strategy
- Dynamic context function: Current gameweek, deadline (changes weekly)
- Tools: For specific player/team queries (real-time data)
- Conversation memory: Previous recommendations, user's team

5. Context from FPL Bootstrap Data

Since your FPL client loads bootstrap data on startup, you could:

- Extract key stats when the server starts
- Update the context periodically (every hour/day)
- Include trending players, form players, price changes
- Add fixture difficulty for upcoming gameweeks

The key is balancing:

- Freshness: How current does the data need to be?
- Token usage: System prompts count against your limit
- Relevance: Only include context that helps Claude answer better
- Performance: Don't fetch too much data on every request

Your current approach with getFPLContext() is good - you just need to connect it to your actual FPL data
source instead of hardcoded values. The bootstrap data from your MCP server would be perfect for this.
