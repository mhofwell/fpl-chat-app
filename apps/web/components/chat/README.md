# Claude-like Chat Transition UI

This implementation provides a smooth, animated transition experience similar to Claude's chat interface.

## Features

- **Smooth View Transitions**: Animated transition from composing view to conversation view
- **Message Animations**: Messages appear with subtle fade-in and slide animations
- **Streaming Support**: Built-in support for streaming responses with typing indicators
- **Auto-scroll**: Automatically scrolls to the latest message
- **Responsive Design**: Works on desktop and mobile devices

## Components

### ChatTransitionContainer
The main orchestrator component that manages the view state and transitions.

```tsx
<ChatTransitionContainer
  onSendMessage={handleSendMessage}
  sampleQuestions={SAMPLE_QUESTIONS}
  title="Let's make some picks"
  subtitle="How can I help this season?"
/>
```

### ComposingView
The initial view with a large, centered textarea for composing messages.

### ConversationView
The chat view that displays messages and includes a compact input bar at the bottom.

### MessageInputBar
A compact input component used in the conversation view.

### TypingIndicator
An animated typing indicator shown while the assistant is generating a response.

## Animation Flow

1. **Initial State**: User sees `ComposingView` with large textarea
2. **On Submit**: 
   - Textarea slides down and fades out
   - View transitions to `ConversationView`
   - User message appears with fade-in animation
   - Input bar appears at bottom
3. **During Response**:
   - Typing indicator shows while waiting
   - Response streams in character by character
   - Auto-scroll keeps new content in view

## Customization

All animations are defined in `animations/transitions.ts` and can be customized by modifying the animation configurations.