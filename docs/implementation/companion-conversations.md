# Saved Compass conversations

The right-hand Compass sidebar provides **New conversation** and a compact **History** panel. Sending the first message also creates a conversation if none is selected. Titles come from the first saved question (up to 80 characters); empty conversations use a localized placeholder. Selecting a conversation restores its transcript and support/course settings. Reload restores the selected conversation using an account-scoped ID; message bodies are stored on the server, not in localStorage.

## Persistence and isolation

- Alembic `0009_companion_conversations` creates account-owned conversation metadata and adds a conversation reference to exchanges. The composite foreign key includes the owner, preventing cross-account attachment.
- Existing history is assigned to a legacy conversation without altering its saved response/citations. The new column permits NULL temporarily so old workers can keep writing during rollout. New workers adopt those legacy writes into the same account-owned legacy conversation.
- New-message requests carry `conversation_id`. Request-ID retries must match the same conversation, question, mode and course. Creation retries reuse their UUID.
- Agent recent context includes only the latest four exchanges in the selected conversation. Explicitly confirmed long-term memory remains account-owned and shared across conversations.
- The UI initially loads 30 exchanges, with stable UUID-anchor pagination for older messages. Older records remain stored. Conversation lists are paginated in groups of 50.
- Clearing companion history deletes conversation metadata and exchanges for the authenticated account, while confirmed memories remain. A new send to a removed conversation is rejected rather than resurrecting it.

## API

| Route | Behavior |
| --- | --- |
| GET `/companion/conversations?offset=0` | Owned conversation summaries and next offset |
| POST `/companion/conversations` | Idempotent creation with a client UUID |
| GET `/companion/conversations/{id}?before={message-id}` | Owned transcript page and next anchor |
| POST `/companion/messages` | Existing message API with optional conversation ID for older clients |

The existing companion history API remains compatible with older clients. Choosing a public courseware link applies its explicit course before interaction, so restoring a saved conversation cannot override the user's requested course.
