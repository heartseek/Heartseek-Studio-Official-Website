"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FaTrashAlt } from "react-icons/fa";
import styles from "./ImageCarousel.module.css";

export type ImageCarouselItem = {
  id: string | number;
  image: string;
  title?: string;
  subtitle?: string;
};

type ImageCarouselProps = {
  items: ImageCarouselItem[];
  imageWidth?: number;
  imageHeight?: number;
  showTitle?: boolean;
  showSubtitle?: boolean;
  ariaLabel?: string;
  activeId?: string | number | null;
  onSelect?: (index: number) => void;
  draggable?: boolean;
  removableByDrag?: boolean;
  removeZoneLabel?: string;
  onReorder?: (items: ImageCarouselItem[]) => void;
  onRemove?: (id: string | number) => void;
  compact?: boolean;
};

type ViewportRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type DragPositionEvent = Pick<DragMoveEvent, "active" | "delta">;

function toViewportRect(rect: {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}): ViewportRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getTranslatedDragRect(event: DragPositionEvent): ViewportRect | null {
  const initialRect = event.active.rect.current.initial;

  if (initialRect) {
    return {
      top: initialRect.top + event.delta.y,
      right: initialRect.right + event.delta.x,
      bottom: initialRect.bottom + event.delta.y,
      left: initialRect.left + event.delta.x,
      width: initialRect.width,
      height: initialRect.height,
    };
  }

  const translatedRect = event.active.rect.current.translated;
  return translatedRect ? toViewportRect(translatedRect) : null;
}

function rectsIntersect(first: ViewportRect | null, second: ViewportRect | null) {
  if (!first || !second) {
    return false;
  }

  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

export default function ImageCarousel({
  items,
  imageWidth = 280,
  imageHeight = 280,
  showTitle = true,
  showSubtitle = true,
  ariaLabel = "Image carousel",
  activeId,
  onSelect,
  draggable = false,
  removableByDrag = false,
  removeZoneLabel = "Drag here to delete",
  onReorder,
  onRemove,
  compact = false,
}: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const removeZoneRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldCenterTrack, setShouldCenterTrack] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | number | null>(null);
  const [isDragOverRemoveZone, setIsDragOverRemoveZone] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const hasItems = items.length > 0;
  const showRemoveZone = draggable && removableByDrag;
  const controlledActiveIndex =
    activeId == null ? -1 : items.findIndex((item) => item.id === activeId);
  const visualActiveIndex = controlledActiveIndex >= 0 ? controlledActiveIndex : activeIndex;

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const sortableContainers = args.droppableContainers.filter(
        (container) => container.id !== "remove-zone",
      );

      if (sortableContainers.length === 0) {
        return [];
      }

      const trackRect = trackRef.current?.getBoundingClientRect();
      const pointer = args.pointerCoordinates;

      if (trackRect && pointer) {
        const isPointerWithinTrack =
          pointer.x >= trackRect.left &&
          pointer.x <= trackRect.right &&
          pointer.y >= trackRect.top &&
          pointer.y <= trackRect.bottom;

        if (!isPointerWithinTrack) {
          return [];
        }
      }

      return closestCenter({
        ...args,
        droppableContainers: sortableContainers,
      });
    },
    [],
  );

  const isDragRectOverRemoveZone = useCallback((dragRect: ViewportRect | null) => {
    const removeZoneRect = removeZoneRef.current?.getBoundingClientRect() ?? null;

    // Compare viewport rects directly so the fixed remove zone stays accurate after scroll.
    return rectsIntersect(dragRect, removeZoneRect);
  }, []);

  const updateRemoveZoneState = useCallback((event: DragPositionEvent) => {
    const nextIsOver = isDragRectOverRemoveZone(getTranslatedDragRect(event));
    setIsDragOverRemoveZone((current) =>
      current === nextIsOver ? current : nextIsOver,
    );
    return nextIsOver;
  }, [isDragRectOverRemoveZone]);

  const updateActiveIndex = useCallback(() => {
    if (controlledActiveIndex >= 0) {
      return;
    }

    const track = trackRef.current;
    if (!track) return;

    const children = Array.from(track.children) as HTMLElement[];
    if (children.length === 0) {
      setActiveIndex(0);
      return;
    }

    const computed = window.getComputedStyle(track);
    const gapValue = parseFloat(computed.columnGap || computed.gap || "0") || 0;
    const cardWidth = children[0].getBoundingClientRect().width || 0;
    const step = cardWidth + gapValue;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);

    if (maxScroll === 0) {
      setActiveIndex(0);
      return;
    }

    if (track.scrollLeft <= step / 2) {
      setActiveIndex(0);
      return;
    }

    if (track.scrollLeft >= maxScroll - step / 2) {
      setActiveIndex(children.length - 1);
      return;
    }

    const trackBox = track.getBoundingClientRect();
    const trackCenter = trackBox.left + trackBox.width / 2;
    let nextIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    children.forEach((child, idx) => {
      const box = child.getBoundingClientRect();
      const center = box.left + box.width / 2;
      const distance = Math.abs(center - trackCenter);
      if (distance < minDistance) {
        minDistance = distance;
        nextIndex = idx;
      }
    });
    setActiveIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  }, [controlledActiveIndex]);

  const scheduleActiveUpdate = () => {
    if (scrollFrameRef.current) return;

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateActiveIndex();
    });
  };

  const scrollToIndex = (nextIndex: number) => {
    const track = trackRef.current;
    if (!track) return;

    const card = track.children[nextIndex] as HTMLElement | undefined;
    if (!card) return;

    const target = card.offsetLeft - Math.max(0, (track.clientWidth - card.offsetWidth) / 2);
    track.scrollTo({ left: target, behavior: "smooth" });
  };

  useLayoutEffect(() => {
    if (!hasItems) return;

    const nextIndex =
      activeId == null ? 0 : items.findIndex((item) => item.id === activeId);
    if (nextIndex < 0) return;

    const frame = requestAnimationFrame(() => {
      if (controlledActiveIndex < 0) {
        setActiveIndex(nextIndex);
      }
      scrollToIndex(nextIndex);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeId, controlledActiveIndex, hasItems, items]);

  const selectAdjacentItem = (direction: -1 | 1) => {
    if (!hasItems) {
      return;
    }

    const currentIndex = visualActiveIndex >= 0 ? visualActiveIndex : 0;
    const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + direction));

    if (nextIndex === currentIndex) {
      return;
    }

    if (onSelect) {
      onSelect(nextIndex);
    } else {
      setActiveIndex(nextIndex);
    }

    scrollToIndex(nextIndex);
  };

  useLayoutEffect(() => {
    const updateCentering = () => {
      const track = trackRef.current;
      if (!track) return;

      setShouldCenterTrack(track.scrollWidth <= track.clientWidth);
      updateActiveIndex();
    };

    updateCentering();
    window.addEventListener("resize", updateCentering);

    return () => {
      window.removeEventListener("resize", updateCentering);
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [imageHeight, imageWidth, items.length, showSubtitle, showTitle, updateActiveIndex]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || activeDragId === null) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlTouchAction = documentElement.style.touchAction;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.touchAction = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.touchAction = previousHtmlTouchAction;
    };
  }, [activeDragId]);

  const activeDragItem =
    activeDragId == null ? null : items.find((item) => item.id === activeDragId) ?? null;

  if (!hasItems) return null;

  const handleCardSelect = (index: number) => {
    if (controlledActiveIndex < 0) {
      setActiveIndex(index);
    }
    scrollToIndex(index);
    onSelect?.(index);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id);
    setIsDragOverRemoveZone(false);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (!showRemoveZone) {
      return;
    }

    updateRemoveZoneState(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const shouldRemove = showRemoveZone && updateRemoveZoneState(event);

    setActiveDragId(null);
    setIsDragOverRemoveZone(false);

    if (shouldRemove) {
      onRemove?.(active.id);
      return;
    }

    if (!over) {
      return;
    }

    if (active.id === over.id || !onReorder) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      autoScroll={false}
      collisionDetection={collisionDetection}
      onDragCancel={() => {
        setActiveDragId(null);
        setIsDragOverRemoveZone(false);
      }}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
      sensors={draggable ? sensors : undefined}
    >
      <section
        className={`${styles.carousel} ${compact ? styles.carouselCompact : ""}`}
        aria-label={ariaLabel}
      >
        <div className={`${styles.row} ${compact ? styles.rowCompact : ""}`}>
          {compact ? null : (
            <button
              aria-label="Previous items"
              className={`${styles.navButton} ${styles.navButtonLeft}`}
              onClick={() => selectAdjacentItem(-1)}
              type="button"
            >
              {"‹"}
            </button>
          )}

          <SortableContext
            disabled={!draggable}
            items={items.map((item) => item.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className={`${styles.track} ${compact ? styles.trackCompact : ""} ${
                shouldCenterTrack ? styles.trackCentered : ""
              }`}
              onScroll={scheduleActiveUpdate}
              ref={trackRef}
            >
              {items.map((item, index) => (
                <SortableCarouselCard
                  active={index === visualActiveIndex}
                  draggable={draggable}
                  id={item.id}
                  imageHeight={imageHeight}
                  imageWidth={imageWidth}
                  item={item}
                  key={item.id}
                  onSelect={() => handleCardSelect(index)}
                  showSubtitle={showSubtitle}
                  showTitle={showTitle}
                />
              ))}
            </div>
          </SortableContext>

          {compact ? null : (
            <button
              aria-label="Next items"
              className={`${styles.navButton} ${styles.navButtonRight}`}
              onClick={() => selectAdjacentItem(1)}
              type="button"
            >
              {"›"}
            </button>
          )}
        </div>

        {showRemoveZone ? (
          <RemoveZone
            active={activeDragId !== null}
            isOver={isDragOverRemoveZone}
            label={removeZoneLabel}
            zoneRef={removeZoneRef}
          />
        ) : null}
      </section>

      {typeof document !== "undefined"
        ? createPortal(
            <DragOverlay
              dropAnimation={null}
              zIndex={9999}
            >
              {activeDragItem ? (
                <CarouselCardOverlay
                  imageHeight={imageHeight}
                  imageWidth={imageWidth}
                  item={activeDragItem}
                  showSubtitle={showSubtitle}
                  showTitle={showTitle}
                />
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

type SortableCarouselCardProps = {
  id: string | number;
  item: ImageCarouselItem;
  imageWidth: number;
  imageHeight: number;
  showTitle: boolean;
  showSubtitle: boolean;
  active: boolean;
  draggable: boolean;
  onSelect: () => void;
};

function SortableCarouselCard({
  id,
  item,
  imageWidth,
  imageHeight,
  showTitle,
  showSubtitle,
  active,
  draggable,
  onSelect,
}: SortableCarouselCardProps) {
  const suppressClickUntilRef = useRef(0);
  const wasDraggingRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled: !draggable,
    });

  useEffect(() => {
    if (wasDraggingRef.current && !isDragging) {
      // Suppress only the synthetic click that can fire right after a drag ends.
      suppressClickUntilRef.current = performance.now() + 180;
    }

    wasDraggingRef.current = isDragging;
  }, [isDragging]);

  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`${styles.card} ${active ? styles.cardActive : ""} ${
        isDragging ? styles.cardDragging : ""
      }`}
      onClick={() => {
        if (performance.now() < suppressClickUntilRef.current) {
          return;
        }

        onSelect();
      }}
      ref={setNodeRef}
      style={
        {
          "--card-image-width": `${imageWidth}px`,
          "--card-image-height": `${imageHeight}px`,
          transform: CSS.Transform.toString(transform),
          transition: isDragging ? "none" : transition,
        } as React.CSSProperties
      }
      type="button"
      {...attributes}
      {...listeners}
    >
      <div className={`${styles.imageWrap} ${active ? styles.imageWrapActive : ""}`}>
        <Image
          alt={item.title || item.subtitle || "carousel image"}
          className={styles.image}
          draggable={false}
          fill
          sizes={`(max-width: 640px) min(78vw, ${imageWidth}px), ${imageWidth}px`}
          src={item.image}
        />
      </div>

      {showTitle && item.title ? <div className={styles.title}>{item.title}</div> : null}

      {showSubtitle && item.subtitle ? (
        <div className={styles.subtitle}>{item.subtitle}</div>
      ) : null}
    </button>
  );
}

function RemoveZone({
  active,
  isOver,
  label,
  zoneRef,
}: {
  active: boolean;
  isOver: boolean;
  label: string;
  zoneRef: RefObject<HTMLDivElement | null>;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`${styles.removeZone} ${active ? styles.removeZoneVisible : ""} ${
        isOver ? styles.removeZoneOver : ""
      }`}
      ref={zoneRef}
    >
      <div className={styles.removeZoneInner}>
        <FaTrashAlt aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>,
    document.body,
  );
}

function CarouselCardOverlay({
  item,
  imageWidth,
  imageHeight,
  showTitle,
  showSubtitle,
}: {
  item: ImageCarouselItem;
  imageWidth: number;
  imageHeight: number;
  showTitle: boolean;
  showSubtitle: boolean;
}) {
  return (
    <div
      className={styles.cardOverlay}
      style={
        {
          "--card-image-width": `${imageWidth}px`,
          "--card-image-height": `${imageHeight}px`,
        } as React.CSSProperties
      }
    >
      <div className={styles.imageWrap}>
        <Image
          alt={item.title || item.subtitle || "carousel image"}
          className={styles.image}
          draggable={false}
          fill
          sizes={`(max-width: 640px) min(78vw, ${imageWidth}px), ${imageWidth}px`}
          src={item.image}
        />
      </div>

      {showTitle && item.title ? <div className={styles.title}>{item.title}</div> : null}

      {showSubtitle && item.subtitle ? (
        <div className={styles.subtitle}>{item.subtitle}</div>
      ) : null}
    </div>
  );
}
