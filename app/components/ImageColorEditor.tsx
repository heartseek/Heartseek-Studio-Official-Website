"use client";

import JSZip from "jszip";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ReactCompareSlider } from "react-compare-slider";
import { ReactCompareSliderCssVars } from "react-compare-slider/consts";
import { HexAlphaColorPicker } from "react-colorful";
import ImageCarousel, { type ImageCarouselItem } from "./ImageCarousel";
import styles from "./ImageColorEditor.module.css";

type ImportedImage = {
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

export default function ImageColorEditor() {
  const t = useTranslations("imageEditor");
  const imagesRef = useRef<ImportedImage[]>([]);
  const dragDepthRef = useRef(0);
  const compareContainerRef = useRef<HTMLDivElement | null>(null);
  const [images, setImages] = useState<ImportedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [hue, setHue] = useState(0);
  const [comparePosition, setComparePosition] = useState(50);
  const [previewBackgroundColor, setPreviewBackgroundColor] = useState<string>(
    TRANSPARENT_PREVIEW_BACKGROUND,
  );
  const [previewPickerColor, setPreviewPickerColor] = useState(
    `${DEFAULT_PREVIEW_BACKGROUND}ff`,
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, []);

  useEffect(() => {
    const compareRoot = compareContainerRef.current?.querySelector<HTMLElement>(
      '[data-rcs="root"]',
    );
    if (!compareRoot) {
      return;
    }

    compareRoot.style.setProperty(
      ReactCompareSliderCssVars.rawPosition,
      `${comparePosition}%`,
    );

    const handleRoot = compareRoot.querySelector<HTMLElement>(
      '[data-rcs="handle-root"]',
    );
    handleRoot?.setAttribute("aria-valuenow", `${Math.round(comparePosition)}`);
  }, [comparePosition]);

  const activeImage = useMemo(
    () => images.find((image) => image.id === activeImageId) ?? null,
    [activeImageId, images],
  );

  const previewScale = useMemo(() => {
    if (!activeImage) {
      return 1;
    }

    const widthScale =
      activeImage.width > 0 ? PREVIEW_MAX_WIDTH / activeImage.width : 1;
    const heightScale =
      activeImage.height > 0 ? PREVIEW_MAX_HEIGHT / activeImage.height : 1;

    return Math.min(1, widthScale, heightScale);
  }, [activeImage]);

  const previewWidth = Math.max(
    1,
    Math.round((activeImage?.width ?? 1) * previewScale),
  );
  const previewHeight = Math.max(
    1,
    Math.round((activeImage?.height ?? 1) * previewScale),
  );
  const previewFilter = `brightness(${100 + brightness}%) contrast(${
    100 + contrast
  }%) hue-rotate(${hue}deg)`;
  const carouselItems = useMemo<ImageCarouselItem[]>(
    () =>
      images.map((image) => ({
        id: image.id,
        image: image.url,
        title: image.name,
        subtitle: `${image.width} x ${image.height}`,
      })),
    [images],
  );

  function applyPreviewBackgroundColor(color: string) {
    if (color === TRANSPARENT_PREVIEW_BACKGROUND) {
      setPreviewBackgroundColor(color);
      return;
    }

    setPreviewBackgroundColor(color);
    setPreviewPickerColor(color);
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadImages(event.target.files);
    }

    event.target.value = "";
  }

  async function loadImages(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList).filter(isSupportedImageFile);

    if (incomingFiles.length === 0) {
      return;
    }

    const nextImages = (
      await Promise.allSettled(incomingFiles.map(createImportedImage))
    )
      .filter(
        (result): result is PromiseFulfilledResult<ImportedImage> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .sort(compareImageNames);

    if (nextImages.length === 0) {
      return;
    }

    setImages((current) => {
      const mergedImages = [...current, ...nextImages].sort(compareImageNames);

      if (!activeImageId) {
        setActiveImageId(mergedImages[0]?.id ?? null);
      }

      return mergedImages;
    });
  }

  function clearImages() {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    imagesRef.current = [];
    setImages([]);
    setActiveImageId(null);
  }

  function resetAdjustments() {
    setBrightness(0);
    setContrast(0);
    setHue(0);
  }

  async function exportAllImages() {
    if (images.length === 0) {
      return;
    }

    if (images.length === 1) {
      const blob = await createAdjustedImageBlob(
        images[0],
        brightness,
        contrast,
        hue,
      );

      if (!blob) {
        return;
      }

      downloadBlob(blob, images[0].name);
      return;
    }

    const zip = new JSZip();

    for (const image of images) {
      const blob = await createAdjustedImageBlob(
        image,
        brightness,
        contrast,
        hue,
      );

      if (!blob) {
        continue;
      }

      zip.file(image.name, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, "image-editor-export.zip");
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
    const droppedFiles = await getDroppedFiles(event.dataTransfer);
    await loadImages(droppedFiles);
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
        <section className={styles.workspace}>
          <div className={styles.canvasToolbar}>
            <div className={styles.controlsInline}>
              <label className={styles.field}>
                <span>{t("controls.brightness")}</span>
                <input
                  max={100}
                  min={-100}
                  onChange={(event) => setBrightness(Number(event.target.value))}
                  type="range"
                  value={brightness}
                />
                <span className={styles.fieldValue}>{brightness}%</span>
              </label>

              <label className={styles.field}>
                <span>{t("controls.contrast")}</span>
                <input
                  max={100}
                  min={-100}
                  onChange={(event) => setContrast(Number(event.target.value))}
                  type="range"
                  value={contrast}
                />
                <span className={styles.fieldValue}>{contrast}%</span>
              </label>

              <label className={styles.field}>
                <span>{t("controls.hue")}</span>
                <input
                  max={180}
                  min={-180}
                  onChange={(event) => setHue(Number(event.target.value))}
                  type="range"
                  value={hue}
                />
                <span className={styles.fieldValue}>{hue}deg</span>
              </label>
            </div>

            <div className={styles.toolbarActions}>
              <button
                className={styles.tertiaryAction}
                disabled={images.length === 0}
                onClick={resetAdjustments}
                type="button"
              >
                {t("actions.reset")}
              </button>
              <button
                className={styles.secondaryAction}
                disabled={images.length === 0}
                onClick={exportAllImages}
                type="button"
              >
                {t("actions.exportAll")}
              </button>
              <button
                className={styles.secondaryAction}
                disabled={images.length === 0}
                onClick={clearImages}
                type="button"
              >
                {t("actions.clear")}
              </button>
            </div>
          </div>

          <div className={styles.previewFrame}>
            <div className={styles.canvasViewport}>
              {activeImage ? (
                <div
                  ref={compareContainerRef}
                  className={styles.previewCanvas}
                  style={{
                    width: `${previewWidth}px`,
                    height: `${previewHeight}px`,
                    backgroundColor: previewBackgroundColor,
                  }}
                >
                  <ReactCompareSlider
                    className={styles.compareSlider}
                    defaultPosition={comparePosition}
                    handle={<span className={styles.compareHandleHidden} />}
                    itemOne={
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        alt={`${activeImage.name} original`}
                        className={styles.previewImage}
                        draggable={false}
                        height={previewHeight}
                        src={activeImage.url}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
                        }}
                        width={previewWidth}
                      />
                    }
                    onPositionChange={setComparePosition}
                    itemTwo={
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        alt={`${activeImage.name} adjusted`}
                        className={styles.previewImage}
                        draggable={false}
                        height={previewHeight}
                        src={activeImage.url}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
                          filter: previewFilter,
                        }}
                        width={previewWidth}
                      />
                    }
                  />
                </div>
              ) : (
                <div className={styles.emptyPreview}>
                  <p className={styles.emptyPreviewTitle}>{t("emptyPreview.title")}</p>
                  <p className={styles.emptyPreviewCopy}>
                    {t("emptyPreview.description")}
                  </p>
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
              )}
            </div>
          </div>

          {activeImage ? (
            <div className={styles.compareControlRow}>
              <span className={styles.compareLabel}>{t("preview.original")}</span>
              <input
                aria-label="Compare images"
                className={styles.compareRange}
                max={100}
                min={0}
                onChange={(event) => setComparePosition(Number(event.target.value))}
                type="range"
                value={comparePosition}
              />
              <span className={styles.compareLabel}>{t("preview.result")}</span>
            </div>
          ) : null}

          <div className={styles.carouselWrap}>
            <ImageCarousel
              ariaLabel={t("carousel.ariaLabel")}
              activeId={activeImageId}
              imageHeight={112}
              imageWidth={112}
              items={carouselItems}
              onSelect={(index) => setActiveImageId(images[index]?.id ?? null)}
            />
          </div>

          <div className={styles.previewFooter}>
            <div className={styles.infoPanel}>
              <p className={styles.panelEyebrow}>{t("preview.eyebrow")}</p>
              <div className={styles.infoGrid}>
                <InfoCard label={t("preview.imageCount")} value={String(images.length)} />
                <InfoCard
                  label={t("preview.activeSize")}
                  value={
                    activeImage ? `${activeImage.width} x ${activeImage.height}` : "-"
                  }
                />
                <InfoCard
                  label={t("preview.filter")}
                  value={`${brightness}% / ${contrast}% / ${hue}deg`}
                />
              </div>
            </div>

            <div className={styles.previewBackgroundPanel}>
              <div className={styles.previewBackgroundHeader}>
                <span>{t("preview.background")}</span>
                <span
                  aria-hidden="true"
                  className={`${styles.previewBackgroundCurrent} ${
                    previewBackgroundColor === TRANSPARENT_PREVIEW_BACKGROUND
                      ? styles.previewBackgroundTransparent
                      : ""
                  }`}
                  style={
                    previewBackgroundColor === TRANSPARENT_PREVIEW_BACKGROUND
                      ? undefined
                      : { backgroundColor: previewBackgroundColor }
                  }
                />
              </div>

              <div className={styles.previewBackgroundPresets}>
                {PREVIEW_BACKGROUND_PRESETS.map((color) => (
                  <button
                    aria-label={t("preview.backgroundPreset", {
                      color:
                        color === TRANSPARENT_PREVIEW_BACKGROUND
                          ? t("preview.transparent")
                          : color,
                    })}
                    className={`${styles.previewBackgroundSwatch} ${
                      previewBackgroundColor.toLowerCase() === color.toLowerCase()
                        ? styles.previewBackgroundSwatchActive
                        : ""
                    } ${
                      color === TRANSPARENT_PREVIEW_BACKGROUND
                        ? styles.previewBackgroundTransparent
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

              <div className={styles.previewBackgroundPicker}>
                <HexAlphaColorPicker
                  color={previewPickerColor}
                  onChange={(color) => applyPreviewBackgroundColor(color)}
                />
              </div>
            </div>
          </div>
        </section>
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

function compareImageNames(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function createImportedImage(file: File): Promise<ImportedImage> {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    return {
      id: `${file.name}-${createImageId()}`,
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

function createImageId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAdjustedImageBlob(
  image: ImportedImage,
  brightness: number,
  contrast: number,
  hue: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.filter = `brightness(${100 + brightness}%) contrast(${
    100 + contrast
  }%) hue-rotate(${hue}deg)`;
  ctx.drawImage(image.image, 0, 0, image.width, image.height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), getExportMimeType(image.name));
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExportMimeType(filename: string) {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/png";
}
