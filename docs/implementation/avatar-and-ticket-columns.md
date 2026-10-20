# Avatar and reversible ticket columns

- Avatar is account-owned and available only through an authenticated same-origin endpoint. JPEG, PNG, WebP, GIF and AVIF input up to 5 MiB is decoded, pixel-limited, rotated, cropped to 384px and re-encoded to WebP; metadata and animation are discarded. Invalid raster data and SVG are rejected. SQLite and PostgreSQL store the normalized image; web migration 006 adds account_avatars.
- Settings uploads and resets the avatar; the bottom-left account menu refreshes immediately.
- Ticket columns are To do, In progress, In review and Done. Drag/drop and an accessible select support movement in either direction, including reopening Done. Explicit per-ticket column metadata overrides derived execution status, without deleting historical execution facts or submitting assignments. Complete/Pause remain the controls for logging actual study time.
- Board metadata retains the existing account/student/generation/day scope and optimistic version lock. Column identifiers are validated against the authenticated workspace. Existing boards without columns retain compatible defaults.
- Clicking a ticket opens editable title and description/notes with Save and Cancel. These are personal task annotations; the LMS assignment remains unchanged. Edits use a separate account/student/generation scope without the date, so a new learning day does not erase content. The endpoint checks workspace scope, ownership, title/description limits and optimistic version conflicts before saving.

## Compact cards

Cards now show a two-line task title, course, ticket key, deadline and a small focus/today indicator. Assignment details, estimates, actual minutes, column selection and execution/daily-list controls are rendered only inside the ticket dialog. Native drag/drop remains available from the card. A title button provides keyboard access; clicking the card surface also opens details.

## Positioned drag and drop

The weekly board uses dnd-kit sensors, sortable lists and a drag overlay in place of HTML native drag. Mouse movement has a six-pixel activation threshold; touch uses a short hold; keyboard handles support Space/arrows/Escape. A purple insertion marker distinguishes before/after a target card, and empty columns remain droppable. Cards can be picked up from the card surface or the handle.

The backend validates a separate `ticket_order` list (unique workspace-owned UUIDs, maximum 100). This is independent of the ordered Today selection. Existing rows without order remain compatible. Reordering preserves hidden/filter-excluded tickets, execution facts, approved plans and session focus for moves within the same column. State is updated optimistically on release and rolled back on a failed save, using the existing version lock. Escape or dropping outside the board saves nothing.

Implementation reference: [dnd-kit sortable documentation](https://dndkit.com/legacy/presets/sortable/overview/) and [DragOverlay](https://dndkit.com/legacy/api-documentation/draggable/drag-overlay/).

During pointer dragging, card slots stay stationary so the insertion marker cannot change as neighbouring cards shift underneath the pointer. The overlay follows the pointer, and a short FLIP animation moves neighbouring cards after release; reduced-motion settings disable that animation. The overlay cannot intercept clicks during the drop animation, so consecutive drags remain available.

Restoring a saved board on initial load does not animate the initial reordering: controls become usable at their final saved positions. This avoids picking up a neighbouring ticket while the restore animation is in flight. FLIP animations start only after the user has initiated a drag.
