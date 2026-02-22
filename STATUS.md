# STATUS

## Slice Registry

- Slice ID: S1-CHAT-PERSISTENCE
- Slice Name: Persistent Chat History
- Included FR IDs: FR-010, FR-011, FR-012, FR-013
- Relevant NFR IDs: NFR-P6, NFR-R4, NFR-S4
- Status: Done
- Owner: Shivaganesh Nagamandla
- Demo/Test Condition:
  - User sends a message and both user + assistant messages are persisted.
  - User sees conversation history list ordered by most recent.
  - User opens a prior conversation and all messages load with role labels.

## Foundation Task Registry

- Task ID: F1-CONVERSATION-SCHEMA
- Description: Conversation data model + indexes for user ownership and recency sorting.
- Type: Foundation (slice-neutral)
- Status: Done
- Owner: Shivaganesh Nagamandla

- Task ID: F2-MESSAGE-SCHEMA
- Description: Message data model + indexes for ordered retrieval by conversation.
- Type: Foundation (slice-neutral)
- Status: Done
- Owner: Shivaganesh Nagamandla

- Task ID: F3-CONVERSATION-READ-APIS
- Description: Authenticated endpoints to list conversations and fetch conversation messages.
- Type: Foundation (slice-neutral)
- Status: Done
- Owner: Shivaganesh Nagamandla

## Decisions

- Selected Strategy: B (service-layer separation for conversation persistence/retrieval)
- Selected Pattern: 1 (Mongoose models + thin route handlers)

## Strategy Evaluation (Step 3.3, 3.3.1)

- Strategy A: Route-centric implementation (add persistence/retrieval logic directly in route handlers)
  - Pros: Fastest initial coding, minimal upfront structure.
  - Cons: Blends transport, auth, and data logic; harder to test and maintain as endpoints grow.
  - Outcome: Rejected due to maintainability and testability risk.

- Strategy B: Service-layer separation for conversation/message persistence and retrieval
  - Pros: Clear boundaries between route validation/auth and data operations; easier unit/integration testing; cleaner fit with backend/data architecture.
  - Cons: Slightly more setup compared to route-centric coding.
  - Outcome: Selected.

- Strategy C: Event-log-first approach (store all events and derive conversation views)
  - Pros: Strong audit trail and future analytics flexibility.
  - Cons: Adds unnecessary complexity for current MVP scope and slower delivery.
  - Outcome: Rejected for current slice; possible future evolution.

- Chosen Implementation Pattern: Mongoose models + thin route handlers
  - Why: Fits current codebase conventions, keeps logic unified, and supports DB-focused ownership with lower artificial complexity.

## Prompt Chain (Step 3.4)

1. Define `Conversation` model and indexes for ownership and recency.
2. Define `Message` model and indexes for ordered retrieval by conversation.
3. Add authenticated read endpoints for conversation list and conversation messages.
4. Extend chat flow to persist both user and assistant messages.
5. Add validation/error handling for empty inputs and invalid conversation IDs.
6. Run focused tests for auth scope, ordering, and role labeling.

## QA Checklist (Step 3.6 Prep)

- Empty prompt is rejected with a clear client-safe error.
- Invalid conversation ID is rejected safely.
- Unauthorized user cannot access another user's conversations/messages.
- Conversation list is sorted by recency (newest first).
- Opening a conversation returns messages in correct chronological order.
- Message roles are preserved and returned as `user` / `assistant`.

## Validation Notes

- Trainee flow verified in UI:
  - Sending messages persists user + assistant entries.
  - Conversation history appears and orders by recency.
  - Reopening a prior conversation loads full messages with role labels.
