
  1. Rich Message Components
  - Inline interactive cards for player comparisons (swipe to compare)
  - Mini-charts embedded in responses (sparklines for form)
  - Collapsible team sheets within messages
  - Quick action buttons (Transfer/Captain/Bench) right in chat bubbles

  2. Conversational Commands
  - "Show me my team" → Interactive lineup card appears
  - "Compare Sterling vs Saka" → Side-by-side stats card
  - "What changed?" → Live update feed as a message thread
  - "Wildcard options under 50m" → Filtered, actionable suggestions

  3. Smart Notifications as Messages
  - Price alerts appear as chat messages with one-tap actions
  - "⚡ Haaland just scored! He's in 67% of teams. You don't own him. Consider for GW12?"
  - Deadline reminders with your specific team context

  4. Progressive Disclosure
  - Start with simple answers, expand on demand
  - "Salah is a good captain choice ✓" → tap for detailed analysis
  - Nested conversations for deep dives without cluttering main chat

  5. Context-Aware Shortcuts
  - Floating quick actions based on conversation context
  - Discussing transfers? Transfer button appears
  - Talking about captaincy? Captain selector activates
  - Smart suggestions in input bar based on chat history

  6. Hybrid Modes
  - "/pitch" command opens a mini pitch view overlay
  - "/stats" opens floating stats panel alongside chat
  - Picture-in-picture for live scores while chatting
  - Voice input for quick queries during matches

  7. Chat-Native Features
  - Bookmark important messages (team reveals, good advice)
  - Share chat snippets with mini-league rivals
  - Threading for different topics (transfers, captaincy, leagues)
  - Reactions to track which advice worked (👍/👎)

  The key insight: Don't try to replicate a full dashboard in chat. Instead, make the chat incredibly smart
  about when to show what, with rich media messages and progressive UI that appears exactly when needed.

## Core Concept: Context-Aware Live Notifications

### Smart Notification Timing
When events happen (goals, price changes, etc.), we inject notifications based on context and timing:

1. **User Context**
   - If they own Haaland: "⚡ Your player Haaland just scored! +6 points"
   - If they don't own: "⚡ Haaland scored (67% ownership). You're missing out on 6 points"
   - If they're considering him: "⚡ Haaland scored! Remember you were thinking about bringing him in?"

2. **Conversation Context**
   - If discussing captaincy: "⚡ Haaland scored! Still time to captain him for GW12"
   - If discussing transfers: "⚡ Haaland scored again. £13.2m, consider for your front line?"
   - If analyzing captain picks: "⚡ Your captain Salah blanked, but 67% captained Haaland (12 pts)"
   - If idle chat: Simple notification with expand option
   - During pre-deadline planning: Price change alerts take priority

3. **Timing Intelligence**
   - During match: Real-time injection
   - Post-match: Batched summary if multiple events
   - Pre-deadline: Relevant for decision-making

### Implementation Approach

```typescript
// Example notification logic
interface LiveNotification {
  type: 'goal' | 'assist' | 'card' | 'price_change';
  player: Player;
  context: {
    userOwns: boolean;
    inWatchlist: boolean;
    recentlyDiscussed: boolean;
    ownership: number;
  };
  impact: {
    points: number;
    rankChange?: number;
    mlRankChange?: number;
  };
}

// Smart injection based on chat state
function shouldInjectNotification(
  notification: LiveNotification,
  chatState: ChatState
): boolean {
  // High priority: User owns player or recently discussed
  if (notification.context.userOwns || notification.context.recentlyDiscussed) {
    return true;
  }
  
  // Medium priority: High ownership player they don't own
  if (notification.context.ownership > 50 && !notification.context.userOwns) {
    return chatState.isActive && !chatState.isTyping;
  }
  
  // Low priority: Watchlist players
  return notification.context.inWatchlist && chatState.lastMessageTime < 5_MINUTES_AGO;
}
```

### Notification Types

1. **Inline Alerts** (Non-disruptive)
   - Appear as special message bubbles
   - Can be dismissed or expanded
   - Don't interrupt user typing

2. **Action Cards** (Companion Actions)
   - "Haaland scored! Captain him?" [Add to Notes] [Show Stats] [Compare Options]
   - "Sterling price rising tonight" [Set Reminder] [Add to Watchlist] [View Alternatives]
   - Links to official FPL app with pre-filled context when action needed

3. **Contextual Summaries** (Batched)
   - "While you were away: 3 of your players returned, 2 price changes..."
   - Expandable to see details

### Privacy & Control

- User preferences for notification types
- Quiet hours setting
- Importance thresholds
- Option to mute specific players/events

### Technical Architecture

1. **WebSocket Connection**: For real-time events
2. **Event Prioritization**: Smart filtering based on relevance
3. **Chat State Management**: Track conversation context
4. **User Preference Engine**: Personalized notification rules

This creates a living, breathing chat experience that feels like having an expert FPL friend who's always watching the game with you.

## Companion App Philosophy

Since the FPL API is read-only, we position this as the **ultimate FPL intelligence assistant** across the full gameweek cycle:

### Core Value Props

1. **Pre-Deadline Decision Engine** (PRIMARY USE CASE)
   - "Should I take a -4 for Haaland?" → Deep analysis with projections
   - Captain picks with weather, form, and historical performance
   - Differential suggestions based on ML rivals
   - Transfer planner with price change predictions

2. **Live Match Tracker** (SECONDARY)
   - Real-time rank updates ("That goal moved you up 50k!")
   - Scout potential targets ("Note: Foden looking sharp")
   - Track ML rival fortunes
   - Emotional support during captain blanks

3. **Post-Match Analysis**
   - "What went wrong?" performance reviews
   - Learning from successful managers
   - Building watchlists for future gameweeks
   - Identifying template shifts early

### User Journey

```
Tuesday-Thursday → Friday Morning → During Matches → Post-Match → Next Cycle
       ↓                ↓                ↓              ↓            ↓
   Research      Final Decisions    Track/Scout      Review       Learn
       ↓                ↓                ↓              ↓            ↓
   Analysis  →  Transfer Planning →  Live Ranks  →  Insights  →  Improve
                        ↓
              Open Official FPL App
              (execute our recommendations)
```

### Key Features as Companion

- **Smart Clipboard**: Copy transfer suggestions to paste into FPL app
- **Decision Journal**: Track what you planned vs what you did
- **Push Notifications**: Reminders to make transfers before deadline
- **Deep Links**: One-tap to open FPL app at the right screen
- **Screenshot Analysis**: Analyze your team via screenshots
- **Voice Notes**: Record transfer thoughts during matches

The app becomes indispensable not because it makes transfers, but because it makes you a better FPL manager through superior information, timing, and insights.