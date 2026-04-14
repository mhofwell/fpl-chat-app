# Chat UI

The chat UI consumes AG-UI events from `POST /agent/run` on the Python
agent-server and renders them with purple EPL styling. All streaming,
tool-indicator, and auto-scroll behavior is wired through a custom
`AgentSubscriber` that maps events to React state updates.

## Composition

```
ChatTransitionContainer             // owns HttpAgent + Supabase session
  ↳ ComposingView                   // initial landing with textarea + sample prompts
  ↳ ConversationView                // message list with smart auto-scroll
      ↳ MessageBubble               // user or assistant; markdown for assistant
      ↳ TypingIndicator             // animated dots
      ↳ NewMessagesPill             // appears when user scrolls up mid-stream
      ↳ MessageInputBar             // compact bottom input
```

All components are rendered by `ChatTransitionContainer` based on
`viewState: 'composing' | 'conversation'`. Transitions use framer-motion.

## Data flow

```
user submits
  ↓
agentRef.current.addMessage({ id, role: "user", content })
  ↓
supabase.auth.getSession()         // fresh access token
setAgentAuth(agent, token)         // attach to headers
  ↓
agent.runAgent({ runId, tools: [] }, subscriber)
  ↓                                      ↓
  HTTP POST /agent/run            subscriber callbacks fire as events arrive:
  with Authorization: Bearer …      onMessageStart → new assistant bubble
  body: { threadId, runId,          onTextDelta → append to bubble content
          messages, … }              onToolStart → show "Looking up …"
  ↓                                   onToolEnd   → hide indicator
  SSE stream of AG-UI events        onFinish    → clear isStreaming
                                     onError     → append error bubble
```

## Smart auto-scroll

`ConversationView` tracks `isNearBottom` via a scroll listener on Radix's
ScrollArea viewport (`[data-radix-scroll-area-viewport]`). When a new
message arrives:

- If the user is within 100px of the bottom → scroll smoothly.
- Otherwise → set `hasUnread = true`, render `NewMessagesPill` at the
  bottom. Clicking the pill scrolls to the bottom and clears the flag.

This respects the user's intent to scroll up and re-read earlier messages
during a long streaming response without yanking them back every delta.

## Tool indicator

`activeTool` is a component-level state shape `{ id, name } | null`. Set
via `onToolStart` / cleared via `onToolEnd`. Rendered inside the
conversation view as a small pulsing dot + "Looking up {tool_name}…"
while a tool call is executing server-side.

## Customization

- Animation variants live in `animations/transitions.ts`.
- Message styling uses the app's Tailwind theme (`bg-primary`, `bg-surface`,
  `ring-secondary`, etc.) so swapping to a different color palette only
  requires editing the CSS variables.
- `MessageBubble` renders assistant content through `react-markdown` +
  `remark-gfm`. Code detection is block-vs-inline via the
  `language-*` class (react-markdown v10 removed the `inline` prop).
