"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ImageCarousel from "./ImageCarousel";
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

export default function SpriteEditor() {
  const t = useTranslations("spriteEditor");
  const framesRef = useRef<MergeFrame[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragDepthRef = useRef(0);
  const [frames, setFrames] = useState<MergeFrame[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">(
    "png",
  );
  const [previewDataUrl, setPreviewDataUrl] = useState("");

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

  const carouselItems = useMemo(
    () =>
      frames.map((frame) => ({
        id: frame.id,
        image: frame.url,
        title: frame.name,
        subtitle: `${frame.width} x ${frame.height}`,
      })),
    [frames],
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
      ctx.fillStyle = "#f7f2e7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      setPreviewDataUrl("");
      return;
    }

    canvas.width = mergedMetrics.canvasWidth;
    canvas.height = mergedMetrics.canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

    setPreviewDataUrl(
      canvas.toDataURL(getMimeType(exportFormat), getQuality(exportFormat)),
    );
  }, [columns, exportFormat, frames, mergedMetrics, padding, t]);

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadFiles(event.target.files);
    }

    event.target.value = "";
  }

  async function loadFiles(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList);

    if (incomingFiles.length === 0) {
      setMessage(t("messages.noFiles"));
      return;
    }

    const imageFiles = incomingFiles.filter(isSupportedImageFile);

    if (imageFiles.length === 0) {
      setMessage(t("messages.unsupported"));
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
      setMessage(t("messages.failed"));
      return;
    }

    setFrames((current) => [...current, ...nextFrames].sort(compareFrameNames));

    const skippedCount =
      incomingFiles.length - imageFiles.length + (imageFiles.length - nextFrames.length);

    setMessage(
      skippedCount > 0
        ? t("messages.importedWithSkipped", {
            imported: nextFrames.length,
            skipped: skippedCount,
          })
        : t("messages.imported", { imported: nextFrames.length }),
    );
  }

  function clearFrames() {
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    framesRef.current = [];
    setFrames([]);
    setPreviewDataUrl("");
    setMessage("");
  }

  function removeFrame(frameId: string) {
    setFrames((current) => {
      const target = current.find((frame) => frame.id === frameId);

      if (!target) {
        return current;
      }

      URL.revokeObjectURL(target.url);
      const nextFrames = current.filter((frame) => frame.id !== frameId);
      framesRef.current = nextFrames;

      if (nextFrames.length === 0) {
        setPreviewDataUrl("");
        setMessage("");
      }

      return nextFrames;
    });
  }

  function reorderFrames(nextItems: { id: string | number }[]) {
    setFrames((current) => {
      const orderMap = new Map(current.map((frame) => [frame.id, frame]));
      const nextFrames = nextItems
        .map((item) => orderMap.get(item.id))
        .filter((frame): frame is MergeFrame => Boolean(frame));

      if (nextFrames.length !== current.length) {
        return current;
      }

      framesRef.current = nextFrames;
      return nextFrames;
    });
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
                  onChange={(event) =>
                    setColumns(
                      clamp(Number(event.target.value), MIN_COLUMNS, MAX_COLUMNS),
                    )
                  }
                  type="number"
                  value={columns}
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

          <div className={styles.canvasViewport}>
            <canvas className={styles.canvas} ref={canvasRef} />
          </div>

          {carouselItems.length > 0 ? (
            <div className={styles.carouselSection}>
              <ImageCarousel
                ariaLabel={t("carousel.ariaLabel")}
                imageHeight={260}
                imageWidth={260}
                items={carouselItems}
                onReorder={reorderFrames}
                showSubtitle
                showTitle
              />
            </div>
          ) : null}

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

            {previewDataUrl ? (
              <a
                className={styles.previewDownload}
                download={`sprite-sheet.${exportFormat === "jpeg" ? "jpg" : exportFormat}`}
                href={previewDataUrl}
              >
                {t("actions.downloadPreview")}
              </a>
            ) : null}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarIntro}>
            <p className={styles.panelEyebrow}>{t("import.eyebrow")}</p>
            <h2 className={styles.panelTitle}>{t("import.title")}</h2>
            <p className={styles.panelCopy}>{t("import.description")}</p>
          </div>

          <div className={styles.sidebarTop}>
            <label
              className={`${styles.dropzone} ${
                isDragging ? styles.dropzoneActive : ""
              }`}
            >
              <input
                accept="image/*"
                className={styles.hiddenInput}
                multiple
                onChange={handleInputChange}
                type="file"
              />
              <span className={styles.dropzoneTitle}>{t("import.dragTitle")}</span>
              <span className={styles.dropzoneCopy}>{t("import.dragCopy")}</span>
            </label>

            <div className={styles.sidebarActions}>
              <label className={styles.secondaryAction}>
                <input
                  accept="image/*"
                  className={styles.hiddenInput}
                  multiple
                  onChange={handleInputChange}
                  type="file"
                  {...({ directory: "", webkitdirectory: "" } satisfies DirectoryInputProps)}
                />
                {t("actions.selectFolder")}
              </label>

              <div className={styles.countBadge}>
                {t("controls.importedCount")} {frames.length}
              </div>
            </div>
          </div>

          {message ? <div className={styles.message}>{message}</div> : null}

          <div className={styles.frameList}>
            {frames.length === 0 ? (
              <div className={styles.emptyList}>{t("list.empty")}</div>
            ) : (
              frames.map((frame, index) => (
                <div className={styles.frameCard} key={frame.id}>
                  <div className={styles.frameRow}>
                    <div className={styles.frameName}>
                      {index + 1}. {frame.name}
                    </div>
                    <button
                      aria-label={`${t("actions.delete")} ${frame.name}`}
                      className={styles.frameDelete}
                      onClick={() => removeFrame(frame.id)}
                      type="button"
                    >
                      {t("actions.delete")}
                    </button>
                  </div>
                  <div className={styles.frameSize}>
                    {frame.width} x {frame.height}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
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
