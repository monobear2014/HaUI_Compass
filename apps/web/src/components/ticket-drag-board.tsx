"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import styles from "./ticket-workspace.module.css";

type Ticket = { id: string; title: string };
type Column = { id: string; label: string; tickets: Ticket[] };
type Destination = {
  column: string;
  before: string | null;
  anchor: string | null;
  edge: "before" | "after";
};
type Props = {
  columns: Column[];
  disabled: boolean;
  list: boolean;
  vi: boolean;
  renderTicket: (id: string, handle?: ReactNode) => ReactNode;
  onMove: (id: string, column: string, before: string | null) => void;
};

// Prefer the card under the pointer over its surrounding column. Outside the
// board is deliberately not a valid pointer destination; Escape also cancels.
const collision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args);
  const hits = pointerWithin(args);
  const card = hits.find((hit) => !String(hit.id).startsWith("column:"));
  if (card) return [card];
  const column = hits.find((hit) => String(hit.id).startsWith("column:"));
  if (!column) return [];
  const columnId = String(column.id).slice("column:".length);
  const cards = args.droppableContainers.filter(
    (container) =>
      !String(container.id).startsWith("column:") &&
      container.data.current?.column === columnId,
  );
  // Gaps between cards should insert between those cards, rather than append.
  return cards.length
    ? closestCenter({ ...args, droppableContainers: cards })
    : [column];
};

function ColumnZone({
  column,
  children,
  active,
}: {
  column: Column;
  children: ReactNode;
  active: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    data: { column: column.id },
  });
  return (
    <section
      ref={setNodeRef}
      className={styles.column}
      aria-label={column.label}
      data-drop-active={active}
    >
      <h3>
        <span className={styles.dot} data-status={column.id} />
        {column.label}
        <span>{column.tickets.length}</span>
      </h3>
      {children}
    </section>
  );
}

function SortableTicket({
  ticket,
  column,
  disabled,
  vi,
  render,
  marker,
  orderKey,
  animate,
}: {
  ticket: Ticket;
  column: string;
  disabled: boolean;
  vi: boolean;
  render: Props["renderTicket"];
  marker?: "before" | "after";
  orderKey: string;
  animate: boolean;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: { column },
    disabled,
    transition: { duration: 180, easing: "cubic-bezier(0.2,0,0,1)" },
  });
  const node = useRef<HTMLDivElement | null>(null);
  const layout = useRef<{ top: number; left: number; order: string } | null>(
    null,
  );
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const next = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      order: orderKey,
    };
    const previous = layout.current;
    layout.current = next;
    if (
      !previous ||
      previous.order === orderKey ||
      !animate ||
      isDragging ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const x = previous.left - next.left,
      y = previous.top - next.top;
    if (Math.abs(x) + Math.abs(y) > 1)
      element.animate(
        [
          { transform: `translate(${x}px, ${y}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2,0,0,1)" },
      );
  });
  return (
    <div
      ref={setRef}
      {...listeners}
      data-ticket-id={ticket.id}
      data-dragging={isDragging}
      data-drop-edge={marker}
      className={styles.sortableTicket}
      style={{ transition }}
    >
      {render(
        ticket.id,
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          className={styles.dragHandle}
          disabled={disabled}
          aria-label={`${vi ? "Kéo ticket" : "Drag ticket"} ${ticket.title}`}
          title={
            vi
              ? "Kéo để sắp xếp · Space để kéo bằng bàn phím"
              : "Drag to reorder · Space for keyboard dragging"
          }
        >
          ⠿
        </button>,
      )}
    </div>
  );
}

export function TicketDragBoard({
  columns,
  disabled,
  list,
  vi,
  renderTicket,
  onMove,
}: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const latest = useRef<Destination | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const detectCollision = useCallback<CollisionDetection>((args) => {
    pointer.current = args.pointerCoordinates;
    return collision(args);
  }, []);
  const [lastActive, setLastActive] = useState<string | null>(null);
  const orderKey = columns
    .map((c) => c.id + ":" + c.tickets.map((t) => t.id).join(","))
    .join("|");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );
  function locate(event: DragMoveEvent | DragEndEvent): Destination | null {
    if (!event.over) return null;
    const overId = String(event.over.id);
    const column = columns.find(
      (c) =>
        c.id === overId.replace(/^column:/, "") ||
        c.tickets.some((t) => t.id === overId),
    );
    if (!column) return null;
    const remaining = column.tickets.filter(
      (t) => t.id !== String(event.active.id),
    );
    if (overId.startsWith("column:")) {
      // Header means first position; blank space at the bottom means last.
      const y = pointerY(event);
      const first = y < event.over.rect.top + 54;
      return {
        column: column.id,
        before: first ? (remaining[0]?.id ?? null) : null,
        anchor: first
          ? (remaining[0]?.id ?? null)
          : (remaining.at(-1)?.id ?? null),
        edge: first ? "before" : "after",
      };
    }
    if (overId === String(event.active.id)) return null;
    const keyboard = "key" in event.activatorEvent;
    const sourceIndex = column.tickets.findIndex(
      (t) => t.id === String(event.active.id),
    );
    const targetIndex = column.tickets.findIndex((t) => t.id === overId);
    const after = keyboard
      ? sourceIndex >= 0 && targetIndex > sourceIndex
      : pointerY(event) > event.over.rect.top + event.over.rect.height / 2;
    const index = remaining.findIndex((t) => t.id === overId);
    return {
      column: column.id,
      before: after ? (remaining[index + 1]?.id ?? null) : overId,
      anchor: overId,
      edge: after ? "after" : "before",
    };
  }
  function pointerY(event: DragMoveEvent | DragEndEvent) {
    const activator = event.activatorEvent;
    // dnd-kit's event.delta includes scroll compensation. Its collision pointer
    // is already in viewport coordinates and remains accurate during auto-scroll.
    if (!("key" in activator) && pointer.current) return pointer.current.y;
    if ("clientY" in activator)
      return Number(activator.clientY) + event.delta.y;
    if ("touches" in activator) {
      const touch = (activator as TouchEvent).touches[0];
      if (touch) return touch.clientY + event.delta.y;
    }
    const rect = event.active.rect.current.translated;
    return rect ? rect.top + rect.height / 2 : 0;
  }
  function track(event: DragMoveEvent) {
    const next = locate(event);
    if (
      next?.column !== latest.current?.column ||
      next?.anchor !== latest.current?.anchor ||
      next?.edge !== latest.current?.edge ||
      next?.before !== latest.current?.before
    ) {
      latest.current = next;
      setDestination(next);
    }
  }
  function clear() {
    latest.current = null;
    setActive(null);
    setDestination(null);
  }
  const activeTitle =
    columns.flatMap((c) => c.tickets).find((t) => t.id === active)?.title || "";
  return (
    <DndContext
      id="study-ticket-board"
      sensors={sensors}
      autoScroll={{ threshold: { x: 0.08, y: 0.08 }, acceleration: 5 }}
      collisionDetection={detectCollision}
      accessibility={{
        screenReaderInstructions: {
          draggable: vi
            ? "Nhấn Space để nhấc ticket, dùng phím mũi tên để chọn vị trí, Space để thả, Escape để huỷ."
            : "Press Space to pick up, arrow keys to choose a position, Space to drop, Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `${vi ? "Đang kéo" : "Picked up"} ${columns.flatMap((c) => c.tickets).find((t) => t.id === active.id)?.title || "ticket"}`,
          onDragOver: () =>
            latest.current
              ? `${columns.find((c) => c.id === latest.current?.column)?.label}. ${latest.current.edge === "before" ? (vi ? "Phía trên" : "Before") : vi ? "Phía dưới" : "After"}`
              : undefined,
          onDragEnd: () =>
            vi ? "Đã kết thúc kéo ticket." : "Ticket drag ended.",
          onDragCancel: () =>
            vi ? "Đã huỷ kéo ticket." : "Ticket drag cancelled.",
        },
      }}
      onDragStart={({ active }) => {
        setLastActive(String(active.id));
        setActive(String(active.id));
        latest.current = null;
        setDestination(null);
      }}
      onDragMove={track}
      onDragOver={track}
      onDragCancel={clear}
      onDragEnd={(event) => {
        const next =
          "key" in event.activatorEvent ? latest.current : locate(event);
        clear();
        if (next) onMove(String(event.active.id), next.column, next.before);
      }}
    >
      <div
        className={list ? styles.list : styles.board}
        data-drag-active={active !== null}
      >
        {columns.map((column) => (
          <ColumnZone
            key={column.id}
            column={column}
            active={destination?.column === column.id}
          >
            <SortableContext
              items={column.tickets.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {column.tickets.map((ticket) => (
                <SortableTicket
                  key={ticket.id}
                  ticket={ticket}
                  column={column.id}
                  disabled={disabled}
                  vi={vi}
                  render={renderTicket}
                  orderKey={orderKey}
                  animate={lastActive !== null && ticket.id !== lastActive}
                  marker={
                    destination?.anchor === ticket.id
                      ? destination.edge
                      : undefined
                  }
                />
              ))}
            </SortableContext>
            {column.tickets.length === 0 && (
              <p
                className={styles.empty}
                data-drop-empty={destination?.column === column.id}
              >
                {vi ? "Thả ticket vào đây" : "Drop a ticket here"}
              </p>
            )}
          </ColumnZone>
        ))}
      </div>
      <DragOverlay
        style={{ pointerEvents: "none" }}
        dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}
      >
        {active ? (
          <div
            className={styles.dragOverlay}
            aria-label={activeTitle}
            aria-hidden="true"
          >
            {renderTicket(active)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
