"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import JSZip from "jszip";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BsCameraVideoFill, BsGrid3X3GapFill } from "react-icons/bs";
import { FaPause, FaPlay, FaStepBackward, FaStepForward } from "react-icons/fa";
import { FaDownload, FaTrashAlt } from "react-icons/fa";
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

type SplitSource = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
};

type SplitMode = "grid" | "size" | "smart";

type SplitSlice = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount?: number;
  previewUrl?: string;
};

type SplitExecutionConfig = {
  mode: SplitMode;
  rows: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  alphaThreshold: number;
  minArea: number;
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
const MIN_SPLIT_CELL_SIZE = 64;
const MAX_SPLIT_CELL_SIZE = 4096;
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
type SpriteEditorTab = "merge" | "split";
type PreviewMode = "sprite" | "video";
let lastSpriteEditorTab: SpriteEditorTab | null = null;

export default function SpriteEditor() {
  const t = useTranslations("spriteEditor");
  const pathname = usePathname();
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sprite");
  const [videoFps, setVideoFps] = useState(24);
  const [videoFpsInput, setVideoFpsInput] = useState("24");
  const [videoFrameIndex, setVideoFrameIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [previewBackgroundColor, setPreviewBackgroundColor] = useState<string>(
    TRANSPARENT_PREVIEW_BACKGROUND,
  );
  const [previewPickerColor, setPreviewPickerColor] = useState(
    `${DEFAULT_PREVIEW_BACKGROUND}ff`,
  );
  const splitSourceRef = useRef<SplitSource | null>(null);
  const [splitSource, setSplitSource] = useState<SplitSource | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("grid");
  const [splitRows, setSplitRows] = useState(4);
  const [splitColumns, setSplitColumns] = useState(4);
  const [splitRowsInput, setSplitRowsInput] = useState("4");
  const [splitColumnsInput, setSplitColumnsInput] = useState("4");
  const [splitCellWidth, setSplitCellWidth] = useState(0);
  const [splitCellHeight, setSplitCellHeight] = useState(0);
  const [splitCellWidthInput, setSplitCellWidthInput] = useState("0");
  const [splitCellHeightInput, setSplitCellHeightInput] = useState("0");
  const [splitAlphaThreshold, setSplitAlphaThreshold] = useState(1);
  const [splitMinArea, setSplitMinArea] = useState(16);
  const [splitExecutionConfig, setSplitExecutionConfig] =
    useState<SplitExecutionConfig | null>(null);
  const [removedSplitSliceIds, setRemovedSplitSliceIds] = useState<string[]>([]);
  const videoFrameRef = useRef(0);
  const videoTimeRef = useRef(0);
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
      if (splitSourceRef.current) {
        URL.revokeObjectURL(splitSourceRef.current.url);
      }
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
  const videoFrameDelay = 1000 / Math.max(1, videoFps);
  const activeVideoFrame = frames[videoFrameIndex % Math.max(frames.length, 1)] ?? null;
  const splitSlices = useMemo(() => {
    if (!splitSource || !splitExecutionConfig) {
      return [] as SplitSlice[];
    }

    let nextSlices: SplitSlice[];

    if (splitExecutionConfig.mode === "grid") {
      nextSlices = createGridSplitSlices(
        splitSource,
        splitExecutionConfig.rows,
        splitExecutionConfig.columns,
      );
    } else if (splitExecutionConfig.mode === "size") {
      nextSlices = createSizeSplitSlices(
        splitSource,
        splitExecutionConfig.cellWidth,
        splitExecutionConfig.cellHeight,
      );
    } else {
      nextSlices = createSmartSplitSlices(
        splitSource,
        splitExecutionConfig.alphaThreshold,
        splitExecutionConfig.minArea,
      );
    }

    return nextSlices
      .filter((slice) => !removedSplitSliceIds.includes(slice.id))
      .map((slice) => ({
        ...slice,
        previewUrl: createSlicePreviewUrl(splitSource, slice),
      }));
  }, [
    removedSplitSliceIds,
    splitExecutionConfig,
    splitSource,
  ]);
  const splitPreviewSlices = useMemo(() => {
    if (!splitSource) {
      return [] as SplitSlice[];
    }

    if (splitMode === "grid") {
      return createGridSplitSlices(splitSource, splitRows, splitColumns);
    }

    if (splitMode === "size") {
      return createSizeSplitSlices(splitSource, splitCellWidth, splitCellHeight);
    }

    return createSmartSplitSlices(splitSource, splitAlphaThreshold, splitMinArea);
  }, [
    splitAlphaThreshold,
    splitCellHeight,
    splitCellWidth,
    splitColumns,
    splitMinArea,
    splitMode,
    splitRows,
    splitSource,
  ]);
  const splitPreviewScale = useMemo(() => {
    if (!splitSource) {
      return 1;
    }

    const widthScale = splitSource.width > 0 ? PREVIEW_MAX_WIDTH / splitSource.width : 1;
    const heightScale =
      splitSource.height > 0 ? PREVIEW_MAX_HEIGHT / splitSource.height : 1;

    return Math.min(1, widthScale, heightScale) * (previewZoom / 100);
  }, [previewZoom, splitSource]);
  const splitPreviewWidth = Math.max(
    1,
    Math.round((splitSource?.width ?? 1) * splitPreviewScale),
  );
  const splitPreviewHeight = Math.max(
    1,
    Math.round((splitSource?.height ?? 1) * splitPreviewScale),
  );
  const splitPreviewScaleX = splitSource
    ? splitPreviewWidth / splitSource.width
    : 1;
  const splitPreviewScaleY = splitSource
    ? splitPreviewHeight / splitSource.height
    : 1;
  const activeTab: SpriteEditorTab = pathname.endsWith("/split") ? "split" : "merge";
  const [animatedTab, setAnimatedTab] = useState<SpriteEditorTab>(() => {
    if (
      typeof window !== "undefined" &&
      lastSpriteEditorTab !== null &&
      lastSpriteEditorTab !== activeTab
    ) {
      return lastSpriteEditorTab;
    }

    return activeTab;
  });

  useEffect(() => {
    if (animatedTab !== activeTab) {
      const frameId = window.requestAnimationFrame(() => {
        setAnimatedTab(activeTab);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }
  }, [activeTab, animatedTab]);

  useEffect(() => {
    lastSpriteEditorTab = activeTab;
  }, [activeTab]);

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

  useEffect(() => {
    if (previewMode !== "video" || frames.length === 0 || !isVideoPlaying) {
      videoTimeRef.current = 0;
      return;
    }

    let animationFrame = 0;
    let isStopped = false;

    const loop = (now: number) => {
      if (isStopped) {
        return;
      }

      if (videoTimeRef.current === 0) {
        videoTimeRef.current = now;
      }

      const elapsed = now - videoTimeRef.current;
      if (elapsed >= videoFrameDelay) {
        const steps = Math.floor(elapsed / videoFrameDelay);
        const nextFrameIndex = (videoFrameRef.current + steps) % frames.length;
        videoFrameRef.current = nextFrameIndex;
        setVideoFrameIndex(nextFrameIndex);
        videoTimeRef.current += steps * videoFrameDelay;
      }

      animationFrame = window.requestAnimationFrame(loop);
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      isStopped = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [frames.length, isVideoPlaying, previewMode, videoFrameDelay]);

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      if (activeTab === "split") {
        await loadSplitSource(event.target.files);
      } else {
        await loadFiles(event.target.files);
      }
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
    videoFrameRef.current = 0;
    videoTimeRef.current = 0;
    setVideoFrameIndex(0);
  }

  async function loadSplitSource(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList).filter(isSupportedImageFile);
    const sourceFile = incomingFiles[0];

    if (!sourceFile) {
      return;
    }

    const nextSource = await createSplitSource(sourceFile);

    if (splitSourceRef.current) {
      URL.revokeObjectURL(splitSourceRef.current.url);
    }

    splitSourceRef.current = nextSource;
    setSplitRows(4);
    setSplitColumns(4);
    setSplitRowsInput("4");
    setSplitColumnsInput("4");
    setSplitCellWidth(0);
    setSplitCellHeight(0);
    setSplitCellWidthInput("0");
    setSplitCellHeightInput("0");
    setSplitExecutionConfig(null);
    setRemovedSplitSliceIds([]);
    setSplitSource(nextSource);
  }

  function activatePreviewMode(mode: PreviewMode) {
    setPreviewMode(mode);

    if (mode === "video") {
      videoFrameRef.current = 0;
      videoTimeRef.current = 0;
      setVideoFrameIndex(0);
      setVideoFpsInput(String(videoFps));
      setIsVideoPlaying(true);
    }
  }

  function goToVideoFrame(nextIndex: number) {
    if (frames.length === 0) {
      return;
    }

    const normalizedIndex = ((nextIndex % frames.length) + frames.length) % frames.length;
    videoFrameRef.current = normalizedIndex;
    videoTimeRef.current = 0;
    setVideoFrameIndex(normalizedIndex);
  }

  function stepVideoFrame(direction: 1 | -1) {
    goToVideoFrame(videoFrameIndex + direction);
    setIsVideoPlaying(false);
  }

  function toggleVideoPlayback() {
    setIsVideoPlaying((current) => !current);
    videoTimeRef.current = 0;
  }

  function clearFrames() {
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    framesRef.current = [];
    setFrames([]);
  }

  function clearSplitSource() {
    if (splitSourceRef.current) {
      URL.revokeObjectURL(splitSourceRef.current.url);
      splitSourceRef.current = null;
    }

    setSplitSource(null);
    setSplitExecutionConfig(null);
    setRemovedSplitSliceIds([]);
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

  function commitSplitSizeInput(
    value: string,
    setter: (nextValue: number) => void,
    inputSetter: (nextValue: string) => void,
  ) {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      setter(0);
      inputSetter("");
      return;
    }

    const nextValue = clamp(
      Number(trimmedValue),
      MIN_SPLIT_CELL_SIZE,
      MAX_SPLIT_CELL_SIZE,
    );
    setter(nextValue);
    inputSetter(String(nextValue));
  }

  function commitSplitGridInput(
    value: string,
    setter: (nextValue: number) => void,
    inputSetter: (nextValue: string) => void,
  ) {
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
      setter(1);
      inputSetter("");
      return;
    }

    const nextValue = clamp(Number(trimmedValue), 1, 128);
    setter(nextValue);
    inputSetter(String(nextValue));
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
    const droppedFiles = await getDroppedFiles(event.dataTransfer);

    if (activeTab === "split") {
      await loadSplitSource(droppedFiles);
      return;
    }

    await loadFiles(droppedFiles);
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

  function exportSplitSlice(slice: SplitSlice, exportIndex?: number) {
    if (!splitSource) {
      return;
    }

    const canvas = createSplitSliceCanvas(
      splitSource,
      slice,
      previewBackgroundColor,
    );

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${stripExtension(splitSource.name)}_${
      exportIndex ?? getSplitSliceExportIndex(splitSlices, slice.id)
    }.png`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function exportAllSplitSlices() {
    if (!splitSource || splitSlices.length === 0) {
      return;
    }

    if (splitSlices.length === 1) {
      exportSplitSlice(splitSlices[0], 0);
      return;
    }

    const zip = new JSZip();
    const baseName = stripExtension(splitSource.name);

    for (const [index, slice] of splitSlices.entries()) {
      const blob = await createSplitSliceBlob(
        splitSource,
        slice,
        previewBackgroundColor,
      );

      if (!blob) {
        continue;
      }

      zip.file(`${baseName}_${index}.png`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}-split-results.zip`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function removeSplitSlice(sliceId: string) {
    setRemovedSplitSliceIds((current) => {
      if (current.includes(sliceId)) {
        return current;
      }

      return [...current, sliceId];
    });
  }

  function runSplit() {
    if (!splitSource) {
      return;
    }

    setRemovedSplitSliceIds([]);
    setSplitExecutionConfig({
      mode: splitMode,
      rows: splitRows,
      columns: splitColumns,
      cellWidth: splitCellWidth,
      cellHeight: splitCellHeight,
      alphaThreshold: splitAlphaThreshold,
      minArea: splitMinArea,
    });
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
          <div className={styles.tabBar}>
            <div className={styles.tabList} role="tablist" aria-label={t("tabs.ariaLabel")}>
              {([
                ["merge", "/tools/sprite-editor/merge", t("tabs.merge")],
                ["split", "/tools/sprite-editor/split", t("tabs.split")],
              ] as const).map(([tabId, href, label]) => {
                const isActive = activeTab === tabId;

                return (
                  <Link
                    aria-selected={isActive}
                    className={`${styles.tabButton} ${
                      isActive ? styles.tabButtonActive : ""
                    }`}
                    href={href}
                    key={tabId}
                    role="tab"
                  >
                    {label}
                  </Link>
                );
              })}
              <span
                aria-hidden="true"
                className={`${styles.tabIndicator} ${
                  animatedTab === "split" ? styles.tabIndicatorSplit : ""
                }`}
              />
            </div>
          </div>

          <div className={styles.tabViewport}>
            <div
              className={`${styles.tabPanels} ${
                animatedTab === "split" ? styles.tabPanelsShifted : ""
              }`}
            >
              <section className={`${styles.tabPanel} ${styles.mergePanel}`} role="tabpanel">
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
                    className={`${styles.canvasViewport} ${
                      frames.length === 0 ? styles.canvasViewportEmpty : styles.canvasViewportFilled
                    }`}
                    style={
                      {
                        backgroundColor: previewBackgroundColor,
                      }
                    }
                  >
                    {frames.length === 0 ? (
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
                    ) : (
                      <div
                        className={styles.previewCanvasStage}
                        style={
                          {
                            width: `${previewCanvasWidth}px`,
                            height: `${previewCanvasHeight}px`,
                          } satisfies React.CSSProperties
                        }
                      >
                        {previewMode === "sprite" ? (
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
                        ) : activeVideoFrame ? (
                          <div className={styles.videoPreviewStage}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={activeVideoFrame.name}
                              className={styles.videoPreviewImage}
                              draggable={false}
                              src={activeVideoFrame.url}
                            />
                            <div className={styles.videoPreviewMeta}>
                              <span>
                                {videoFrameIndex + 1}/{frames.length}
                              </span>
                              <span>{activeVideoFrame.name}</span>
                            </div>
                            <div className={styles.videoPreviewControls}>
                              <button
                                aria-label="Previous frame"
                                className={styles.videoPreviewControl}
                                onClick={() => stepVideoFrame(-1)}
                                type="button"
                              >
                                <FaStepBackward aria-hidden="true" />
                              </button>
                              <button
                                aria-label={isVideoPlaying ? "Pause" : "Play"}
                                className={styles.videoPreviewControl}
                                onClick={toggleVideoPlayback}
                                type="button"
                              >
                                {isVideoPlaying ? (
                                  <FaPause aria-hidden="true" />
                                ) : (
                                  <FaPlay aria-hidden="true" />
                                )}
                              </button>
                              <button
                                aria-label="Next frame"
                                className={styles.videoPreviewControl}
                                onClick={() => stepVideoFrame(1)}
                                type="button"
                              >
                                <FaStepForward aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.zoomBar}>
                  <div className={styles.zoomControls}>
                    <div className={styles.previewControlsColumn}>
                      <div className={styles.previewModeRow}>
                        <div
                          aria-label={t("preview.mode")}
                          className={styles.previewModeSwitch}
                          role="tablist"
                        >
                          <button
                            className={`${styles.previewModeButton} ${
                              previewMode === "sprite" ? styles.previewModeButtonActive : ""
                            }`}
                            onClick={() => activatePreviewMode("sprite")}
                            aria-label={t("preview.spriteMode")}
                            type="button"
                          >
                            <BsGrid3X3GapFill aria-hidden="true" />
                          </button>
                          <button
                            className={`${styles.previewModeButton} ${
                              previewMode === "video" ? styles.previewModeButtonActive : ""
                            }`}
                            onClick={() => activatePreviewMode("video")}
                            aria-label={t("preview.videoMode")}
                            type="button"
                          >
                            <BsCameraVideoFill aria-hidden="true" />
                          </button>
                        </div>
                        <div className={styles.previewModeFieldWrap}>
                          {previewMode === "video" ? (
                            <>
                              <label className={styles.previewFpsField} htmlFor="preview-fps">
                                <span>{t("preview.fps")}</span>
                                <input
                                  id="preview-fps"
                                  max={120}
                                  min={1}
                                  onBlur={(event) => {
                                    const trimmedValue = event.target.value.trim();
                                    const nextValue =
                                      trimmedValue === ""
                                        ? 24
                                        : clamp(Number(trimmedValue), 1, 120);
                                    setVideoFps(nextValue);
                                    setVideoFpsInput(String(nextValue));
                                  }}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === "") {
                                      setVideoFpsInput("");
                                      return;
                                    }

                                    if (!/^\d+$/.test(nextValue)) {
                                      return;
                                    }

                                    setVideoFpsInput(nextValue);
                                    setVideoFps(clamp(Number(nextValue), 1, 120));
                                  }}
                                  type="number"
                                  value={videoFpsInput}
                                />
                              </label>
                              <input
                                className={styles.zoomSlider}
                                id="preview-fps-slider"
                                max={120}
                                min={1}
                                onChange={(event) => {
                                  const nextValue = clamp(Number(event.target.value), 1, 120);
                                  setVideoFps(nextValue);
                                  setVideoFpsInput(String(nextValue));
                                }}
                                type="range"
                                value={videoFps}
                              />
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
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

              <section className={`${styles.tabPanel} ${styles.splitPanel}`} role="tabpanel">
                <div className={styles.splitWorkspace}>
                  <div className={styles.canvasToolbar}>
                    <div className={styles.controlsInline}>
                      <label className={styles.field}>
                        <span>{t("split.mode")}</span>
                        <select
                          onChange={(event) => setSplitMode(event.target.value as SplitMode)}
                          value={splitMode}
                        >
                          <option value="grid">{t("split.modes.grid")}</option>
                          <option value="size">{t("split.modes.size")}</option>
                          <option value="smart">{t("split.modes.smart")}</option>
                        </select>
                      </label>

                      {splitMode === "grid" ? (
                        <>
                          <label className={styles.field}>
                            <span>{t("split.rows")}</span>
                            <input
                              min={1}
                              onBlur={(event) =>
                                commitSplitGridInput(
                                  event.target.value,
                                  setSplitRows,
                                  setSplitRowsInput,
                                )
                              }
                              onChange={(event) => {
                                const nextValue = event.target.value;

                                if (nextValue === "") {
                                  setSplitRowsInput("");
                                  return;
                                }

                                if (!/^\d+$/.test(nextValue)) {
                                  return;
                                }

                                setSplitRowsInput(nextValue);
                                setSplitRows(clamp(Number(nextValue), 1, 128));
                              }}
                              type="number"
                              value={splitRowsInput}
                            />
                          </label>
                          <label className={styles.field}>
                            <span>{t("split.columns")}</span>
                            <input
                              min={1}
                              onBlur={(event) =>
                                commitSplitGridInput(
                                  event.target.value,
                                  setSplitColumns,
                                  setSplitColumnsInput,
                                )
                              }
                              onChange={(event) => {
                                const nextValue = event.target.value;

                                if (nextValue === "") {
                                  setSplitColumnsInput("");
                                  return;
                                }

                                if (!/^\d+$/.test(nextValue)) {
                                  return;
                                }

                                setSplitColumnsInput(nextValue);
                                setSplitColumns(clamp(Number(nextValue), 1, 128));
                              }}
                              type="number"
                              value={splitColumnsInput}
                            />
                          </label>
                        </>
                      ) : null}

                      {splitMode === "size" ? (
                        <>
                          <label className={styles.field}>
                            <span>{t("split.cellWidth")}</span>
                            <input
                              min={0}
                              onBlur={(event) =>
                                commitSplitSizeInput(
                                  event.target.value,
                                  setSplitCellWidth,
                                  setSplitCellWidthInput,
                                )
                              }
                              onChange={(event) => {
                                const nextValue = event.target.value;

                                if (nextValue === "") {
                                  setSplitCellWidth(0);
                                  setSplitCellWidthInput("");
                                  return;
                                }

                                if (!/^\d+$/.test(nextValue)) {
                                  return;
                                }

                                setSplitCellWidthInput(nextValue);
                                setSplitCellWidth(
                                  Number(nextValue) === 0
                                    ? 0
                                    : clamp(
                                        Number(nextValue),
                                        MIN_SPLIT_CELL_SIZE,
                                        MAX_SPLIT_CELL_SIZE,
                                      ),
                                );
                              }}
                              type="number"
                              value={splitCellWidthInput}
                            />
                          </label>
                          <label className={styles.field}>
                            <span>{t("split.cellHeight")}</span>
                            <input
                              min={0}
                              onBlur={(event) =>
                                commitSplitSizeInput(
                                  event.target.value,
                                  setSplitCellHeight,
                                  setSplitCellHeightInput,
                                )
                              }
                              onChange={(event) => {
                                const nextValue = event.target.value;

                                if (nextValue === "") {
                                  setSplitCellHeight(0);
                                  setSplitCellHeightInput("");
                                  return;
                                }

                                if (!/^\d+$/.test(nextValue)) {
                                  return;
                                }

                                setSplitCellHeightInput(nextValue);
                                setSplitCellHeight(
                                  Number(nextValue) === 0
                                    ? 0
                                    : clamp(
                                        Number(nextValue),
                                        MIN_SPLIT_CELL_SIZE,
                                        MAX_SPLIT_CELL_SIZE,
                                      ),
                                );
                              }}
                              type="number"
                              value={splitCellHeightInput}
                            />
                          </label>
                        </>
                      ) : null}

                      {splitMode === "smart" ? (
                        <>
                          <label className={styles.field}>
                            <span>{t("split.alphaThreshold")}</span>
                            <input
                              max={255}
                              min={0}
                              onChange={(event) =>
                                setSplitAlphaThreshold(clamp(Number(event.target.value), 0, 255))
                              }
                              type="number"
                              value={splitAlphaThreshold}
                            />
                          </label>
                          <label className={styles.field}>
                            <span>{t("split.minArea")}</span>
                            <input
                              min={1}
                              onChange={(event) =>
                                setSplitMinArea(clamp(Number(event.target.value), 1, 1000000))
                              }
                              type="number"
                              value={splitMinArea}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>

                    <div className={styles.toolbarActions}>
                      <button
                        className={styles.tertiaryAction}
                        disabled={!splitSource}
                        onClick={clearSplitSource}
                        type="button"
                      >
                        {t("actions.clear")}
                      </button>
                      <button
                        className={styles.exportButton}
                        disabled={!splitSource}
                        onClick={runSplit}
                        type="button"
                      >
                        {t("split.run")}
                      </button>
                    </div>
                  </div>

                  <div className={styles.previewFrame}>
                    <div
                      className={`${styles.canvasViewport} ${styles.splitCanvasViewport}`}
                      style={
                        splitSource
                          ? {
                              backgroundColor: previewBackgroundColor,
                              width: `${splitPreviewWidth}px`,
                              height: `${splitPreviewHeight}px`,
                            }
                          : {
                              backgroundColor: previewBackgroundColor,
                            }
                      }
                    >
                      {splitSource ? (
                        <div
                          className={styles.splitPreviewCanvas}
                          style={{
                            width: `${splitPreviewWidth}px`,
                            height: `${splitPreviewHeight}px`,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={splitSource.name}
                            className={styles.splitPreviewImage}
                            draggable={false}
                            height={splitPreviewHeight}
                            src={splitSource.url}
                            style={{
                              width: `${splitPreviewWidth}px`,
                              height: `${splitPreviewHeight}px`,
                            }}
                            width={splitPreviewWidth}
                          />

                          {splitPreviewSlices.map((slice, index) => (
                            <div
                              className={styles.splitSliceOverlay}
                              key={slice.id}
                              style={{
                                left: `${slice.x * splitPreviewScaleX}px`,
                                top: `${slice.y * splitPreviewScaleY}px`,
                                width: `${slice.width * splitPreviewScaleX}px`,
                                height: `${slice.height * splitPreviewScaleY}px`,
                              }}
                            >
                              <span className={styles.splitSliceIndex}>{index + 1}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyPreview}>
                          <p className={styles.emptyPreviewTitle}>{t("split.emptyTitle")}</p>
                          <p className={styles.emptyPreviewCopy}>{t("split.emptyDescription")}</p>
                          <label className={styles.emptyPreviewAction}>
                            <input
                              accept="image/*"
                              className={styles.hiddenInput}
                              onChange={handleInputChange}
                              type="file"
                            />
                            {t("emptyPreview.action")}
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.zoomBar}>
                    <div className={styles.zoomControls}>
                      <div className={styles.previewControlsColumn}>
                        <label className={styles.zoomLabel} htmlFor="split-preview-zoom">
                          <span>{t("preview.zoom")}</span>
                          <span>{previewZoom}%</span>
                        </label>
                        <input
                          className={styles.zoomSlider}
                          id="split-preview-zoom"
                          max={200}
                          min={40}
                          onChange={(event) => setPreviewZoom(Number(event.target.value))}
                          type="range"
                          value={previewZoom}
                        />
                        <div className={styles.infoPanel}>
                          <p className={styles.panelEyebrow}>{t("split.infoTitle")}</p>
                          <div className={styles.infoGrid}>
                            <InfoCard
                              label={t("split.sliceCount")}
                              value={String(splitPreviewSlices.length)}
                            />
                            <InfoCard
                              label={t("split.sourceSize")}
                              value={
                                splitSource
                                  ? `${splitSource.width} x ${splitSource.height}`
                                  : "-"
                              }
                            />
                            <InfoCard
                              label={t("split.mode")}
                              value={t(
                                `split.modes.${
                                  splitExecutionConfig?.mode ?? splitMode
                                }`,
                              )}
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

                  <div className={styles.splitResultsPanel}>
                    <div className={styles.splitResultsHeader}>
                      <p className={styles.panelEyebrow}>{t("split.resultsTitle")}</p>
                      <button
                        className={styles.secondaryAction}
                        disabled={splitSlices.length === 0}
                        onClick={exportAllSplitSlices}
                        type="button"
                      >
                        {t("split.downloadAll")}
                      </button>
                    </div>
                    {splitSlices.length > 0 ? (
                      <div className={styles.splitResultsGrid}>
                        {splitSlices.map((slice, index) => (
                          <div className={styles.splitResultCard} key={slice.id}>
                            <div className={styles.splitResultPreviewWrap}>
                              {slice.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  alt={`${splitSource?.name ?? "slice"} ${index + 1}`}
                                  className={styles.splitResultPreview}
                                  draggable={false}
                                  height={slice.height}
                                  src={slice.previewUrl}
                                  width={slice.width}
                                />
                              ) : null}
                              <div className={styles.splitResultOverlay}>
                                <button
                                  aria-label={t("split.downloadSlice")}
                                  className={`${styles.splitResultAction} ${styles.splitResultDownload}`}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    exportSplitSlice(slice);
                                  }}
                                  type="button"
                                >
                                  <FaDownload aria-hidden="true" />
                                </button>
                                <button
                                  aria-label={t("actions.delete")}
                                  className={`${styles.splitResultAction} ${styles.splitResultDelete}`}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    removeSplitSlice(slice.id);
                                  }}
                                  type="button"
                                >
                                  <FaTrashAlt aria-hidden="true" />
                                </button>
                                <div className={styles.splitResultContent}>
                                  <span className={styles.splitResultMeta}>
                                    {slice.width} x {slice.height}
                                  </span>
                                  <span className={styles.splitResultPosition}>
                                    {slice.x}, {slice.y}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <span className={styles.splitResultIndex}>#{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.splitResultsEmpty}>{t("split.noSlices")}</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
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

async function createSplitSource(file: File): Promise<SplitSource> {
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

function createGridSplitSlices(
  source: SplitSource,
  rows: number,
  columns: number,
): SplitSlice[] {
  const normalizedRows = Math.max(1, rows);
  const normalizedColumns = Math.max(1, columns);
  const cellWidth = Math.floor(source.width / normalizedColumns);
  const cellHeight = Math.floor(source.height / normalizedRows);
  const slices: SplitSlice[] = [];
  const alphaData = getSourceAlphaData(source);

  for (let row = 0; row < normalizedRows; row += 1) {
    for (let column = 0; column < normalizedColumns; column += 1) {
      const x = column * cellWidth;
      const y = row * cellHeight;
      const width =
        column === normalizedColumns - 1 ? source.width - x : cellWidth;
      const height = row === normalizedRows - 1 ? source.height - y : cellHeight;

      if (
        width > 0 &&
        height > 0 &&
        hasVisiblePixels(alphaData, source.width, x, y, width, height)
      ) {
        slices.push({
          id: `r${row + 1}-c${column + 1}`,
          x,
          y,
          width,
          height,
        });
      }
    }
  }

  return slices;
}

function createSizeSplitSlices(
  source: SplitSource,
  cellWidth: number,
  cellHeight: number,
): SplitSlice[] {
  if (cellWidth <= 0 || cellHeight <= 0) {
    return [];
  }

  const normalizedWidth = cellWidth;
  const normalizedHeight = cellHeight;
  const slices: SplitSlice[] = [];
  const alphaData = getSourceAlphaData(source);

  for (let y = 0; y < source.height; y += normalizedHeight) {
    for (let x = 0; x < source.width; x += normalizedWidth) {
      const width = Math.min(normalizedWidth, source.width - x);
      const height = Math.min(normalizedHeight, source.height - y);

      if (hasVisiblePixels(alphaData, source.width, x, y, width, height)) {
        slices.push({
          id: `x${x}-y${y}`,
          x,
          y,
          width,
          height,
        });
      }
    }
  }

  return slices;
}

function createSmartSplitSlices(
  source: SplitSource,
  alphaThreshold: number,
  minArea: number,
): SplitSlice[] {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return [];
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const visited = new Uint8Array(width * height);
  const slices: SplitSlice[] = [];
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (visited[index] || getAlphaAt(data, index) <= alphaThreshold) {
        continue;
      }

      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      visited[index] = 1;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;

      while (head < tail) {
        const currentX = queueX[head];
        const currentY = queueY[head];
        head += 1;
        pixelCount += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ];

        for (const [neighborX, neighborY] of neighbors) {
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= width ||
            neighborY >= height
          ) {
            continue;
          }

          const neighborIndex = neighborY * width + neighborX;

          if (
            visited[neighborIndex] ||
            getAlphaAt(data, neighborIndex) <= alphaThreshold
          ) {
            continue;
          }

          visited[neighborIndex] = 1;
          queueX[tail] = neighborX;
          queueY[tail] = neighborY;
          tail += 1;
        }
      }

      const sliceWidth = maxX - minX + 1;
      const sliceHeight = maxY - minY + 1;
      const area = sliceWidth * sliceHeight;

      if (pixelCount >= minArea && area >= minArea) {
        slices.push({
          id: `slice-${slices.length + 1}`,
          x: minX,
          y: minY,
          width: sliceWidth,
          height: sliceHeight,
          pixelCount,
        });
      }
    }
  }

  return slices.sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }

    return left.x - right.x;
  });
}

function getAlphaAt(data: Uint8ClampedArray, pixelIndex: number) {
  return data[pixelIndex * 4 + 3] ?? 0;
}

function getSourceAlphaData(source: SplitSource) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function hasVisiblePixels(
  alphaData: Uint8ClampedArray | null,
  sourceWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!alphaData) {
    return true;
  }

  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const pixelIndex = row * sourceWidth + column;

      if (getAlphaAt(alphaData, pixelIndex) > 0) {
        return true;
      }
    }
  }

  return false;
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function getSplitSliceExportIndex(slices: SplitSlice[], sliceId: string) {
  const index = slices.findIndex((slice) => slice.id === sliceId);
  return index >= 0 ? index : 0;
}

function createSplitSliceCanvas(
  source: SplitSource,
  slice: SplitSlice,
  backgroundColor: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = slice.width;
  canvas.height = slice.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  if (backgroundColor !== TRANSPARENT_PREVIEW_BACKGROUND) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(
    source.image,
    slice.x,
    slice.y,
    slice.width,
    slice.height,
    0,
    0,
    slice.width,
    slice.height,
  );

  return canvas;
}

async function createSplitSliceBlob(
  source: SplitSource,
  slice: SplitSlice,
  backgroundColor: string,
) {
  const canvas = createSplitSliceCanvas(source, slice, backgroundColor);

  if (!canvas) {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function createSlicePreviewUrl(source: SplitSource, slice: SplitSlice) {
  const canvas = document.createElement("canvas");
  canvas.width = slice.width;
  canvas.height = slice.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return "";
  }

  ctx.drawImage(
    source.image,
    slice.x,
    slice.y,
    slice.width,
    slice.height,
    0,
    0,
    slice.width,
    slice.height,
  );

  return canvas.toDataURL("image/png");
}
