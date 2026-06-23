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
};

const CLICK_CANCEL_THRESHOLD = 8;

export default function ImageCarousel({
  items,
  imageWidth = 280,
  imageHeight = 280,
  showTitle = true,
  showSubtitle = true,
  ariaLabel = "Image carousel",
}: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const allowVerticalRef = useRef(false);
  const velocityRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const flingFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldCenterTrack, setShouldCenterTrack] = useState(false);

  const hasItems = items.length > 0;

  const startFling = (track: HTMLDivElement) => {
    if (flingFrameRef.current) {
      cancelAnimationFrame(flingFrameRef.current);
    }

    const step = () => {
      const velocity = velocityRef.current;
      if (Math.abs(velocity) < 0.05) {
        flingFrameRef.current = null;
        return;
      }

      track.scrollLeft -= velocity;
      velocityRef.current *= 0.92;
      flingFrameRef.current = requestAnimationFrame(step);
    };

    flingFrameRef.current = requestAnimationFrame(step);
  };

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
      if (flingFrameRef.current) {
        cancelAnimationFrame(flingFrameRef.current);
      }
      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [items.length, imageHeight, imageWidth, showSubtitle, showTitle]);

  if (!hasItems) {
    return null;
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

        <div
          className={`${styles.track} ${shouldCenterTrack ? styles.trackCentered : ""}`}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") {
              return;
            }

            if (
              event.target instanceof Element &&
              event.target.closest("button, a, input, textarea, select")
            ) {
              return;
            }

            const track = trackRef.current;
            if (!track) {
              return;
            }

            isDraggingRef.current = true;
            suppressClickRef.current = false;
            startXRef.current = event.clientX;
            startYRef.current = event.clientY;
            startScrollRef.current = track.scrollLeft;
            pointerIdRef.current = event.pointerId;
            track.setPointerCapture(event.pointerId);
            allowVerticalRef.current = false;
            lastMoveXRef.current = event.clientX;
            lastMoveTimeRef.current = performance.now();
            velocityRef.current = 0;

            if (flingFrameRef.current) {
              cancelAnimationFrame(flingFrameRef.current);
              flingFrameRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (!isDraggingRef.current) {
              return;
            }

            isDraggingRef.current = false;
            const track = trackRef.current;
            if (track) {
              if (pointerIdRef.current !== null) {
                track.releasePointerCapture(pointerIdRef.current);
              }
              startFling(track);
            }

            pointerIdRef.current = null;
            allowVerticalRef.current = false;
            suppressClickRef.current = false;
          }}
          onPointerMove={(event) => {
            if (!isDraggingRef.current) {
              return;
            }

            const track = trackRef.current;
            if (!track) {
              return;
            }

            const deltaX = event.clientX - startXRef.current;
            const deltaY = event.clientY - startYRef.current;

            if (Math.abs(deltaX) >= CLICK_CANCEL_THRESHOLD) {
              suppressClickRef.current = true;
            }

            const now = performance.now();
            const dx = event.clientX - lastMoveXRef.current;
            const dt = Math.max(1, now - lastMoveTimeRef.current);
            lastMoveXRef.current = event.clientX;
            lastMoveTimeRef.current = now;
            velocityRef.current = (dx / dt) * 0.7 + velocityRef.current * 0.3;

            if (
              !allowVerticalRef.current &&
              Math.abs(deltaY) > Math.abs(deltaX) &&
              Math.abs(deltaY) > 10
            ) {
              allowVerticalRef.current = true;
              isDraggingRef.current = false;
              if (pointerIdRef.current !== null) {
                track.releasePointerCapture(pointerIdRef.current);
                pointerIdRef.current = null;
              }
              return;
            }

            if (allowVerticalRef.current) {
              return;
            }

            event.preventDefault();
            track.scrollLeft = startScrollRef.current - deltaX;
          }}
          onPointerUp={() => {
            isDraggingRef.current = false;
            const track = trackRef.current;
            if (track) {
              if (pointerIdRef.current !== null) {
                track.releasePointerCapture(pointerIdRef.current);
              }
              startFling(track);
            }

            pointerIdRef.current = null;
            allowVerticalRef.current = false;
            suppressClickRef.current = false;
          }}
          onScroll={scheduleActiveUpdate}
          ref={trackRef}
        >
          {items.map((item) => (
            <article
              className={styles.card}
              key={item.id}
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

              {showTitle && item.title ? (
                <div className={styles.title}>{item.title}</div>
              ) : null}

              {showSubtitle && item.subtitle ? (
                <div className={styles.subtitle}>{item.subtitle}</div>
              ) : null}
            </article>
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
