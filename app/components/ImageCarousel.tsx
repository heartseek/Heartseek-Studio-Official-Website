"use client";

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
  activeId?: string | number | null;
  onSelect?: (index: number) => void;
};

export default function ImageCarousel({
  items,
  imageWidth = 280,
  imageHeight = 280,
  showTitle = true,
  showSubtitle = true,
  ariaLabel = "Image carousel",
  activeId,
  onSelect,
}: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldCenterTrack, setShouldCenterTrack] = useState(false);

  const hasItems = items.length > 0;

  const updateActiveIndex = () => {
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
  };

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
      setActiveIndex(nextIndex);
      scrollToIndex(nextIndex);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeId, hasItems, items]);

  const scrollTrackByCard = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;

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
  }, [items.length, imageHeight, imageWidth, showSubtitle, showTitle]);

  if (!hasItems) return null;

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

        <div
          className={`${styles.track} ${shouldCenterTrack ? styles.trackCentered : ""}`}
          onScroll={scheduleActiveUpdate}
          ref={trackRef}
        >
          {items.map((item, index) => (
            <button
              aria-current={index === activeIndex ? "true" : undefined}
              className={`${styles.card} ${index === activeIndex ? styles.cardActive : ""}`}
              key={item.id}
              onClick={() => {
                setActiveIndex(index);
                scrollToIndex(index);
                onSelect?.(index);
              }}
              style={
                {
                  "--card-image-width": `${imageWidth}px`,
                  "--card-image-height": `${imageHeight}px`,
                } as React.CSSProperties
              }
              type="button"
            >
              <div
                className={`${styles.imageWrap} ${
                  index === activeIndex ? styles.imageWrapActive : ""
                }`}
              >
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
          ))}
        </div>

        <button
          aria-label="Next items"
          className={`${styles.navButton} ${styles.navButtonRight}`}
          onClick={() => scrollTrackByCard(1)}
          type="button"
        >
          {"›"}
        </button>
      </div>
    </section>
  );
}
