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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FaTrashAlt } from "react-icons/fa";
import { HexAlphaColorPicker } from "react-colorful";
import styles from "./SpriteEditor.module.css";

type MergeFrame = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
};

type DirectoryInputProps = {
  directory?: string;
  webkitdirectory?: string;
};

type DroppedEntry = {
  isDirectory: boolean;
  isFile: boolean;
};

type DroppedFileEntry = DroppedEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};

type DroppedDirectoryEntry = DroppedEntry & {
  createReader: () => DroppedDirectoryReader;
};

type DroppedDirectoryReader = {
  readEntries: (
    successCallback: (entries: DroppedEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};

const DEFAULT_COLUMNS = 4;
const DEFAULT_PADDING = 0;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 20;
const MIN_PADDING = 0;
const MAX_PADDING = 200;
const PREVIEW_MAX_WIDTH = 760;
const PREVIEW_MAX_HEIGHT = 420;
const TRANSPARENT_PREVIEW_BACKGROUND = "transparent";
const DEFAULT_PREVIEW_BACKGROUND = "#ebe3d6";
const PREVIEW_BACKGROUND_PRESETS = [
  TRANSPARENT_PREVIEW_BACKGROUND,
  DEFAULT_PREVIEW_BACKGROUND,
  "#ffffff",
  "#000000",
] as const;

export default function SpriteEditor() {
  const t = useTranslations("spriteEditor");
  const framesRef = useRef<MergeFrame[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragDepthRef = useRef(0);
  const [frames, setFrames] = useState<MergeFrame[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [columnsInput, setColumnsInput] = useState(String(DEFAULT_COLUMNS));
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [isDragging, setIsDragging] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">(
    "png",
  );
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewBackgroundColor, setPreviewBackgroundColor] = useState<string>(
    TRANSPARENT_PREVIEW_BACKGROUND,
  );
  const [previewPickerColor, setPreviewPickerColor] = useState(
    `${DEFAULT_PREVIEW_BACKGROUND}ff`,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    return () => {
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    };
  }, []);

  const mergedMetrics = useMemo(() => {
    if (frames.length === 0) {
      return {
        maxWidth: 0,
        maxHeight: 0,
        rows: 0,
        canvasWidth: 0,
        canvasHeight: 0,
      };
    }

    const maxWidth = Math.max(...frames.map((frame) => frame.width));
    const maxHeight = Math.max(...frames.map((frame) => frame.height));
    const rows = Math.ceil(frames.length / columns);
    const canvasWidth = columns * maxWidth + Math.max(columns - 1, 0) * padding;
    const canvasHeight = rows * maxHeight + Math.max(rows - 1, 0) * padding;

    return {
      maxWidth,
      maxHeight,
      rows,
      canvasWidth,
      canvasHeight,
    };
  }, [columns, frames, padding]);

  const previewScale = useMemo(() => {
    if (frames.length === 0) {
      return 1;
    }

    const widthScale =
      mergedMetrics.canvasWidth > 0
        ? PREVIEW_MAX_WIDTH / mergedMetrics.canvasWidth
        : 1;
    const heightScale =
      mergedMetrics.canvasHeight > 0
        ? PREVIEW_MAX_HEIGHT / mergedMetrics.canvasHeight
        : 1;

    return Math.min(1, widthScale, heightScale) * (previewZoom / 100);
  }, [
    frames.length,
    mergedMetrics.canvasHeight,
    mergedMetrics.canvasWidth,
    previewZoom,
  ]);

  const previewTiles = useMemo(
    () =>
      frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        url: frame.url,
        width: frame.width,
        height: frame.height,
      })),
    [frames],
  );

  const previewCanvasWidth = Math.max(
    1,
    Math.round(mergedMetrics.canvasWidth * previewScale),
  );
  const previewCanvasHeight = Math.max(
    1,
    Math.round(mergedMetrics.canvasHeight * previewScale),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (frames.length === 0) {
      canvas.width = 1200;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (previewBackgroundColor !== TRANSPARENT_PREVIEW_BACKGROUND) {
        ctx.fillStyle = previewBackgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.strokeStyle = "rgba(93, 75, 49, 0.2)";
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 12]);
      ctx.strokeRect(
        canvas.width * 0.14,
        canvas.height * 0.18,
        canvas.width * 0.72,
        canvas.height * 0.64,
      );
      ctx.setLineDash([]);
      return;
    }

    canvas.width = mergedMetrics.canvasWidth;
    canvas.height = mergedMetrics.canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (previewBackgroundColor !== TRANSPARENT_PREVIEW_BACKGROUND) {
      ctx.fillStyle = previewBackgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    frames.forEach((frame, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const cellX = column * (mergedMetrics.maxWidth + padding);
      const cellY = row * (mergedMetrics.maxHeight + padding);
      const offsetX = cellX + Math.floor((mergedMetrics.maxWidth - frame.width) / 2);
      const offsetY =
        cellY + Math.floor((mergedMetrics.maxHeight - frame.height) / 2);
      ctx.drawImage(frame.image, offsetX, offsetY, frame.width, frame.height);
    });

  }, [
    columns,
    exportFormat,
    frames,
    mergedMetrics,
    padding,
    previewBackgroundColor,
    t,
  ]);

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadFiles(event.target.files);
    }

    event.target.value = "";
  }

  async function loadFiles(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList);

    if (incomingFiles.length === 0) {
      return;
    }

    const imageFiles = incomingFiles.filter(isSupportedImageFile);

    if (imageFiles.length === 0) {
      return;
    }

    const nextFrames = (
      await Promise.allSettled(imageFiles.map(createMergeFrame))
    )
      .filter(
        (result): result is PromiseFulfilledResult<MergeFrame> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .sort(compareFrameNames);

    if (nextFrames.length === 0) {
      return;
    }

    setFrames((current) => [...current, ...nextFrames].sort(compareFrameNames));
  }

  function clearFrames() {
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    framesRef.current = [];
    setFrames([]);
  }

  function removeFrame(frameId: string) {
    setFrames((current) => {
      const targetFrame = current.find((frame) => frame.id === frameId);

      if (targetFrame) {
        URL.revokeObjectURL(targetFrame.url);
      }

      const nextFrames = current.filter((frame) => frame.id !== frameId);
      framesRef.current = nextFrames;
      return nextFrames;
    });
  }

  function commitColumnsInput(value: string) {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      setColumns(DEFAULT_COLUMNS);
      setColumnsInput(String(DEFAULT_COLUMNS));
      return;
    }

    const nextColumns = clamp(Number(trimmedValue), MIN_COLUMNS, MAX_COLUMNS);
    setColumns(nextColumns);
    setColumnsInput(String(nextColumns));
  }

  function handlePreviewDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = frames.findIndex((frame) => frame.id === active.id);
    const newIndex = frames.findIndex((frame) => frame.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextFrames = arrayMove(frames, oldIndex, newIndex);
    framesRef.current = nextFrames;
    setFrames(nextFrames);
  }

  function handleDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    await loadFiles(await getDroppedFiles(event.dataTransfer));
  }

  function exportMergedImage() {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) {
      return;
    }

    const dataUrl = canvas.toDataURL(
      getMimeType(exportFormat),
      getQuality(exportFormat),
    );
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `sprite-sheet.${exportFormat === "jpeg" ? "jpg" : exportFormat}`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function applyPreviewBackgroundColor(color: string) {
    setPreviewBackgroundColor(color);

    if (color !== TRANSPARENT_PREVIEW_BACKGROUND) {
      setPreviewPickerColor(color);
    }
  }

  return (
    <main
      className={styles.page}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging ? (
        <div className={styles.dragOverlay}>
          <div className={styles.dragCard}>{t("dropPrompt")}</div>
        </div>
      ) : null}

      <section className={styles.layout}>
        <section className={styles.canvasPanel}>
          <div className={styles.canvasToolbar}>
            <div className={styles.controlsInline}>
              <label className={styles.field}>
                <span>{t("controls.columns")}</span>
                <input
                  max={MAX_COLUMNS}
                  min={MIN_COLUMNS}
                  onBlur={(event) => commitColumnsInput(event.target.value)}
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    if (nextValue === "") {
                      setColumnsInput("");
                      return;
                    }

                    if (!/^\d+$/.test(nextValue)) {
                      return;
                    }

                    setColumnsInput(nextValue);
                    setColumns(clamp(Number(nextValue), MIN_COLUMNS, MAX_COLUMNS));
                  }}
                  type="number"
                  value={columnsInput}
                />
              </label>

              <label className={styles.field}>
                <span>{t("controls.padding")}</span>
                <input
                  max={MAX_PADDING}
                  min={MIN_PADDING}
                  onChange={(event) =>
                    setPadding(
                      clamp(Number(event.target.value), MIN_PADDING, MAX_PADDING),
                    )
                  }
                  type="number"
                  value={padding}
                />
              </label>

              <label className={styles.field}>
                <span>{t("controls.format")}</span>
                <select
                  onChange={(event) =>
                    setExportFormat(event.target.value as "png" | "jpeg" | "webp")
                  }
                  value={exportFormat}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </label>
            </div>

            <div className={styles.toolbarActions}>
              <button
                className={styles.tertiaryAction}
                disabled={frames.length === 0}
                onClick={clearFrames}
                type="button"
              >
                {t("actions.clear")}
              </button>
              <button
                className={styles.exportButton}
                disabled={frames.length === 0}
                onClick={exportMergedImage}
                type="button"
              >
                {t("actions.export")}
              </button>
            </div>
          </div>

          <div className={styles.previewFrame}>
            <div
              className={styles.canvasViewport}
              style={
                {
                  backgroundColor: previewBackgroundColor,
                  ...(frames.length > 0
                    ? {
                        width: `${previewCanvasWidth}px`,
                        height: `${previewCanvasHeight}px`,
                      }
                    : {}),
                }
              }
            >
              {frames.length === 0 ? (
                <div className={styles.emptyPreview}>
                  <p className={styles.emptyPreviewTitle}>{t("emptyPreview.title")}</p>
                  <p className={styles.emptyPreviewCopy}>{t("emptyPreview.description")}</p>
                  <label className={styles.emptyPreviewAction}>
                    <input
                      accept="image/*"
                      className={styles.hiddenInput}
                      multiple
                      onChange={handleInputChange}
                      type="file"
                      {...({ directory: "", webkitdirectory: "" } satisfies DirectoryInputProps)}
                    />
                    {t("emptyPreview.action")}
                  </label>
                </div>
              ) : (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handlePreviewDragEnd}
                  sensors={sensors}
                >
                  <SortableContext
                    items={previewTiles.map((tile) => tile.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div
                      className={styles.previewGrid}
                      style={
                        {
                          "--preview-columns": String(columns),
                          "--preview-padding": `${padding}px`,
                          "--preview-cell-width": `${Math.max(
                            1,
                            Math.round(mergedMetrics.maxWidth * previewScale),
                          )}px`,
                          "--preview-cell-height": `${Math.max(
                            1,
                            Math.round(mergedMetrics.maxHeight * previewScale),
                          )}px`,
                          "--preview-canvas-width": `${previewCanvasWidth}px`,
                          "--preview-canvas-height": `${previewCanvasHeight}px`,
                        } as React.CSSProperties
                      }
                    >
                      {previewTiles.map((tile) => (
                        <SortablePreviewTile
                          height={tile.height}
                          id={tile.id}
                          imageUrl={tile.url}
                          key={tile.id}
                          name={tile.name}
                          onDelete={removeFrame}
                          width={tile.width}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          <div className={styles.zoomBar}>
            <div className={styles.zoomControls}>
              <div className={styles.previewControlsColumn}>
                <label className={styles.zoomLabel} htmlFor="preview-zoom">
                  <span>{t("preview.zoom")}</span>
                  <span>{previewZoom}%</span>
                </label>
                <input
                  className={styles.zoomSlider}
                  id="preview-zoom"
                  max={200}
                  min={40}
                  onChange={(event) => setPreviewZoom(Number(event.target.value))}
                  type="range"
                  value={previewZoom}
                />
                <div className={styles.infoPanel}>
                  <p className={styles.panelEyebrow}>{t("preview.eyebrow")}</p>
                  <div className={styles.infoGrid}>
                    <InfoCard
                      label={t("preview.maxCell")}
                      value={
                        frames.length > 0
                          ? `${mergedMetrics.maxWidth} x ${mergedMetrics.maxHeight}`
                          : "-"
                      }
                    />
                    <InfoCard
                      label={t("preview.rows")}
                      value={String(mergedMetrics.rows || 0)}
                    />
                    <InfoCard
                      label={t("preview.canvasSize")}
                      value={
                        frames.length > 0
                          ? `${mergedMetrics.canvasWidth} x ${mergedMetrics.canvasHeight}`
                          : "-"
                      }
                    />
                  </div>
                </div>
              </div>

              <div className={styles.previewColorPanel}>
                <div className={styles.previewColorHeader}>
                  <span>{t("preview.background")}</span>
                  <span
                    aria-hidden="true"
                    className={`${styles.previewColorCurrent} ${
                      previewBackgroundColor === TRANSPARENT_PREVIEW_BACKGROUND
                        ? styles.previewColorTransparent
                        : ""
                    }`}
                    style={
                      previewBackgroundColor === TRANSPARENT_PREVIEW_BACKGROUND
                        ? undefined
                        : { backgroundColor: previewBackgroundColor }
                    }
                  />
                </div>

                <div className={styles.previewColorPresets}>
                  {PREVIEW_BACKGROUND_PRESETS.map((color) => (
                    <button
                      aria-label={t("preview.backgroundPreset", {
                        color:
                          color === TRANSPARENT_PREVIEW_BACKGROUND
                            ? t("preview.transparent")
                            : color,
                      })}
                      className={`${styles.previewColorSwatch} ${
                        previewBackgroundColor.toLowerCase() === color.toLowerCase()
                          ? styles.previewColorSwatchActive
                          : ""
                      } ${
                        color === TRANSPARENT_PREVIEW_BACKGROUND
                          ? styles.previewColorTransparent
                          : ""
                      }`}
                      key={color}
                      onClick={() => applyPreviewBackgroundColor(color)}
                      style={
                        color === TRANSPARENT_PREVIEW_BACKGROUND
                          ? undefined
                          : { backgroundColor: color }
                      }
                      type="button"
                    />
                  ))}
                </div>

                <div className={styles.previewColorPicker}>
                  <HexAlphaColorPicker
                    color={previewPickerColor}
                    onChange={(color) => applyPreviewBackgroundColor(color)}
                  />
                </div>
              </div>
            </div>
          </div>

          <canvas aria-hidden="true" className={styles.hiddenCanvas} ref={canvasRef} />
        </section>
      </section>
    </main>
  );
}

type SortablePreviewTileProps = {
  id: string;
  imageUrl: string;
  name: string;
  onDelete: (id: string) => void;
  width: number;
  height: number;
};

function SortablePreviewTile({
  id,
  imageUrl,
  name,
  onDelete,
  width,
  height,
}: SortablePreviewTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      className={`${styles.previewTile} ${isDragging ? styles.previewTileDragging : ""}`}
      ref={setNodeRef}
      role="button"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? "none" : transition,
      }}
      tabIndex={0}
      {...attributes}
      {...listeners}
    >
      <div className={styles.previewTileInner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          className={styles.previewTileImage}
          draggable={false}
          height={height}
          src={imageUrl}
          width={width}
        />
        <div className={styles.previewTileOverlay}>
          <button
            aria-label={`Delete ${name}`}
            className={styles.previewTileDelete}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(id);
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            type="button"
          >
            <FaTrashAlt aria-hidden="true" />
          </button>
          <div className={styles.previewTileName}>{name}</div>
          <div className={styles.previewTileMeta}>
            {width} x {height}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{value}</div>
    </div>
  );
}

function compareFrameNames(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function createMergeFrame(file: File): Promise<MergeFrame> {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    return {
      id: `${file.name}-${createFrameId()}`,
      name: file.name,
      url,
      image,
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function getDroppedFiles(dataTransfer: DataTransfer) {
  const itemEntries = Array.from(dataTransfer.items ?? [])
    .map((item) => getAsEntry(item))
    .filter((entry): entry is DroppedEntry => entry !== null);

  if (itemEntries.length > 0) {
    const nestedFiles = await Promise.all(itemEntries.map(readEntryFiles));
    const flattenedFiles = nestedFiles.flat();

    if (flattenedFiles.length > 0) {
      return flattenedFiles;
    }
  }

  const itemFiles = Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(dataTransfer.files);
}

function getAsEntry(item: DataTransferItem) {
  const candidate = item as DataTransferItem & {
    webkitGetAsEntry?: unknown;
  };

  if (typeof candidate.webkitGetAsEntry !== "function") {
    return null;
  }

  return candidate.webkitGetAsEntry() as DroppedEntry | null;
}

async function readEntryFiles(entry: DroppedEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as DroppedFileEntry);
    return file ? [file] : [];
  }

  if (entry.isDirectory) {
    const entries = await readDirectoryEntries(entry as DroppedDirectoryEntry);
    const nestedFiles = await Promise.all(entries.map(readEntryFiles));
    return nestedFiles.flat();
  }

  return [];
}

function readFileEntry(entry: DroppedFileEntry) {
  return new Promise<File | null>((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function readDirectoryEntries(entry: DroppedDirectoryEntry) {
  const reader = entry.createReader();
  const entries: DroppedEntry[] = [];

  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      break;
    }

    entries.push(...batch);
  }

  return entries;
}

function isSupportedImageFile(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }

  return /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name);
}

function createFrameId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function getMimeType(format: "png" | "jpeg" | "webp") {
  if (format === "jpeg") {
    return "image/jpeg";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "image/png";
}

function getQuality(format: "png" | "jpeg" | "webp") {
  return format === "png" ? undefined : 0.95;
}
