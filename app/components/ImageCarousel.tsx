"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
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
  onReorder?: (items: ImageCarouselItem[]) => void;
};

export default function ImageCarousel({
  items,
  imageWidth = 280,
  imageHeight = 280,
  showTitle = true,
  showSubtitle = true,
  ariaLabel = "Image carousel",
  onReorder,
}: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldCenterTrack, setShouldCenterTrack] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const hasItems = items.length > 0;

  const updateActiveIndex = () => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

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
  };

  const scheduleActiveUpdate = () => {
    if (scrollFrameRef.current) {
      return;
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateActiveIndex();
    });
  };

  const scrollToIndex = (nextIndex: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const card = track.children[nextIndex] as HTMLElement | undefined;
    if (!card) {
      return;
    }

    const target =
      card.offsetLeft - Math.max(0, (track.clientWidth - card.offsetWidth) / 2);
    track.scrollTo({ left: target, behavior: "smooth" });
  };

  const scrollTrackByCard = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const firstCard = track.querySelector(`.${styles.card}`) as HTMLElement | null;
    const computed = window.getComputedStyle(track);
    const gapValue = parseFloat(computed.columnGap || computed.gap || "0") || 0;
    const step =
      (firstCard?.getBoundingClientRect().width ?? track.clientWidth * 0.8) + gapValue;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  useLayoutEffect(() => {
    const updateCentering = () => {
      const track = trackRef.current;
      if (!track) {
        return;
      }

      setShouldCenterTrack(track.scrollWidth <= track.clientWidth);
      updateActiveIndex();
    };

    updateCentering();
    window.addEventListener("resize", updateCentering);

    return () => {
      window.removeEventListener("resize", updateCentering);
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [items.length, imageHeight, imageWidth, showSubtitle, showTitle]);

  if (!hasItems) {
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorder) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <section className={styles.carousel} aria-label={ariaLabel}>
      <div className={styles.row}>
        <button
          aria-label="Previous items"
          className={`${styles.navButton} ${styles.navButtonLeft}`}
          onClick={() => scrollTrackByCard(-1)}
          type="button"
        >
          {"‹"}
        </button>

        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div
              className={`${styles.track} ${shouldCenterTrack ? styles.trackCentered : ""}`}
              onScroll={scheduleActiveUpdate}
              ref={trackRef}
            >
              {items.map((item) => (
                <SortableCarouselItem
                  imageHeight={imageHeight}
                  imageWidth={imageWidth}
                  item={item}
                  key={item.id}
                  showSubtitle={showSubtitle}
                  showTitle={showTitle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          aria-label="Next items"
          className={`${styles.navButton} ${styles.navButtonRight}`}
          onClick={() => scrollTrackByCard(1)}
          type="button"
        >
          {"›"}
        </button>
      </div>

      <nav className={styles.dots} aria-label="Carousel navigation">
        {items.map((item, idx) => (
          <button
            aria-current={idx === activeIndex ? "true" : undefined}
            aria-label={`Go to item ${idx + 1}`}
            className={`${styles.dot} ${idx === activeIndex ? styles.dotActive : ""}`}
            key={item.id}
            onClick={() => scrollToIndex(idx)}
            type="button"
          />
        ))}
      </nav>
    </section>
  );
}

type SortableCarouselItemProps = {
  item: ImageCarouselItem;
  imageWidth: number;
  imageHeight: number;
  showTitle: boolean;
  showSubtitle: boolean;
};

function SortableCarouselItem({
  item,
  imageWidth,
  imageHeight,
  showTitle,
  showSubtitle,
}: SortableCarouselItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
    });

  return (
    <article
      className={`${styles.card} ${isDragging ? styles.cardDragging : ""}`}
      ref={setNodeRef}
      style={
        {
          "--card-image-width": `${imageWidth}px`,
          "--card-image-height": `${imageHeight}px`,
          transform: CSS.Transform.toString(transform),
          transition,
        } as React.CSSProperties
      }
      {...attributes}
      {...listeners}
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
    </article>
  );
}
