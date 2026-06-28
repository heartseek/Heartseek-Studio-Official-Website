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
  const [colorBrightness, setColorBrightness] = useState(0);
  const [colorContrast, setColorContrast] = useState(0);
  const [colorHue, setColorHue] = useState(0);
  const [effectMode, setEffectMode] = useState<"color" | "grayscale" | "invert">("color");
  const [grayscalePreset, setGrayscalePreset] = useState<"soft" | "hard" | null>("soft");
  const [grayscaleBrightness, setGrayscaleBrightness] = useState(0);
  const [grayscaleContrast, setGrayscaleContrast] = useState(0);
  const [grayscaleThreshold, setGrayscaleThreshold] = useState(50);
  const [grayscaleGamma, setGrayscaleGamma] = useState(100);
  const [invertStrength, setInvertStrength] = useState(100);
  const [comparePosition, setComparePosition] = useState(50);
  const [previewBackgroundColor, setPreviewBackgroundColor] = useState<string>(
    TRANSPARENT_PREVIEW_BACKGROUND,
  );
  const [previewPickerColor, setPreviewPickerColor] = useState(
    `${DEFAULT_PREVIEW_BACKGROUND}ff`,
  );
  const [adjustedPreviewUrl, setAdjustedPreviewUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!activeImage) {
      return undefined;
    }

    let isCancelled = false;
    let debounceTimer: number | null = null;
    let currentUrl: string | null = null;

    debounceTimer = window.setTimeout(() => {
      void (async () => {
        const blob = await createAdjustedImageBlob(activeImage, {
          colorBrightness,
          colorContrast,
          colorHue,
          effectMode,
          grayscalePreset,
          grayscaleBrightness,
          grayscaleContrast,
          grayscaleThreshold,
          grayscaleGamma,
          invertStrength,
        });

        if (!blob || isCancelled) {
          return;
        }

        currentUrl = URL.createObjectURL(blob);
        setAdjustedPreviewUrl(currentUrl);
      })();
    }, 100);

    return () => {
      isCancelled = true;
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [
    activeImage,
    colorBrightness,
    colorContrast,
    colorHue,
    effectMode,
    grayscaleBrightness,
    grayscaleContrast,
    grayscaleGamma,
    grayscalePreset,
    grayscaleThreshold,
    invertStrength,
  ]);

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

  function reorderImages(nextItems: ImageCarouselItem[]) {
    setImages((current) => {
      const currentMap = new Map(current.map((image) => [image.id, image]));
      return nextItems
        .map((item) => currentMap.get(String(item.id)))
        .filter((image): image is ImportedImage => image !== undefined);
    });
  }

  function removeImageById(imageId: string | number) {
    const targetId = String(imageId);

    setImages((current) => {
      const nextImages = current.filter((image) => image.id !== targetId);
      const removedImage = current.find((image) => image.id === targetId);

      if (removedImage) {
        URL.revokeObjectURL(removedImage.url);
      }

      setActiveImageId((currentActiveId) => {
        if (currentActiveId !== targetId) {
          return currentActiveId;
        }

        if (nextImages.length === 0) {
          return null;
        }

        const removedIndex = current.findIndex((image) => image.id === targetId);
        const fallbackIndex = Math.min(
          removedIndex,
          Math.max(0, nextImages.length - 1),
        );

        return nextImages[fallbackIndex]?.id ?? nextImages[0]?.id ?? null;
      });

      return nextImages;
    });
  }

  function resetAdjustments() {
    setColorBrightness(0);
    setColorContrast(0);
    setColorHue(0);
    setGrayscalePreset("soft");
    setGrayscaleBrightness(0);
    setGrayscaleContrast(0);
    setGrayscaleThreshold(0);
    setGrayscaleGamma(100);
    setInvertStrength(100);
  }

  function applyGrayscalePreset(nextPreset: "soft" | "hard") {
    setGrayscalePreset(nextPreset);
    if (nextPreset === "soft") {
      setGrayscaleBrightness(0);
      setGrayscaleContrast(0);
      setGrayscaleThreshold(0);
      setGrayscaleGamma(100);
      return;
    }

    setGrayscaleBrightness(10);
    setGrayscaleContrast(30);
    setGrayscaleThreshold(85);
    setGrayscaleGamma(110);
  }

  async function exportAllImages() {
    if (images.length === 0) {
      return;
    }

    if (images.length === 1) {
      const blob = await createAdjustedImageBlob(
        images[0],
        {
          colorBrightness,
          colorContrast,
          colorHue,
          effectMode,
          grayscalePreset,
          grayscaleBrightness,
          grayscaleContrast,
          grayscaleThreshold,
          grayscaleGamma,
          invertStrength,
        },
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
        {
          colorBrightness,
          colorContrast,
          colorHue,
          effectMode,
          grayscalePreset,
          grayscaleBrightness,
          grayscaleContrast,
          grayscaleThreshold,
          grayscaleGamma,
          invertStrength,
        },
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
            <div className={styles.controlsStack}>
              <fieldset className={styles.modeField}>
                <legend>{t("controls.mode")}</legend>
                <div className={styles.modeOptions}>
                  <label className={styles.modeOption}>
                    <input
                      checked={effectMode === "color"}
                      onChange={() => setEffectMode("color")}
                      type="radio"
                      name="image-adjust-mode"
                    />
                    <span>{t("controls.colorAdjust")}</span>
                  </label>
                  <label className={styles.modeOption}>
                    <input
                      checked={effectMode === "grayscale"}
                      onChange={() => setEffectMode("grayscale")}
                      type="radio"
                      name="image-adjust-mode"
                    />
                    <span>{t("controls.blackWhite")}</span>
                  </label>
                  <label className={styles.modeOption}>
                    <input
                      checked={effectMode === "invert"}
                      onChange={() => setEffectMode("invert")}
                      type="radio"
                      name="image-adjust-mode"
                    />
                    <span>{t("controls.invertMode")}</span>
                  </label>
                </div>
              </fieldset>

              <div className={styles.controlsRow}>
                {effectMode === "color" ? (
                  <>
                  <label className={styles.field}>
                    <span>{t("controls.brightness")}</span>
                    <input
                      max={100}
                      min={-100}
                      onChange={(event) =>
                        setColorBrightness(Number(event.target.value))
                      }
                      type="range"
                      value={colorBrightness}
                    />
                    <span className={styles.fieldValue}>{colorBrightness}%</span>
                  </label>

                  <label className={styles.field}>
                    <span>{t("controls.contrast")}</span>
                    <input
                      max={100}
                      min={-100}
                      onChange={(event) => setColorContrast(Number(event.target.value))}
                      type="range"
                      value={colorContrast}
                    />
                    <span className={styles.fieldValue}>{colorContrast}%</span>
                  </label>

                  <label className={styles.field}>
                    <span>{t("controls.hue")}</span>
                    <input
                      max={180}
                      min={-180}
                      onChange={(event) => setColorHue(Number(event.target.value))}
                      type="range"
                      value={colorHue}
                    />
                    <span className={styles.fieldValue}>{colorHue}deg</span>
                  </label>
                  </>
                ) : null}

                {effectMode === "grayscale" ? (
                  <>
                  <label className={styles.field}>
                    <span>{t("controls.brightness")}</span>
                    <input
                      max={100}
                      min={-100}
                      onChange={(event) => {
                        setGrayscalePreset(null);
                        setGrayscaleBrightness(Number(event.target.value));
                      }}
                      type="range"
                      value={grayscaleBrightness}
                    />
                    <span className={styles.fieldValue}>{grayscaleBrightness}%</span>
                  </label>

                  <label className={styles.field}>
                    <span>{t("controls.contrast")}</span>
                    <input
                      max={100}
                      min={-100}
                      onChange={(event) => {
                        setGrayscalePreset(null);
                        setGrayscaleContrast(Number(event.target.value));
                      }}
                      type="range"
                      value={grayscaleContrast}
                    />
                    <span className={styles.fieldValue}>{grayscaleContrast}%</span>
                  </label>

                  <label className={styles.field}>
                    <span>{t("controls.threshold")}</span>
                    <input
                      max={100}
                      min={0}
                      onChange={(event) => {
                        setGrayscalePreset(null);
                        setGrayscaleThreshold(Number(event.target.value));
                      }}
                      type="range"
                      value={grayscaleThreshold}
                    />
                    <span className={styles.fieldValue}>{grayscaleThreshold}%</span>
                  </label>

                  <label className={styles.field}>
                    <span>{t("controls.gamma")}</span>
                    <input
                      max={300}
                      min={50}
                      onChange={(event) => {
                        setGrayscalePreset(null);
                        setGrayscaleGamma(Number(event.target.value));
                      }}
                      type="range"
                      value={grayscaleGamma}
                    />
                    <span className={styles.fieldValue}>
                      {(grayscaleGamma / 100).toFixed(2)}x
                    </span>
                  </label>
                  </>
                ) : null}

                {effectMode === "invert" ? (
                  <label className={styles.field}>
                    <span>{t("controls.strength")}</span>
                    <input
                      max={100}
                      min={0}
                      onChange={(event) => setInvertStrength(Number(event.target.value))}
                      type="range"
                      value={invertStrength}
                    />
                    <span className={styles.fieldValue}>{invertStrength}%</span>
                  </label>
                ) : null}
              </div>

              {effectMode === "grayscale" ? (
                <div className={styles.controlsPresetRow}>
                  <div className={styles.presetHeader}>{t("controls.presets")}</div>
                  <div className={styles.presetButtons}>
                    <button
                      className={`${styles.modeButton} ${
                        grayscalePreset === "soft" ? styles.modeButtonActive : ""
                      }`}
                      onClick={() => applyGrayscalePreset("soft")}
                      type="button"
                    >
                      {t("controls.softBlackWhite")}
                    </button>
                    <button
                      className={`${styles.modeButton} ${
                        grayscalePreset === "hard" ? styles.modeButtonActive : ""
                      }`}
                      onClick={() => applyGrayscalePreset("hard")}
                      type="button"
                    >
                      {t("controls.hardBlackWhite")}
                    </button>
                  </div>
                </div>
              ) : null}
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
                        src={adjustedPreviewUrl ?? activeImage.url}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
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
              draggable
              imageHeight={112}
              imageWidth={112}
              items={carouselItems}
              onRemove={removeImageById}
              onReorder={reorderImages}
              onSelect={(index) => setActiveImageId(images[index]?.id ?? null)}
              removableByDrag
              removeZoneLabel={t("carousel.removeZone")}
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
                  value={`${colorBrightness}% / ${colorContrast}% / ${colorHue}deg / ${
                    effectMode === "grayscale"
                      ? grayscalePreset === "soft"
                        ? t("controls.softBlackWhite")
                        : grayscalePreset === "hard"
                          ? t("controls.hardBlackWhite")
                          : t("controls.blackWhite")
                      : "-"
                  } / ${
                    effectMode === "invert" ? `${t("controls.invertMode")} ${invertStrength}%` : "-"
                  }`}
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
  settings: ImageAdjustmentSettings,
) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.drawImage(image.image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  applyImageAdjustments(data, settings);
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), getExportMimeType(image.name));
  });
}

type ImageAdjustmentSettings = {
  colorBrightness: number;
  colorContrast: number;
  colorHue: number;
  effectMode: "color" | "grayscale" | "invert";
  grayscalePreset: "soft" | "hard" | null;
  grayscaleBrightness: number;
  grayscaleContrast: number;
  grayscaleThreshold: number;
  grayscaleGamma: number;
  invertStrength: number;
};

function applyImageAdjustments(data: Uint8ClampedArray, settings: ImageAdjustmentSettings) {
  const brightnessFactor = 1 + settings.colorBrightness / 100;
  const contrastFactor = 1 + settings.colorContrast / 100;
  const hueRadians = (settings.colorHue * Math.PI) / 180;
  const invertAmount = settings.effectMode === "invert" ? settings.invertStrength / 100 : 0;
  const grayscaleBrightnessFactor = 1 + settings.grayscaleBrightness / 100;
  const grayscaleContrastFactor = 1 + settings.grayscaleContrast / 100;
  const gamma = Math.max(0.1, settings.grayscaleGamma / 100);
  const thresholdMix = settings.grayscaleThreshold / 100;

  for (let index = 0; index < data.length; index += 4) {
    let r = data[index] / 255;
    let g = data[index + 1] / 255;
    let b = data[index + 2] / 255;

    if (settings.effectMode === "grayscale") {
      const baseGray = 0.299 * r + 0.587 * g + 0.114 * b;
      let gray = baseGray * grayscaleBrightnessFactor;
      gray = (gray - 0.5) * grayscaleContrastFactor + 0.5;
      gray = Math.min(1, Math.max(0, gray));
      gray = Math.pow(gray, 1 / gamma);
      const binaryGray = gray >= thresholdMix ? 1 : 0;
      if (settings.grayscalePreset === "hard") {
        gray = gray * 0.25 + binaryGray * 0.75;
      }
      r = gray;
      g = gray;
      b = gray;
    } else {
      const { red, green, blue } = applyHueRotation(r, g, b, hueRadians);
      r = clamp01(red * brightnessFactor);
      g = clamp01(green * brightnessFactor);
      b = clamp01(blue * brightnessFactor);
      r = clamp01((r - 0.5) * contrastFactor + 0.5);
      g = clamp01((g - 0.5) * contrastFactor + 0.5);
      b = clamp01((b - 0.5) * contrastFactor + 0.5);
    }

    if (invertAmount > 0) {
      r = r * (1 - invertAmount) + (1 - r) * invertAmount;
      g = g * (1 - invertAmount) + (1 - g) * invertAmount;
      b = b * (1 - invertAmount) + (1 - b) * invertAmount;
    }

    data[index] = Math.round(clamp01(r) * 255);
    data[index + 1] = Math.round(clamp01(g) * 255);
    data[index + 2] = Math.round(clamp01(b) * 255);
  }
}

function applyHueRotation(r: number, g: number, b: number, radians: number) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    red:
      r * (0.213 + cos * 0.787 - sin * 0.213) +
      g * (0.715 - cos * 0.715 - sin * 0.715) +
      b * (0.072 - cos * 0.072 + sin * 0.928),
    green:
      r * (0.213 - cos * 0.213 + sin * 0.143) +
      g * (0.715 + cos * 0.285 + sin * 0.140) +
      b * (0.072 - cos * 0.072 - sin * 0.283),
    blue:
      r * (0.213 - cos * 0.213 - sin * 0.787) +
      g * (0.715 - cos * 0.715 + sin * 0.715) +
      b * (0.072 + cos * 0.928 + sin * 0.072),
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
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
