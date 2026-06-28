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
} from "@dnd-kit/sortable";
import JSZip from "jszip";
import { decompressFrames, parseGIF } from "gifuct-js";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BsCameraVideoFill, BsGrid3X3GapFill } from "react-icons/bs";
import { FaPause, FaPlay, FaStepBackward, FaStepForward } from "react-icons/fa";
import { FaDownload, FaTrashAlt } from "react-icons/fa";
import { PiRectangleDashedDuotone } from "react-icons/pi";
import ImageCarousel from "./ImageCarousel";
import styles from "./SpriteEditor.module.css";
import {
  FileNameSegmentField,
  InfoCard,
  PreviewBackgroundColorPanel,
  SelectField,
  SortablePreviewTile,
} from "./sprite-editor/SpriteEditorParts";
import type {
  DirectoryInputProps,
  FileNameSegmentConfig,
  FileNameSegmentOption,
  FrameEditAspectPreset,
  FrameEditProcessMode,
  FrameExtractPreviewMode,
  FrameExtractSource,
  MergeFrame,
  PreviewMode,
  SplitExecutionConfig,
  SplitMode,
  SplitPreviewMode,
  SplitSlice,
  SplitSource,
  SpriteEditorTab,
  ViewportSize,
} from "./sprite-editor/shared";

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

type MediaInfoFactoryFn = (options?: {
  format?: "object";
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<{
  analyzeData: (
    size: () => number,
    readChunk: (chunkSize: number, offset: number) => Promise<Uint8Array>,
  ) => Promise<{
    media?: {
      track?: Array<{
        "@type"?: string;
        FrameRate?: number;
      }>;
    };
  }>;
  close: () => void;
}>;

declare global {
  interface Window {
    MediaInfo?: {
      mediaInfoFactory?: MediaInfoFactoryFn;
    };
  }
}

let mediaInfoFactoryPromise: Promise<MediaInfoFactoryFn | null> | null = null;


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
const DEFAULT_PREFIX_SEGMENT: FileNameSegmentConfig = {
  type: "none",
  customValue: "",
};

const DEFAULT_MIDDLE_SEGMENT: FileNameSegmentConfig = {
  type: "originalName",
  customValue: "",
};

const DEFAULT_SUFFIX_SEGMENT: FileNameSegmentConfig = {
  type: "frameIndex",
  customValue: "",
};

const DEFAULT_SPLIT_NAME_SEGMENT: FileNameSegmentConfig = {
  type: "originalName",
  customValue: "",
};

const FRAME_EDIT_RESOLUTION_OPTIONS = [0, 256, 512, 1024, 2048, 3072, 4096] as const;
const FRAME_EDIT_ASPECT_RATIO_MAP: Record<
  Exclude<FrameEditAspectPreset, "none">,
  { width: number; height: number }
> = {
  "1:1": { width: 1, height: 1 },
  "4:3": { width: 4, height: 3 },
  "3:4": { width: 3, height: 4 },
  "16:9": { width: 16, height: 9 },
  "9:16": { width: 9, height: 16 },
};

let lastSpriteEditorTab: SpriteEditorTab | null = null;

export default function SpriteEditor() {
  const t = useTranslations("spriteEditor");
  const pathname = usePathname();
  const framesRef = useRef<MergeFrame[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragDepthRef = useRef(0);
  const mergeViewportRef = useRef<HTMLDivElement | null>(null);
  const splitViewportRef = useRef<HTMLDivElement | null>(null);
  const frameExtractViewportRef = useRef<HTMLDivElement | null>(null);
  const frameEditViewportRef = useRef<HTMLDivElement | null>(null);
  const frameExtractPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frames, setFrames] = useState<MergeFrame[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [columnsInput, setColumnsInput] = useState(String(DEFAULT_COLUMNS));
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [isDragging, setIsDragging] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">(
    "png",
  );
  const [fileNamePrefix, setFileNamePrefix] =
    useState<FileNameSegmentConfig>(DEFAULT_PREFIX_SEGMENT);
  const [fileNameMiddle, setFileNameMiddle] =
    useState<FileNameSegmentConfig>(DEFAULT_MIDDLE_SEGMENT);
  const [fileNameSuffix, setFileNameSuffix] =
    useState<FileNameSegmentConfig>(DEFAULT_SUFFIX_SEGMENT);
  const [splitFileName, setSplitFileName] =
    useState<FileNameSegmentConfig>(DEFAULT_SPLIT_NAME_SEGMENT);
  const [splitExportFormat, setSplitExportFormat] =
    useState<"png" | "jpeg" | "webp">("png");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sprite");
  const [splitPreviewMode, setSplitPreviewMode] = useState<SplitPreviewMode>("preview");
  const [frameExtractPreviewMode, setFrameExtractPreviewMode] =
    useState<FrameExtractPreviewMode>("video");
  const [videoFps, setVideoFps] = useState(24);
  const [videoFpsInput, setVideoFpsInput] = useState("24");
  const [videoFrameIndex, setVideoFrameIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [splitVideoFps, setSplitVideoFps] = useState(24);
  const [splitVideoFpsInput, setSplitVideoFpsInput] = useState("24");
  const [splitVideoFrameIndex, setSplitVideoFrameIndex] = useState(0);
  const [isSplitVideoPlaying, setIsSplitVideoPlaying] = useState(false);
  const [frameExtractVideoFrameIndex, setFrameExtractVideoFrameIndex] = useState(0);
  const [isFrameExtractVideoPlaying, setIsFrameExtractVideoPlaying] = useState(false);
  const [frameEditAspectPreset, setFrameEditAspectPreset] =
    useState<FrameEditAspectPreset>("1:1");
  const [frameEditProcessMode, setFrameEditProcessMode] =
    useState<FrameEditProcessMode>("scale");
  const [frameEditResolution, setFrameEditResolution] = useState(1024);
  const [frameEditWidthInput, setFrameEditWidthInput] = useState("1024");
  const [frameEditHeightInput, setFrameEditHeightInput] = useState("1024");
  const [frameEditFillColor, setFrameEditFillColor] = useState<string>(
    TRANSPARENT_PREVIEW_BACKGROUND,
  );
  const [frameEditFillPickerColor, setFrameEditFillPickerColor] = useState(
    `${DEFAULT_PREVIEW_BACKGROUND}ff`,
  );
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
  const frameExtractSourceRef = useRef<FrameExtractSource | null>(null);
  const [frameExtractSource, setFrameExtractSource] = useState<FrameExtractSource | null>(null);
  const [frameExtractFps, setFrameExtractFps] = useState(12);
  const [frameExtractUseSourceFps, setFrameExtractUseSourceFps] = useState(true);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [mergeViewportSize, setMergeViewportSize] = useState<ViewportSize>({
    width: PREVIEW_MAX_WIDTH,
    height: PREVIEW_MAX_HEIGHT,
  });
  const [splitViewportSize, setSplitViewportSize] = useState<ViewportSize>({
    width: PREVIEW_MAX_WIDTH,
    height: PREVIEW_MAX_HEIGHT,
  });
  const [frameExtractViewportSize, setFrameExtractViewportSize] = useState<ViewportSize>({
    width: PREVIEW_MAX_WIDTH,
    height: PREVIEW_MAX_HEIGHT,
  });
  const [frameEditViewportSize, setFrameEditViewportSize] = useState<ViewportSize>({
    width: PREVIEW_MAX_WIDTH,
    height: PREVIEW_MAX_HEIGHT,
  });
  const videoFrameRef = useRef(0);
  const videoTimeRef = useRef(0);
  const splitVideoFrameRef = useRef(0);
  const splitVideoTimeRef = useRef(0);
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
      framesRef.current.forEach((frame) => {
        if (frame.url !== frame.originalUrl) {
          URL.revokeObjectURL(frame.url);
        }
        URL.revokeObjectURL(frame.originalUrl);
      });
      if (splitSourceRef.current) {
        URL.revokeObjectURL(splitSourceRef.current.url);
      }
      if (frameExtractSourceRef.current) {
        URL.revokeObjectURL(frameExtractSourceRef.current.url);
      }
    };
  }, []);

  useEffect(() => observeViewportSize(mergeViewportRef.current, setMergeViewportSize), []);

  useEffect(() => observeViewportSize(splitViewportRef.current, setSplitViewportSize), []);

  useEffect(
    () => observeViewportSize(frameExtractViewportRef.current, setFrameExtractViewportSize),
    [],
  );

  useEffect(
    () => observeViewportSize(frameEditViewportRef.current, setFrameEditViewportSize),
    [],
  );

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

  const activeMergeViewportSize =
    pathname.endsWith("/frame-edit") ? frameEditViewportSize : mergeViewportSize;

  const previewScale = useMemo(() => {
    if (frames.length === 0) {
      return 1;
    }

    const availableWidth = Math.max(1, activeMergeViewportSize.width);
    const availableHeight = Math.max(1, activeMergeViewportSize.height);
    const widthScale =
      mergedMetrics.canvasWidth > 0
        ? availableWidth / mergedMetrics.canvasWidth
        : 1;
    const heightScale =
      mergedMetrics.canvasHeight > 0
        ? availableHeight / mergedMetrics.canvasHeight
        : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [
    activeMergeViewportSize.height,
    activeMergeViewportSize.width,
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
  const frameExtractCarouselItems = useMemo(
    () =>
      previewTiles.map((tile, index) => ({
        id: tile.id,
        image: tile.url,
        subtitle: `${index + 1}/${previewTiles.length}`,
        title: `#${index + 1}`,
      })),
    [previewTiles],
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
  const videoPreviewScale = useMemo(() => {
    if (!activeVideoFrame) {
      return 1;
    }

    const availableWidth = Math.max(1, activeMergeViewportSize.width);
    const availableHeight = Math.max(1, activeMergeViewportSize.height);
    const widthScale =
      activeVideoFrame.width > 0 ? availableWidth / activeVideoFrame.width : 1;
    const heightScale =
      activeVideoFrame.height > 0 ? availableHeight / activeVideoFrame.height : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [
    activeMergeViewportSize.height,
    activeMergeViewportSize.width,
    activeVideoFrame,
    previewZoom,
  ]);
  const videoPreviewWidth = Math.max(
    1,
    Math.round((activeVideoFrame?.width ?? 1) * videoPreviewScale),
  );
  const videoPreviewHeight = Math.max(
    1,
    Math.round((activeVideoFrame?.height ?? 1) * videoPreviewScale),
  );
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

    const availableWidth = Math.max(1, splitViewportSize.width);
    const availableHeight = Math.max(1, splitViewportSize.height);
    const widthScale = splitSource.width > 0 ? availableWidth / splitSource.width : 1;
    const heightScale = splitSource.height > 0 ? availableHeight / splitSource.height : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [previewZoom, splitSource, splitViewportSize.height, splitViewportSize.width]);
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
  const splitVideoFrameDelay = 1000 / Math.max(1, splitVideoFps);
  const activeSplitVideoFrame =
    splitSlices[splitVideoFrameIndex % Math.max(splitSlices.length, 1)] ?? null;
  const splitVideoPreviewScale = useMemo(() => {
    if (!activeSplitVideoFrame) {
      return 1;
    }

    const availableWidth = Math.max(1, splitViewportSize.width);
    const availableHeight = Math.max(1, splitViewportSize.height);
    const widthScale =
      activeSplitVideoFrame.width > 0
        ? availableWidth / activeSplitVideoFrame.width
        : 1;
    const heightScale =
      activeSplitVideoFrame.height > 0
        ? availableHeight / activeSplitVideoFrame.height
        : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [
    activeSplitVideoFrame,
    previewZoom,
    splitViewportSize.height,
    splitViewportSize.width,
  ]);
  const splitVideoPreviewWidth = Math.max(
    1,
    Math.round((activeSplitVideoFrame?.width ?? 1) * splitVideoPreviewScale),
  );
  const splitVideoPreviewHeight = Math.max(
    1,
    Math.round((activeSplitVideoFrame?.height ?? 1) * splitVideoPreviewScale),
  );
  const frameExtractPreviewScale = useMemo(() => {
    if (!frameExtractSource) {
      return 1;
    }

    const availableWidth = Math.max(1, frameExtractViewportSize.width);
    const availableHeight = Math.max(1, frameExtractViewportSize.height);
    const widthScale =
      frameExtractSource.width > 0 ? availableWidth / frameExtractSource.width : 1;
    const heightScale =
      frameExtractSource.height > 0 ? availableHeight / frameExtractSource.height : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [
    frameExtractSource,
    frameExtractViewportSize.height,
    frameExtractViewportSize.width,
    previewZoom,
  ]);
  const frameExtractPreviewWidth = Math.max(
    1,
    Math.round((frameExtractSource?.width ?? 1) * frameExtractPreviewScale),
  );
  const frameExtractPreviewHeight = Math.max(
    1,
    Math.round((frameExtractSource?.height ?? 1) * frameExtractPreviewScale),
  );
  const activeFrameExtractVideoFrame =
    frames[frameExtractVideoFrameIndex % Math.max(frames.length, 1)] ?? null;
  const frameExtractVideoPreviewScale = useMemo(() => {
    if (!activeFrameExtractVideoFrame) {
      return 1;
    }

    const availableWidth = Math.max(1, frameExtractViewportSize.width);
    const availableHeight = Math.max(1, frameExtractViewportSize.height);
    const widthScale =
      activeFrameExtractVideoFrame.width > 0
        ? availableWidth / activeFrameExtractVideoFrame.width
        : 1;
    const heightScale =
      activeFrameExtractVideoFrame.height > 0
        ? availableHeight / activeFrameExtractVideoFrame.height
        : 1;
    const fitScale = Math.min(widthScale, heightScale);

    return fitScale * (previewZoom / 100);
  }, [
    activeFrameExtractVideoFrame,
    frameExtractViewportSize.height,
    frameExtractViewportSize.width,
    previewZoom,
  ]);
  const frameExtractVideoPreviewWidth = Math.max(
    1,
    Math.round((activeFrameExtractVideoFrame?.width ?? 1) * frameExtractVideoPreviewScale),
  );
  const frameExtractVideoPreviewHeight = Math.max(
    1,
    Math.round((activeFrameExtractVideoFrame?.height ?? 1) * frameExtractVideoPreviewScale),
  );
  const fileNamePrefixOptions = useMemo<FileNameSegmentOption[]>(
    () => [
      { value: "none", label: t("naming.nonePrefix") },
      { value: "frameIndex", label: t("naming.frameIndex") },
      { value: "custom", label: t("naming.custom") },
    ],
    [t],
  );
  const fileNameMiddleOptions = useMemo<FileNameSegmentOption[]>(
    () => [
      { value: "none", label: t("naming.none") },
      { value: "originalName", label: t("naming.originalName") },
      { value: "custom", label: t("naming.custom") },
    ],
    [t],
  );
  const fileNameSuffixOptions = useMemo<FileNameSegmentOption[]>(
    () => [
      { value: "frameIndex", label: t("naming.frameIndex") },
      { value: "custom", label: t("naming.custom") },
    ],
    [t],
  );
  const splitFileNameOptions = useMemo<FileNameSegmentOption[]>(
    () => [
      { value: "originalName", label: t("naming.originalName") },
      { value: "custom", label: t("naming.custom") },
    ],
    [t],
  );
  const frameEditAspectOptions = useMemo(
    () => [
      { value: "none" as const, label: t("frameEdit.aspectNone") },
      { value: "1:1" as const, label: "1:1" },
      { value: "4:3" as const, label: "4:3" },
      { value: "3:4" as const, label: "3:4" },
      { value: "16:9" as const, label: "16:9" },
      { value: "9:16" as const, label: "9:16" },
    ],
    [t],
  );
  const frameEditProcessModeOptions = useMemo(
    () => [
      { value: "scale" as const, label: t("frameEdit.processScale") },
      { value: "smartScale" as const, label: t("frameEdit.processSmartScale") },
      { value: "extendOnly" as const, label: t("frameEdit.processExtendOnly") },
    ],
    [t],
  );
  const activeTab: SpriteEditorTab = pathname.endsWith("/split")
    ? "split"
    : pathname.endsWith("/frame-extract")
      ? "frame-extract"
      : pathname.endsWith("/frame-edit")
        ? "frame-edit"
        : "merge";
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

  useEffect(() => {
    if (
      splitPreviewMode !== "video" ||
      splitSlices.length === 0 ||
      !isSplitVideoPlaying
    ) {
      splitVideoTimeRef.current = 0;
      return;
    }

    let animationFrame = 0;
    let isStopped = false;

    const loop = (now: number) => {
      if (isStopped) {
        return;
      }

      if (splitVideoTimeRef.current === 0) {
        splitVideoTimeRef.current = now;
      }

      const elapsed = now - splitVideoTimeRef.current;
      if (elapsed >= splitVideoFrameDelay) {
        const steps = Math.floor(elapsed / splitVideoFrameDelay);
        const nextFrameIndex = (splitVideoFrameRef.current + steps) % splitSlices.length;
        splitVideoFrameRef.current = nextFrameIndex;
        setSplitVideoFrameIndex(nextFrameIndex);
        splitVideoTimeRef.current += steps * splitVideoFrameDelay;
      }

      animationFrame = window.requestAnimationFrame(loop);
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      isStopped = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    isSplitVideoPlaying,
    splitPreviewMode,
    splitSlices.length,
    splitVideoFrameDelay,
  ]);

  useEffect(() => {
    if (
      frameExtractPreviewMode !== "results" ||
      frames.length === 0 ||
      !isFrameExtractVideoPlaying
    ) {
      return;
    }

    let animationFrame = 0;
    let previousTime = 0;
    let isStopped = false;
    const frameDelay = 1000 / Math.max(1, frameExtractFps);

    const loop = (now: number) => {
      if (isStopped) {
        return;
      }

      if (previousTime === 0) {
        previousTime = now;
      }

      const elapsed = now - previousTime;
      if (elapsed >= frameDelay) {
        const steps = Math.floor(elapsed / frameDelay);
        setFrameExtractVideoFrameIndex((current) =>
          frames.length === 0 ? 0 : (current + steps) % frames.length,
        );
        previousTime += steps * frameDelay;
      }

      animationFrame = window.requestAnimationFrame(loop);
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      isStopped = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    frameExtractFps,
    frameExtractPreviewMode,
    frames.length,
    isFrameExtractVideoPlaying,
  ]);

  useEffect(() => {
    if (frameExtractPreviewMode !== "results" || !activeFrameExtractVideoFrame) {
      return;
    }

    const canvas = frameExtractPreviewCanvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    canvas.width = Math.max(1, activeFrameExtractVideoFrame.width);
    canvas.height = Math.max(1, activeFrameExtractVideoFrame.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      activeFrameExtractVideoFrame.image,
      0,
      0,
      activeFrameExtractVideoFrame.width,
      activeFrameExtractVideoFrame.height,
    );
  }, [activeFrameExtractVideoFrame, frameExtractPreviewMode]);

  async function handleMergeInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadFiles(event.target.files);
    }

    event.target.value = "";
  }

  async function handleSplitInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadSplitSource(event.target.files);
    }

    event.target.value = "";
  }

  async function handleFrameExtractInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      await loadFrameExtractSource(event.target.files);
    }

    event.target.value = "";
  }

  async function handleFrameEditInputChange(event: ChangeEvent<HTMLInputElement>) {
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

  async function loadFrameExtractSource(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList).filter(isSupportedFrameExtractFile);
    const sourceFile = incomingFiles[0];

    if (!sourceFile) {
      return;
    }

    const nextSource = await createFrameExtractSource(sourceFile);

    if (frameExtractSourceRef.current) {
      URL.revokeObjectURL(frameExtractSourceRef.current.url);
    }

    frameExtractSourceRef.current = nextSource;
    setFrameExtractSource(nextSource);
    setFrameExtractFps(clamp(Math.round(nextSource.fps), 1, Math.max(1, Math.round(nextSource.fps))));
    setFrameExtractUseSourceFps(nextSource.type === "video");
  }

  function activatePreviewMode(mode: PreviewMode) {
    setPreviewMode(mode);

    if (mode === "video") {
      videoFrameRef.current = 0;
      videoTimeRef.current = 0;
      setVideoFrameIndex(0);
      setVideoFpsInput(String(videoFps));
      setIsVideoPlaying(false);
    }
  }

  function activateSplitPreviewMode(mode: SplitPreviewMode) {
    setSplitPreviewMode(mode);

    if (mode === "video") {
      splitVideoFrameRef.current = 0;
      splitVideoTimeRef.current = 0;
      setSplitVideoFrameIndex(0);
      setSplitVideoFpsInput(String(splitVideoFps));
      setIsSplitVideoPlaying(false);
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

  function goToSplitVideoFrame(nextIndex: number) {
    if (splitSlices.length === 0) {
      return;
    }

    const normalizedIndex =
      ((nextIndex % splitSlices.length) + splitSlices.length) % splitSlices.length;
    splitVideoFrameRef.current = normalizedIndex;
    splitVideoTimeRef.current = 0;
    setSplitVideoFrameIndex(normalizedIndex);
  }

  function stepSplitVideoFrame(direction: 1 | -1) {
    goToSplitVideoFrame(splitVideoFrameIndex + direction);
    setIsSplitVideoPlaying(false);
  }

  function toggleSplitVideoPlayback() {
    setIsSplitVideoPlaying((current) => !current);
    splitVideoTimeRef.current = 0;
  }

  function activateFrameExtractPreviewMode(mode: FrameExtractPreviewMode) {
    setFrameExtractPreviewMode(mode);

    if (mode === "video") {
      setIsFrameExtractVideoPlaying(false);
      setFrameExtractVideoFrameIndex(0);
    }
  }

  function goToFrameExtractVideoFrame(nextIndex: number) {
    if (frames.length === 0) {
      return;
    }

    const normalizedIndex = ((nextIndex % frames.length) + frames.length) % frames.length;
    setFrameExtractVideoFrameIndex(normalizedIndex);
  }

  function stepFrameExtractVideoFrame(direction: 1 | -1) {
    goToFrameExtractVideoFrame(frameExtractVideoFrameIndex + direction);
    setIsFrameExtractVideoPlaying(false);
  }

  function toggleFrameExtractVideoPlayback() {
    setIsFrameExtractVideoPlaying((current) => !current);
  }

  function applyFrameExtractSourceFps() {
    if (!frameExtractSource) {
      return;
    }

    const nextFps = Math.max(1, Math.round(frameExtractSource.fps));
    setFrameExtractFps(nextFps);
    setFrameExtractUseSourceFps(true);
  }

  function handleFrameExtractFpsChange(nextValue: number) {
    const safeValue = clamp(nextValue, 1, frameExtractFpsMax);
    setFrameExtractFps(safeValue);
    setFrameExtractUseSourceFps(false);
  }

  const isFrameExtractSamplingEnabled = frameExtractSource?.type === "video";
  const frameExtractFpsMax = Math.max(
    1,
    Math.round(
      frameExtractSource?.type === "video" ? (frameExtractSource.fps || 24) : frameExtractFps,
    ),
  );

  function clearFrames() {
    framesRef.current.forEach((frame) => {
      if (frame.url !== frame.originalUrl) {
        URL.revokeObjectURL(frame.url);
      }
      URL.revokeObjectURL(frame.originalUrl);
    });
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
    splitVideoFrameRef.current = 0;
    splitVideoTimeRef.current = 0;
    setSplitPreviewMode("preview");
    setSplitVideoFrameIndex(0);
    setIsSplitVideoPlaying(false);
  }

  function clearFrameExtractSource() {
    if (frameExtractSourceRef.current) {
      URL.revokeObjectURL(frameExtractSourceRef.current.url);
      frameExtractSourceRef.current = null;
    }

    setFrameExtractSource(null);
    setIsExtractingFrames(false);
    setFrameExtractFps(12);
    setFrameExtractUseSourceFps(true);
    setFrameExtractPreviewMode("video");
    setFrameExtractVideoFrameIndex(0);
    setIsFrameExtractVideoPlaying(false);
  }

  function applyFrameEditDimensions(
    aspectPreset: FrameEditAspectPreset,
    resolution: number,
  ) {
    if (aspectPreset === "none" || resolution <= 0) {
      return;
    }

    const ratio = FRAME_EDIT_ASPECT_RATIO_MAP[aspectPreset];
    const base = resolution / Math.max(ratio.width, ratio.height);
    const nextWidth = Math.max(1, Math.round(ratio.width * base));
    const nextHeight = Math.max(1, Math.round(ratio.height * base));
    setFrameEditWidthInput(String(nextWidth));
    setFrameEditHeightInput(String(nextHeight));
  }

  async function extractFramesFromSource() {
    if (!frameExtractSource || isExtractingFrames) {
      return;
    }

    setIsExtractingFrames(true);

    try {
      const nextFrames =
        frameExtractSource.type === "gif"
          ? await extractGifFrames(frameExtractSource.file)
          : await extractVideoFrames(frameExtractSource.file, frameExtractFps);

      if (nextFrames.length === 0) {
        return;
      }

      framesRef.current.forEach((frame) => {
        if (frame.url !== frame.originalUrl) {
          URL.revokeObjectURL(frame.url);
        }
        URL.revokeObjectURL(frame.originalUrl);
      });

      framesRef.current = nextFrames;
      setFrames(nextFrames);
      videoFrameRef.current = 0;
      videoTimeRef.current = 0;
      setVideoFrameIndex(0);
      setFrameExtractVideoFrameIndex(0);
      setIsFrameExtractVideoPlaying(false);
      setFrameExtractPreviewMode("results");
    } finally {
      setIsExtractingFrames(false);
    }
  }

  function handleFrameEditAspectChange(nextPreset: FrameEditAspectPreset) {
    setFrameEditAspectPreset(nextPreset);
    if (nextPreset !== "none" && frameEditResolution > 0) {
      applyFrameEditDimensions(nextPreset, frameEditResolution);
    }
  }

  function handleFrameEditResolutionChange(nextResolution: number) {
    setFrameEditResolution(nextResolution);
    if (nextResolution > 0 && frameEditAspectPreset !== "none") {
      applyFrameEditDimensions(frameEditAspectPreset, nextResolution);
    }
  }

  function getFrameEditResolutionLabel(value: number) {
    if (value <= 0) {
      return t("frameEdit.resolutionNone");
    }

    if (value < 1024) {
      return String(value);
    }

    return `${value / 1024}K`;
  }

  function applyFrameEditFillColor(color: string) {
    setFrameEditFillColor(color);

    if (color !== TRANSPARENT_PREVIEW_BACKGROUND) {
      setFrameEditFillPickerColor(color);
    }
  }

  function handleFrameEditWidthChange(nextValue: string) {
    if (nextValue !== "" && !/^\d+$/.test(nextValue)) {
      return;
    }

    setFrameEditWidthInput(nextValue);
    setFrameEditAspectPreset("none");
    setFrameEditResolution(0);
  }

  function handleFrameEditHeightChange(nextValue: string) {
    if (nextValue !== "" && !/^\d+$/.test(nextValue)) {
      return;
    }

    setFrameEditHeightInput(nextValue);
    setFrameEditAspectPreset("none");
    setFrameEditResolution(0);
  }

  async function processFrameEditResize() {
    if (frames.length === 0) {
      return;
    }

    const nextWidth = clamp(Number(frameEditWidthInput || "0"), 1, 4096);
    const nextHeight = clamp(Number(frameEditHeightInput || "0"), 1, 4096);

    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
      return;
    }

    const resizedFrames = await Promise.all(
      frames.map(async (frame) => {
        const sourceImage = frame.originalImage;
        const extendOnlyTargetWidth =
          frameEditProcessMode === "extendOnly"
            ? Math.max(nextWidth, sourceImage.width)
            : nextWidth;
        const extendOnlyTargetHeight =
          frameEditProcessMode === "extendOnly"
            ? Math.max(nextHeight, sourceImage.height)
            : nextHeight;
        const canvas = document.createElement("canvas");
        canvas.width = extendOnlyTargetWidth;
        canvas.height = extendOnlyTargetHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          return frame;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (frameEditProcessMode === "scale") {
          ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
        } else {
          if (frameEditFillColor !== TRANSPARENT_PREVIEW_BACKGROUND) {
            ctx.fillStyle = frameEditFillColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          const focusRect =
            frameEditProcessMode === "smartScale"
              ? detectFrameSubjectBounds(sourceImage, frameEditFillColor)
              : null;
          const sourceWidth = focusRect?.width ?? frame.originalImage.width;
          const sourceHeight = focusRect?.height ?? frame.originalImage.height;
          const widthScale = canvas.width / sourceWidth;
          const heightScale = canvas.height / sourceHeight;
          const scale =
            frameEditProcessMode === "extendOnly"
              ? 1
              : Math.min(widthScale, heightScale);
          const drawWidth = Math.max(
            1,
            Math.round(
              frameEditProcessMode === "extendOnly"
                ? Math.min(sourceWidth, nextWidth)
                : sourceWidth * scale,
            ),
          );
          const drawHeight = Math.max(
            1,
            Math.round(
              frameEditProcessMode === "extendOnly"
                ? Math.min(sourceHeight, nextHeight)
                : sourceHeight * scale,
            ),
          );
          const offsetX = Math.floor((canvas.width - drawWidth) / 2);
          const offsetY = Math.floor((canvas.height - drawHeight) / 2);

          if (focusRect) {
            ctx.drawImage(
              sourceImage,
              focusRect.x,
              focusRect.y,
              Math.min(focusRect.width, drawWidth),
              Math.min(focusRect.height, drawHeight),
              offsetX,
              offsetY,
              drawWidth,
              drawHeight,
            );
          } else {
            ctx.drawImage(
              sourceImage,
              0,
              0,
              Math.min(sourceImage.width, drawWidth),
              Math.min(sourceImage.height, drawHeight),
              offsetX,
              offsetY,
              drawWidth,
              drawHeight,
            );
          }
        }

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((value) => resolve(value), "image/png");
        });

        if (!blob) {
          return frame;
        }

        const nextUrl = URL.createObjectURL(blob);
        const nextImage = await loadImage(nextUrl);
        if (frame.url !== frame.originalUrl) {
          URL.revokeObjectURL(frame.url);
        }

        return {
          ...frame,
          url: nextUrl,
          image: nextImage,
          width: canvas.width,
          height: canvas.height,
        };
      }),
    );

    framesRef.current = resizedFrames;
    setFrames(resizedFrames);
    if (frameEditProcessMode === "extendOnly") {
      const maxWidth = Math.max(...resizedFrames.map((frame) => frame.width));
      const maxHeight = Math.max(...resizedFrames.map((frame) => frame.height));
      setFrameEditWidthInput(String(maxWidth));
      setFrameEditHeightInput(String(maxHeight));
    } else {
      setFrameEditWidthInput(String(nextWidth));
      setFrameEditHeightInput(String(nextHeight));
    }
  }

  function restoreFrameEditOriginals() {
    if (frames.length === 0) {
      return;
    }

    const restoredFrames = frames.map((frame) => {
      if (frame.url !== frame.originalUrl) {
        URL.revokeObjectURL(frame.url);
      }

      return {
        ...frame,
        url: frame.originalUrl,
        image: frame.originalImage,
        width: frame.originalImage.width,
        height: frame.originalImage.height,
      };
    });

    framesRef.current = restoredFrames;
    setFrames(restoredFrames);
  }

  async function exportAllFrameEditFrames() {
    if (frames.length === 0) {
      return;
    }

    const zip = new JSZip();

    for (const [index, frame] of frames.entries()) {
      const response = await fetch(frame.url);
      const blob = await response.blob();
      const extension = blob.type === "image/jpeg" ? "jpg" : "png";
      const baseName = sanitizeFileNamePart(stripExtension(frame.name)) || `frame-${index + 1}`;
      zip.file(`${baseName}.${extension}`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "frame-edit-export.zip";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportAllFrameExtractFrames() {
    if (frames.length === 0) {
      return;
    }

    try {
      console.log("[SpriteEditor] Exporting extracted frames", {
        frameCount: frames.length,
      });

      const zip = new JSZip();

      for (const [index, frame] of frames.entries()) {
        const response = await fetch(frame.url);
        const blob = await response.blob();
        const extension = blob.type === "image/jpeg" ? "jpg" : "png";
        const baseName =
          sanitizeFileNamePart(stripExtension(frame.name)) || `frame-${index + 1}`;
        zip.file(`${baseName}.${extension}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "frame-extract-export.zip";
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();

      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 0);
    } catch (error) {
      console.error("[SpriteEditor] Failed to export extracted frames", error);
    }
  }

  function removeFrame(frameId: string) {
    setFrames((current) => {
      const targetFrame = current.find((frame) => frame.id === frameId);

      if (targetFrame) {
        if (targetFrame.url !== targetFrame.originalUrl) {
          URL.revokeObjectURL(targetFrame.url);
        }
        URL.revokeObjectURL(targetFrame.originalUrl);
      }

      const nextFrames = current.filter((frame) => frame.id !== frameId);
      framesRef.current = nextFrames;
      const nextFrameCount = nextFrames.length;
      const normalizedIndex =
        nextFrameCount > 0
          ? Math.min(videoFrameRef.current, nextFrameCount - 1)
          : 0;
      videoFrameRef.current = normalizedIndex;
      setVideoFrameIndex(normalizedIndex);
      return nextFrames;
    });
  }

  function reorderFramesByCarousel(
    nextItems: Array<{
      id: string | number;
      image: string;
      title?: string;
      subtitle?: string;
    }>,
  ) {
    setFrames((current) => {
      const currentMap = new Map<string | number, MergeFrame>(
        current.map((frame) => [frame.id, frame]),
      );
      const reorderedFrames = nextItems
        .map((item) => currentMap.get(item.id))
        .filter((frame): frame is MergeFrame => frame !== undefined);

      framesRef.current = reorderedFrames;

      if (activeVideoFrame) {
        const nextActiveIndex = reorderedFrames.findIndex(
          (frame) => frame.id === activeVideoFrame.id,
        );

        if (nextActiveIndex >= 0) {
          videoFrameRef.current = nextActiveIndex;
          setVideoFrameIndex(nextActiveIndex);
        }
      }

      return reorderedFrames;
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

    switch (activeTab) {
      case "split":
        await loadSplitSource(droppedFiles);
        return;
      case "frame-extract":
        await loadFrameExtractSource(droppedFiles);
        return;
      case "frame-edit":
        await loadFiles(droppedFiles);
        return;
      case "merge":
      default:
        await loadFiles(droppedFiles);
    }
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
    link.download = `${buildMergedExportFileName({
      exportFormat,
      frames,
      prefix: fileNamePrefix,
      middle: fileNameMiddle,
      suffix: fileNameSuffix,
    })}.${exportFormat === "jpeg" ? "jpg" : exportFormat}`;
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
    link.href = canvas.toDataURL(
      getMimeType(splitExportFormat),
      getQuality(splitExportFormat),
    );
    link.download = `${buildSplitExportBaseName(splitSource, splitFileName)}_${
      exportIndex ?? getSplitSliceExportIndex(splitSlices, slice.id)
    }.${splitExportFormat === "jpeg" ? "jpg" : splitExportFormat}`;
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
    const baseName = buildSplitExportBaseName(splitSource, splitFileName);

    for (const [index, slice] of splitSlices.entries()) {
      const blob = await createSplitSliceBlob(
        splitSource,
        slice,
        previewBackgroundColor,
        splitExportFormat,
      );

      if (!blob) {
        continue;
      }

      zip.file(
        `${baseName}_${index}.${splitExportFormat === "jpeg" ? "jpg" : splitExportFormat}`,
        blob,
      );
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
    splitVideoFrameRef.current = 0;
    splitVideoTimeRef.current = 0;
    setSplitVideoFrameIndex(0);
    setIsSplitVideoPlaying(false);
    setSplitPreviewMode("results");
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
                ["frame-extract", "/tools/sprite-editor/frame-extract", t("tabs.frameExtract")],
                ["frame-edit", "/tools/sprite-editor/frame-edit", t("tabs.frameEdit")],
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
                  animatedTab === "split"
                    ? styles.tabIndicatorSplit
                    : animatedTab === "frame-extract"
                      ? styles.tabIndicatorFrameExtract
                    : animatedTab === "frame-edit"
                      ? styles.tabIndicatorFrameEdit
                      : ""
                }`}
              />
            </div>
          </div>

          <div className={styles.tabViewport}>
            <div
              className={`${styles.tabPanels} ${
                animatedTab === "split"
                  ? styles.tabPanelsShifted
                  : animatedTab === "frame-extract"
                    ? styles.tabPanelsFrameExtract
                  : animatedTab === "frame-edit"
                    ? styles.tabPanelsFrameEdit
                    : ""
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
                      <SelectField
                        ariaLabel={t("controls.format")}
                        onChange={(event) =>
                          setExportFormat(event.target.value as "png" | "jpeg" | "webp")
                        }
                        value={exportFormat}
                      >
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                      </SelectField>
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

                  <div className={styles.fileNamingRow}>
                    <div className={styles.fileNamingHeader}>
                      <span className={styles.fileNamingLabel}>{t("naming.label")}</span>
                      <span className={styles.fileNamingPreview}>
                        {buildMergedExportFileName({
                          exportFormat,
                          frames,
                          prefix: fileNamePrefix,
                          middle: fileNameMiddle,
                          suffix: fileNameSuffix,
                        })}
                        .{exportFormat === "jpeg" ? "jpg" : exportFormat}
                      </span>
                    </div>

                    <div className={styles.fileNamingGrid}>
                      <FileNameSegmentField
                        config={fileNamePrefix}
                        label={t("naming.prefix")}
                        onChange={setFileNamePrefix}
                        options={fileNamePrefixOptions}
                        placeholder={t("naming.customPlaceholder")}
                      />
                      <FileNameSegmentField
                        config={fileNameMiddle}
                        label={t("naming.middle")}
                        onChange={setFileNameMiddle}
                        options={fileNameMiddleOptions}
                        placeholder={t("naming.customPlaceholder")}
                      />
                      <FileNameSegmentField
                        config={fileNameSuffix}
                        label={t("naming.suffix")}
                        onChange={setFileNameSuffix}
                        options={fileNameSuffixOptions}
                        placeholder={t("naming.customPlaceholder")}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.previewFrame}>
                  <div
                    ref={mergeViewportRef}
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
                            onChange={handleMergeInputChange}
                            type="file"
                            {...({ directory: "", webkitdirectory: "" } satisfies DirectoryInputProps)}
                          />
                          {t("emptyPreview.action")}
                        </label>
                      </div>
                    ) : (
                      <div className={styles.previewStageViewport}>
                        <div
                          className={`${styles.previewStagePanels} ${
                            previewMode === "video" ? styles.previewStagePanelsShifted : ""
                          }`}
                        >
                          <div className={styles.previewStagePanel}>
                            <div
                              className={styles.previewCanvasStage}
                              style={
                                {
                                  width: `${previewCanvasWidth}px`,
                                  height: `${previewCanvasHeight}px`,
                                } satisfies React.CSSProperties
                              }
                            >
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
                            </div>
                          </div>

                          <div className={styles.previewStagePanel}>
                            {activeVideoFrame ? (
                              <div
                                className={styles.previewCanvasStage}
                                style={
                                  {
                                    width: `${videoPreviewWidth}px`,
                                    height: `${videoPreviewHeight}px`,
                                  } satisfies React.CSSProperties
                                }
                              >
                                <div className={styles.videoPreviewStage}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    alt={activeVideoFrame.name}
                                    className={styles.videoPreviewImage}
                                    draggable={false}
                                    src={activeVideoFrame.url}
                                    style={{
                                      width: `${videoPreviewWidth}px`,
                                      height: `${videoPreviewHeight}px`,
                                    }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {previewMode === "video" && activeVideoFrame ? (
                  <div className={styles.videoPreviewPanel}>
                    <div
                      className={`${styles.videoPreviewCarouselWrap} ${
                        isVideoPlaying ? "" : styles.videoPreviewCarouselWrapExpanded
                      }`}
                    >
                      <ImageCarousel
                        activeId={activeVideoFrame.id}
                        ariaLabel="Sprite editor video frames"
                        compact
                        draggable
                        imageHeight={92}
                        imageWidth={92}
                        items={previewTiles.map((tile, index) => ({
                          id: tile.id,
                          image: tile.url,
                          subtitle: `${index + 1}/${frames.length}`,
                          title: tile.name,
                        }))}
                        onRemove={(id) => removeFrame(String(id))}
                        onReorder={reorderFramesByCarousel}
                        onSelect={(index) => {
                          goToVideoFrame(index);
                          setIsVideoPlaying(false);
                        }}
                        removableByDrag
                        removeZoneLabel={t("actions.delete")}
                      />
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

                    {activeTab === "merge" ? (
                      <PreviewBackgroundColorPanel
                        applyPreviewBackgroundColor={applyPreviewBackgroundColor}
                        presets={PREVIEW_BACKGROUND_PRESETS}
                        previewBackgroundColor={previewBackgroundColor}
                        previewPickerColor={previewPickerColor}
                        transparentValue={TRANSPARENT_PREVIEW_BACKGROUND}
                        t={t}
                      />
                    ) : null}
                  </div>
                </div>

                <canvas aria-hidden="true" className={styles.hiddenCanvas} ref={canvasRef} />
              </section>

              <section className={`${styles.tabPanel} ${styles.splitPanel}`} role="tabpanel">
                <div className={styles.splitWorkspace}>
                  <div className={styles.canvasToolbar}>
                    <div className={styles.controlsInline}>
                      {splitMode === "grid" ? (
                        <>
                          <label className={`${styles.field} ${styles.splitCompactField}`}>
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
                          <label className={`${styles.field} ${styles.splitCompactField}`}>
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

                      <label className={styles.field}>
                        <span>{t("split.mode")}</span>
                        <SelectField
                          ariaLabel={t("split.mode")}
                          onChange={(event) => setSplitMode(event.target.value as SplitMode)}
                          value={splitMode}
                        >
                          <option value="grid">{t("split.modes.grid")}</option>
                          <option value="size">{t("split.modes.size")}</option>
                          <option value="smart">{t("split.modes.smart")}</option>
                        </SelectField>
                      </label>

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

                    <div className={styles.fileNamingRow}>
                      <div className={styles.fileNamingHeaderSplit}>
                        <span className={styles.fileNamingLabel}>{t("controls.format")}</span>
                        <div className={styles.fileNamingHeaderRight}>
                          <span className={styles.fileNamingLabel}>{t("naming.label")}</span>
                          <span className={styles.fileNamingPreview}>
                            {splitSource
                              ? `${buildSplitExportBaseName(splitSource, splitFileName)}_0.${
                                  splitExportFormat === "jpeg" ? "jpg" : splitExportFormat
                                }`
                              : `${t("naming.originalName")}_0.${
                                  splitExportFormat === "jpeg" ? "jpg" : splitExportFormat
                                }`}
                          </span>
                        </div>
                      </div>

                      <div className={styles.fileNamingGridSplit}>
                        <div
                          className={`${styles.fileNameField} ${styles.splitCompactField} ${styles.splitFormatField}`}
                        >
                          <SelectField
                            ariaLabel={t("controls.format")}
                            onChange={(event) =>
                              setSplitExportFormat(
                                event.target.value as "png" | "jpeg" | "webp",
                              )
                            }
                            value={splitExportFormat}
                          >
                            <option value="png">PNG</option>
                            <option value="jpeg">JPEG</option>
                            <option value="webp">WebP</option>
                          </SelectField>
                        </div>

                        <FileNameSegmentField
                          config={splitFileName}
                          label={t("naming.fileName")}
                          hideLabel
                          onChange={setSplitFileName}
                          options={splitFileNameOptions}
                          placeholder={t("naming.customPlaceholder")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.previewFrame}>
                    <div
                      ref={splitViewportRef}
                      className={`${styles.canvasViewport} ${styles.splitCanvasViewport} ${
                        splitSource ? styles.canvasViewportFilled : styles.canvasViewportEmpty
                      }`}
                      style={
                        {
                          backgroundColor: previewBackgroundColor,
                        }
                      }
                    >
                      {splitSource ? (
                        <div className={styles.previewStageViewport}>
                          <div
                            className={`${styles.previewStagePanels} ${
                              splitPreviewMode === "results"
                                ? styles.previewStagePanelsSplitResults
                                : splitPreviewMode === "video"
                                  ? styles.previewStagePanelsSplitVideo
                                  : ""
                            }`}
                          >
                            <div className={styles.previewStagePanel}>
                              <div
                                className={styles.previewCanvasStage}
                                style={
                                  {
                                    width: `${splitPreviewWidth}px`,
                                    height: `${splitPreviewHeight}px`,
                                  } satisfies React.CSSProperties
                                }
                              >
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
                              </div>
                            </div>

                            <div className={styles.previewStagePanel}>
                              <div className={styles.splitResultsPreview}>
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
                                        <span className={styles.splitResultIndex}>
                                          #{index + 1}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className={styles.splitResultsEmpty}>{t("split.noSlices")}</p>
                                )}
                              </div>
                            </div>

                            <div className={styles.previewStagePanel}>
                              {activeSplitVideoFrame?.previewUrl ? (
                                <div
                                  className={styles.previewCanvasStage}
                                  style={
                                    {
                                      width: `${splitVideoPreviewWidth}px`,
                                      height: `${splitVideoPreviewHeight}px`,
                                    } satisfies React.CSSProperties
                                  }
                                >
                                  <div className={styles.videoPreviewStage}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      alt={`${splitSource.name} ${splitVideoFrameIndex + 1}`}
                                      className={styles.videoPreviewImage}
                                      draggable={false}
                                      src={activeSplitVideoFrame.previewUrl}
                                      style={{
                                        width: `${splitVideoPreviewWidth}px`,
                                        height: `${splitVideoPreviewHeight}px`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.emptyPreview}>
                          <p className={styles.emptyPreviewTitle}>{t("split.emptyTitle")}</p>
                          <p className={styles.emptyPreviewCopy}>{t("split.emptyDescription")}</p>
                          <label className={styles.emptyPreviewAction}>
                            <input
                              accept="image/*"
                              className={styles.hiddenInput}
                              onChange={handleSplitInputChange}
                              type="file"
                            />
                            {t("emptyPreview.action")}
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {splitPreviewMode === "video" && activeSplitVideoFrame ? (
                    <div className={styles.videoPreviewPanel}>
                      <div
                        className={`${styles.videoPreviewCarouselWrap} ${
                          isSplitVideoPlaying ? "" : styles.videoPreviewCarouselWrapExpanded
                        }`}
                      >
                        <ImageCarousel
                          activeId={activeSplitVideoFrame.id}
                          ariaLabel="Sprite editor split video frames"
                          compact
                          imageHeight={92}
                          imageWidth={92}
                          items={splitSlices.map((slice, index) => ({
                            id: slice.id,
                            image: slice.previewUrl ?? "",
                            subtitle: `${index + 1}/${splitSlices.length}`,
                            title: `#${index + 1}`,
                          }))}
                          onSelect={(index) => {
                            goToSplitVideoFrame(index);
                            setIsSplitVideoPlaying(false);
                          }}
                        />
                      </div>
                      <div className={styles.videoPreviewControls}>
                        <button
                          aria-label="Previous frame"
                          className={styles.videoPreviewControl}
                          onClick={() => stepSplitVideoFrame(-1)}
                          type="button"
                        >
                          <FaStepBackward aria-hidden="true" />
                        </button>
                        <button
                          aria-label={isSplitVideoPlaying ? "Pause" : "Play"}
                          className={styles.videoPreviewControl}
                          onClick={toggleSplitVideoPlayback}
                          type="button"
                        >
                          {isSplitVideoPlaying ? (
                            <FaPause aria-hidden="true" />
                          ) : (
                            <FaPlay aria-hidden="true" />
                          )}
                        </button>
                        <button
                          aria-label="Next frame"
                          className={styles.videoPreviewControl}
                          onClick={() => stepSplitVideoFrame(1)}
                          type="button"
                        >
                          <FaStepForward aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : null}

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
                                splitPreviewMode === "preview"
                                  ? styles.previewModeButtonActive
                                  : ""
                              }`}
                              onClick={() => activateSplitPreviewMode("preview")}
                              aria-label={t("preview.mode")}
                              type="button"
                            >
                              <PiRectangleDashedDuotone aria-hidden="true" />
                            </button>
                            <button
                              className={`${styles.previewModeButton} ${
                                splitPreviewMode === "results"
                                  ? styles.previewModeButtonActive
                                  : ""
                              }`}
                              disabled={splitSlices.length === 0}
                              onClick={() => activateSplitPreviewMode("results")}
                              aria-label={t("split.resultsTitle")}
                              type="button"
                            >
                              <BsGrid3X3GapFill aria-hidden="true" />
                            </button>
                            <button
                              className={`${styles.previewModeButton} ${
                                splitPreviewMode === "video"
                                  ? styles.previewModeButtonActive
                                  : ""
                              }`}
                              disabled={splitSlices.length === 0}
                              onClick={() => activateSplitPreviewMode("video")}
                              aria-label={t("preview.videoMode")}
                              type="button"
                            >
                              <BsCameraVideoFill aria-hidden="true" />
                            </button>
                          </div>
                          <div className={styles.previewModeFieldWrap}>
                            {splitPreviewMode === "video" ? (
                              <>
                                <label
                                  className={styles.previewFpsField}
                                  htmlFor="split-preview-fps"
                                >
                                  <span>{t("preview.fps")}</span>
                                  <input
                                    id="split-preview-fps"
                                    max={120}
                                    min={1}
                                    onBlur={(event) => {
                                      const trimmedValue = event.target.value.trim();
                                      const nextValue =
                                        trimmedValue === ""
                                          ? 24
                                          : clamp(Number(trimmedValue), 1, 120);
                                      setSplitVideoFps(nextValue);
                                      setSplitVideoFpsInput(String(nextValue));
                                    }}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      if (nextValue === "") {
                                        setSplitVideoFpsInput("");
                                        return;
                                      }

                                      if (!/^\d+$/.test(nextValue)) {
                                        return;
                                      }

                                      setSplitVideoFpsInput(nextValue);
                                      setSplitVideoFps(clamp(Number(nextValue), 1, 120));
                                    }}
                                    type="number"
                                    value={splitVideoFpsInput}
                                  />
                                </label>
                                <input
                                  className={styles.zoomSlider}
                                  id="split-preview-fps-slider"
                                  max={120}
                                  min={1}
                                  onChange={(event) => {
                                    const nextValue = clamp(
                                      Number(event.target.value),
                                      1,
                                      120,
                                    );
                                    setSplitVideoFps(nextValue);
                                    setSplitVideoFpsInput(String(nextValue));
                                  }}
                                  type="range"
                                  value={splitVideoFps}
                                />
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
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

                      {activeTab === "split" ? (
                        <PreviewBackgroundColorPanel
                          applyPreviewBackgroundColor={applyPreviewBackgroundColor}
                          presets={PREVIEW_BACKGROUND_PRESETS}
                          previewBackgroundColor={previewBackgroundColor}
                          previewPickerColor={previewPickerColor}
                          transparentValue={TRANSPARENT_PREVIEW_BACKGROUND}
                          t={t}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className={`${styles.tabPanel} ${styles.mergePanel}`} role="tabpanel">
                <div className={styles.canvasToolbar}>
                  <div className={styles.controlsInline}>
                    {isFrameExtractSamplingEnabled ? (
                      <label className={styles.field}>
                        <span>{t("frameExtract.fps")}</span>
                        <div className={styles.frameExtractFpsRow}>
                          <button
                            className={`${styles.tertiaryAction} ${
                              frameExtractUseSourceFps ? styles.frameExtractFpsButtonActive : ""
                            }`}
                            disabled={!frameExtractSource}
                            onClick={applyFrameExtractSourceFps}
                            type="button"
                          >
                            {t("frameExtract.sourceFps")}
                          </button>
                        </div>
                        <input
                          max={frameExtractFpsMax}
                          min={1}
                          onChange={(event) =>
                            handleFrameExtractFpsChange(Number(event.target.value))
                          }
                          type="range"
                          value={frameExtractFps}
                        />
                        <span className={styles.fieldValue}>{frameExtractFps} FPS</span>
                      </label>
                    ) : null}
                  </div>

                  <div className={styles.toolbarActions}>
                    <button
                      className={styles.tertiaryAction}
                      disabled={!frameExtractSource || isExtractingFrames}
                      onClick={clearFrameExtractSource}
                      type="button"
                    >
                      {t("actions.clear")}
                    </button>
                    <button
                      className={styles.exportButton}
                      disabled={!frameExtractSource || isExtractingFrames}
                      onClick={extractFramesFromSource}
                      type="button"
                    >
                      {isExtractingFrames ? t("frameExtract.extracting") : t("frameExtract.run")}
                    </button>
                  </div>
                </div>

                <div className={styles.previewFrame}>
                  <div
                    ref={frameExtractViewportRef}
                    className={`${styles.canvasViewport} ${
                      frameExtractSource
                        ? styles.canvasViewportFilled
                        : styles.canvasViewportEmpty
                    }`}
                  >
                    {frameExtractSource ? (
                      <div className={styles.previewStageViewport}>
                        <div
                          className={`${styles.previewStagePanels} ${
                            frameExtractPreviewMode === "results"
                              ? styles.previewStagePanelsSplitResults
                              : ""
                          }`}
                        >
                          <div className={styles.previewStagePanel}>
                            <div
                              className={styles.previewCanvasStage}
                              style={
                                {
                                  width: `${frameExtractPreviewWidth}px`,
                                  height: `${frameExtractPreviewHeight}px`,
                                } satisfies React.CSSProperties
                              }
                            >
                              <div className={styles.videoPreviewStage}>
                                {frameExtractSource.type === "gif" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    alt={frameExtractSource.name}
                                    className={styles.videoPreviewImage}
                                    draggable={false}
                                    src={frameExtractSource.url}
                                    style={{
                                      width: `${frameExtractPreviewWidth}px`,
                                      height: `${frameExtractPreviewHeight}px`,
                                    }}
                                  />
                                ) : (
                                  <video
                                    autoPlay
                                    className={styles.videoPreviewImage}
                                    controls
                                    loop
                                    muted
                                    playsInline
                                    src={frameExtractSource.url}
                                    style={{
                                      width: `${frameExtractPreviewWidth}px`,
                                      height: `${frameExtractPreviewHeight}px`,
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={styles.previewStagePanel}>
                            {activeFrameExtractVideoFrame ? (
                              <div
                                className={styles.previewCanvasStage}
                                style={
                                  {
                                    width: `${frameExtractVideoPreviewWidth}px`,
                                    height: `${frameExtractVideoPreviewHeight}px`,
                                  } satisfies React.CSSProperties
                                }
                              >
                                <div className={styles.videoPreviewStage}>
                                  <canvas
                                    className={styles.videoPreviewImage}
                                    ref={frameExtractPreviewCanvasRef}
                                    style={{
                                      width: `${frameExtractVideoPreviewWidth}px`,
                                      height: `${frameExtractVideoPreviewHeight}px`,
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className={styles.emptyPreview}>
                                <p className={styles.emptyPreviewTitle}>
                                  {t("frameExtract.ready", {
                                    type:
                                      frameExtractSource.type === "gif"
                                        ? t("frameExtract.gif")
                                        : t("frameExtract.video"),
                                  })}
                                </p>
                                <p className={styles.emptyPreviewCopy}>
                                  {t("split.noSlices")}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyPreview}>
                        <p className={styles.emptyPreviewTitle}>{t("frameExtract.emptyTitle")}</p>
                        <p className={styles.emptyPreviewCopy}>
                          {t("frameExtract.emptyDescription")}
                        </p>
                        <label className={styles.emptyPreviewAction}>
                          <input
                            accept="video/*,.gif"
                            className={styles.hiddenInput}
                            onChange={handleFrameExtractInputChange}
                            type="file"
                          />
                          {t("frameExtract.action")}
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {frameExtractPreviewMode === "results" && activeFrameExtractVideoFrame ? (
                  <div className={styles.videoPreviewPanel}>
                    <div className={styles.splitResultsHeader}>
                      <p className={styles.panelEyebrow}>{t("split.resultsTitle")}</p>
                      <button
                        className={styles.secondaryAction}
                        disabled={frames.length === 0}
                        onClick={exportAllFrameExtractFrames}
                        type="button"
                      >
                        {t("frameEdit.exportAll")}
                      </button>
                    </div>
                    {!isFrameExtractVideoPlaying ? (
                      <div
                        className={`${styles.videoPreviewCarouselWrap} ${styles.videoPreviewCarouselWrapExpanded}`}
                      >
                        <ImageCarousel
                          activeId={activeFrameExtractVideoFrame.id}
                          ariaLabel="Sprite editor frame extract results"
                          compact
                          imageHeight={92}
                          imageWidth={92}
                          items={frameExtractCarouselItems}
                          onRemove={(id) => removeFrame(String(id))}
                          onReorder={reorderFramesByCarousel}
                          onSelect={(index) => {
                            goToFrameExtractVideoFrame(index);
                            setIsFrameExtractVideoPlaying(false);
                          }}
                          removableByDrag
                        />
                      </div>
                    ) : null}
                    <div className={styles.videoPreviewControls}>
                      <button
                        aria-label="Previous frame"
                        className={styles.videoPreviewControl}
                        onClick={() => stepFrameExtractVideoFrame(-1)}
                        type="button"
                      >
                        <FaStepBackward aria-hidden="true" />
                      </button>
                      <button
                        aria-label={isFrameExtractVideoPlaying ? "Pause" : "Play"}
                        className={styles.videoPreviewControl}
                        onClick={toggleFrameExtractVideoPlayback}
                        type="button"
                      >
                        {isFrameExtractVideoPlaying ? (
                          <FaPause aria-hidden="true" />
                        ) : (
                          <FaPlay aria-hidden="true" />
                        )}
                      </button>
                      <button
                        aria-label="Next frame"
                        className={styles.videoPreviewControl}
                        onClick={() => stepFrameExtractVideoFrame(1)}
                        type="button"
                      >
                        <FaStepForward aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : null}

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
                              frameExtractPreviewMode === "video"
                                ? styles.previewModeButtonActive
                                : ""
                            }`}
                            onClick={() => activateFrameExtractPreviewMode("video")}
                            aria-label={t("preview.videoMode")}
                            type="button"
                          >
                            <BsCameraVideoFill aria-hidden="true" />
                          </button>
                          <button
                            className={`${styles.previewModeButton} ${
                              frameExtractPreviewMode === "results"
                                ? styles.previewModeButtonActive
                                : ""
                            }`}
                            disabled={frames.length === 0}
                            onClick={() => activateFrameExtractPreviewMode("results")}
                            aria-label={t("split.resultsTitle")}
                            type="button"
                          >
                            <BsGrid3X3GapFill aria-hidden="true" />
                          </button>
                        </div>
                        <div className={styles.previewModeFieldWrap}>
                          {isFrameExtractSamplingEnabled ? (
                            <>
                              <label
                                className={styles.zoomLabel}
                                htmlFor="frame-extract-preview-fps"
                              >
                                <span>{t("frameExtract.previewFps")}</span>
                                <span>{frameExtractFps} FPS</span>
                              </label>
                              <input
                                className={styles.zoomSlider}
                                id="frame-extract-preview-fps"
                                max={frameExtractFpsMax}
                                min={1}
                                onChange={(event) =>
                                  handleFrameExtractFpsChange(Number(event.target.value))
                                }
                                type="range"
                                value={frameExtractFps}
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={`${styles.tabPanel} ${styles.mergePanel}`} role="tabpanel">
                <div className={styles.canvasToolbar}>
                  <div className={styles.frameEditControls}>
                    <div className={styles.frameEditControlsRow}>
                      <label className={`${styles.fileNameField} ${styles.frameEditProcessField}`}>
                        <span>{t("frameEdit.processMode")}</span>
                        <SelectField
                          ariaLabel={t("frameEdit.processMode")}
                          onChange={(event) =>
                            setFrameEditProcessMode(
                              event.target.value as FrameEditProcessMode,
                            )
                          }
                          value={frameEditProcessMode}
                        >
                          {frameEditProcessModeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectField>
                      </label>

                      <label className={`${styles.fileNameField} ${styles.splitCompactField}`}>
                        <span>{t("frameEdit.aspectRatio")}</span>
                        <SelectField
                          ariaLabel={t("frameEdit.aspectRatio")}
                          onChange={(event) =>
                            handleFrameEditAspectChange(
                              event.target.value as FrameEditAspectPreset,
                            )
                          }
                          value={frameEditAspectPreset}
                        >
                          {frameEditAspectOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectField>
                      </label>

                      <label className={`${styles.field} ${styles.frameEditSliderField}`}>
                        <span>
                          {t("frameEdit.resolution")}
                          {` (${getFrameEditResolutionLabel(frameEditResolution)})`}
                        </span>
                        <input
                          className={styles.zoomSlider}
                          max={FRAME_EDIT_RESOLUTION_OPTIONS.length - 1}
                          min={0}
                          onChange={(event) =>
                            handleFrameEditResolutionChange(
                              FRAME_EDIT_RESOLUTION_OPTIONS[
                                clamp(
                                  Number(event.target.value),
                                  0,
                                  FRAME_EDIT_RESOLUTION_OPTIONS.length - 1,
                                )
                              ] ?? 0,
                            )
                          }
                          type="range"
                          value={FRAME_EDIT_RESOLUTION_OPTIONS.indexOf(
                            frameEditResolution as (typeof FRAME_EDIT_RESOLUTION_OPTIONS)[number],
                          )}
                        />
                      </label>
                    </div>

                    {frameEditProcessMode !== "scale" ? (
                      <div className={styles.frameEditFillPanelWrap}>
                        <PreviewBackgroundColorPanel
                          applyPreviewBackgroundColor={applyFrameEditFillColor}
                          presets={PREVIEW_BACKGROUND_PRESETS}
                          previewBackgroundColor={frameEditFillColor}
                          previewPickerColor={frameEditFillPickerColor}
                          transparentValue={TRANSPARENT_PREVIEW_BACKGROUND}
                          t={t}
                        />
                      </div>
                    ) : null}

                    <div className={styles.frameEditControlsRow}>
                      <label className={`${styles.field} ${styles.splitCompactField}`}>
                        <span>{t("frameEdit.width")}</span>
                        <input
                          min={1}
                          onBlur={() =>
                            setFrameEditWidthInput(
                              String(clamp(Number(frameEditWidthInput || "0"), 1, 4096)),
                            )
                          }
                          onChange={(event) => handleFrameEditWidthChange(event.target.value)}
                          type="number"
                          value={frameEditWidthInput}
                        />
                      </label>

                      <label className={`${styles.field} ${styles.splitCompactField}`}>
                        <span>{t("frameEdit.height")}</span>
                        <input
                          min={1}
                          onBlur={() =>
                            setFrameEditHeightInput(
                              String(clamp(Number(frameEditHeightInput || "0"), 1, 4096)),
                            )
                          }
                          onChange={(event) => handleFrameEditHeightChange(event.target.value)}
                          type="number"
                          value={frameEditHeightInput}
                        />
                      </label>

                      <div className={styles.frameEditActionField}>
                        <div className={styles.toolbarActions}>
                          <button
                            className={styles.exportButton}
                            disabled={frames.length === 0}
                            onClick={processFrameEditResize}
                            type="button"
                          >
                            {t("frameEdit.process")}
                          </button>
                          <button
                            className={styles.tertiaryAction}
                            disabled={frames.length === 0}
                            onClick={restoreFrameEditOriginals}
                            type="button"
                          >
                            {t("frameEdit.restore")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.frameEditFooter}>
                  <button
                    className={styles.secondaryAction}
                    disabled={frames.length === 0}
                    onClick={exportAllFrameEditFrames}
                    type="button"
                  >
                    {t("frameEdit.exportAll")}
                  </button>
                </div>

                <div className={styles.previewFrame}>
                  <div
                    ref={frameEditViewportRef}
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
                        <p className={styles.emptyPreviewTitle}>{t("frameEdit.emptyTitle")}</p>
                        <p className={styles.emptyPreviewCopy}>
                          {t("frameEdit.emptyDescription")}
                        </p>
                        <label className={styles.emptyPreviewAction}>
                          <input
                            accept="image/*"
                            className={styles.hiddenInput}
                            multiple
                            onChange={handleFrameEditInputChange}
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
                            width: `${
                              previewMode === "video" && activeVideoFrame
                                ? videoPreviewWidth
                                : previewCanvasWidth
                            }px`,
                            height: `${
                              previewMode === "video" && activeVideoFrame
                                ? videoPreviewHeight
                                : previewCanvasHeight
                            }px`,
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
                              style={{
                                width: `${videoPreviewWidth}px`,
                                height: `${videoPreviewHeight}px`,
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {previewMode === "video" && activeVideoFrame ? (
                  <div className={styles.videoPreviewPanel}>
                    <div
                      className={`${styles.videoPreviewCarouselWrap} ${
                        isVideoPlaying ? "" : styles.videoPreviewCarouselWrapExpanded
                      }`}
                    >
                      <ImageCarousel
                        activeId={activeVideoFrame.id}
                        ariaLabel="Sprite editor video frames"
                        compact
                        draggable
                        imageHeight={92}
                        imageWidth={92}
                        items={previewTiles.map((tile, index) => ({
                          id: tile.id,
                          image: tile.url,
                          subtitle: `${index + 1}/${frames.length}`,
                          title: tile.name,
                        }))}
                        onRemove={(id) => removeFrame(String(id))}
                        onReorder={reorderFramesByCarousel}
                        onSelect={(index) => {
                          goToVideoFrame(index);
                          setIsVideoPlaying(false);
                        }}
                        removableByDrag
                        removeZoneLabel={t("actions.delete")}
                      />
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
                              <label className={styles.previewFpsField} htmlFor="frame-edit-fps">
                                <span>{t("preview.fps")}</span>
                                <input
                                  id="frame-edit-fps"
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
                                id="frame-edit-fps-slider"
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
                              <label className={styles.zoomLabel} htmlFor="frame-edit-preview-zoom">
                                <span>{t("preview.zoom")}</span>
                                <span>{previewZoom}%</span>
                              </label>
                              <input
                                className={styles.zoomSlider}
                                id="frame-edit-preview-zoom"
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
                        <p className={styles.panelEyebrow}>{t("frameEdit.infoTitle")}</p>
                        <div className={styles.infoGrid}>
                          <InfoCard
                            label={t("frameEdit.frameCount")}
                            value={String(frames.length)}
                          />
                          <InfoCard
                            label={t("frameEdit.activeFrame")}
                            value={
                              activeVideoFrame
                                ? `${videoFrameIndex + 1} / ${frames.length}`
                                : frames.length > 0
                                  ? `1 / ${frames.length}`
                                  : "-"
                            }
                          />
                          <InfoCard
                            label={t("frameEdit.sequenceSize")}
                            value={
                              frames.length > 0
                                ? `${mergedMetrics.canvasWidth} x ${mergedMetrics.canvasHeight}`
                                : "-"
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {activeTab === "frame-edit" ? (
                      <PreviewBackgroundColorPanel
                        applyPreviewBackgroundColor={applyPreviewBackgroundColor}
                        presets={PREVIEW_BACKGROUND_PRESETS}
                        previewBackgroundColor={previewBackgroundColor}
                        previewPickerColor={previewPickerColor}
                        transparentValue={TRANSPARENT_PREVIEW_BACKGROUND}
                        t={t}
                      />
                    ) : null}
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
      originalUrl: url,
      originalImage: image,
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

function isSupportedFrameExtractFile(file: File) {
  if (file.type.startsWith("video/")) {
    return true;
  }

  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

async function createFrameExtractSource(file: File): Promise<FrameExtractSource> {
  const url = URL.createObjectURL(file);
  const type = file.type === "image/gif" || /\.gif$/i.test(file.name) ? "gif" : "video";

  try {
    if (type === "gif") {
      const sourceFps = await getGifSourceFps(file);
      const frameCount = await getGifFrameCount(file);
      const image = await loadImage(url);

      return {
        id: `${file.name}-${createFrameId()}`,
        name: file.name,
        url,
        file,
        type,
        width: image.width,
        height: image.height,
        fps: clamp(Math.round(sourceFps), 1, 60),
        frameCount,
      };
    }

    const video = await loadVideo(url);
    const sourceFps = await getVideoSourceFps(file);

    return {
      id: `${file.name}-${createFrameId()}`,
      name: file.name,
      url,
      file,
      type,
      width: video.videoWidth,
      height: video.videoHeight,
      fps: clamp(Math.round(sourceFps), 1, 60),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
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

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = reject;
    video.src = url;
  });
}

async function getVideoSourceFps(file: File) {
  try {
    const mediaInfoFactory = await loadMediaInfoFactory();

    if (!mediaInfoFactory) {
      return 24;
    }

    const mediaInfo = await mediaInfoFactory({
      format: "object",
      locateFile: (path) => {
        if (path.endsWith("MediaInfoModule.wasm")) {
          return "/mediainfo/MediaInfoModule.wasm";
        }

        return path;
      },
    });

    try {
      const result = await mediaInfo.analyzeData(
        () => file.size,
        async (chunkSize, offset) =>
          new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()),
      );
      const videoTrack = result.media?.track?.find((track) => track["@type"] === "Video");
      const frameRate = videoTrack?.FrameRate;

      if (typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0) {
        return frameRate;
      }
    } finally {
      mediaInfo.close();
    }
  } catch (error) {
    console.warn("[SpriteEditor] Failed to read video FPS with mediainfo.js", {
      name: file.name,
      error,
    });
  }

  return 24;
}

async function loadMediaInfoFactory(): Promise<MediaInfoFactoryFn | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.MediaInfo?.mediaInfoFactory) {
    return window.MediaInfo.mediaInfoFactory;
  }

  if (!mediaInfoFactoryPromise) {
    mediaInfoFactoryPromise = new Promise((resolve) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-mediainfo-script="true"]',
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => {
          resolve(window.MediaInfo?.mediaInfoFactory ?? null);
        });
        existingScript.addEventListener("error", () => resolve(null));
        return;
      }

      const script = document.createElement("script");
      script.src = "/mediainfo/index.min.js";
      script.async = true;
      script.dataset.mediainfoScript = "true";
      script.onload = () => resolve(window.MediaInfo?.mediaInfoFactory ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  return mediaInfoFactoryPromise;
}

async function getGifSourceFps(file: File) {
  const buffer = await file.arrayBuffer();
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);

  if (frames.length === 0) {
    return 24;
  }

  const totalDelay = frames.reduce((sum, frame) => sum + Math.max(frame.delay, 1), 0);
  const averageDelay = totalDelay / frames.length;
  const averageFps =
    !Number.isFinite(averageDelay) || averageDelay <= 0 ? 24 : 100 / averageDelay;

  console.log("[SpriteEditor] GIF source analysis", {
    name: file.name,
    frameCount: frames.length,
    totalDurationMs: totalDelay * 10,
    averageDelayCs: averageDelay,
    averageFps,
    frameDelaysCs: frames.map((frame) => Math.max(frame.delay, 1)),
  });

  if (!Number.isFinite(averageDelay) || averageDelay <= 0) {
    return 24;
  }

  return averageFps;
}

async function getGifFrameCount(file: File) {
  const buffer = await file.arrayBuffer();
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
  return frames.length;
}

function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to seek video frame"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.currentTime = time;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function createMergeFrameFromBlob(blob: Blob, name: string): Promise<MergeFrame> {
  const file = new File([blob], name, { type: "image/png" });
  return createMergeFrame(file);
}

async function extractVideoFrames(file: File, fps: number) {
  const url = URL.createObjectURL(file);

  try {
    const video = await loadVideo(url);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const safeFps = Math.max(1, fps);
    const totalFrames = Math.max(1, Math.floor(duration * safeFps));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return [];
    }

    const frames: MergeFrame[] = [];

    for (let index = 0; index < totalFrames; index += 1) {
      const time = Math.min(duration, index / safeFps);
      await seekVideo(video, time);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas);

      if (!blob) {
        continue;
      }

      frames.push(
        await createMergeFrameFromBlob(
          blob,
          `${stripExtension(file.name)}_${String(index).padStart(4, "0")}.png`,
        ),
      );
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractGifFrames(file: File) {
  const buffer = await file.arrayBuffer();
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);

  if (frames.length === 0) {
    return [];
  }

  const logicalWidth = gif.lsd.width;
  const logicalHeight = gif.lsd.height;
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth;
  canvas.height = logicalHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return [];
  }

  const extractedFrames: MergeFrame[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const imageData = ctx.createImageData(frame.dims.width, frame.dims.height);
    imageData.data.set(frame.patch);
    ctx.putImageData(imageData, frame.dims.left, frame.dims.top);
    const blob = await canvasToBlob(canvas);

    if (!blob) {
      continue;
    }

    extractedFrames.push(
      await createMergeFrameFromBlob(
        blob,
        `${stripExtension(file.name)}_${String(index).padStart(4, "0")}.png`,
      ),
    );
  }

  return extractedFrames;
}

function observeViewportSize(
  element: HTMLDivElement | null,
  onSizeChange: (size: ViewportSize) => void,
) {
  if (!element || typeof ResizeObserver === "undefined") {
    return undefined;
  }

  const updateSize = () => {
    onSizeChange({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    });
  };

  updateSize();
  const observer = new ResizeObserver(updateSize);
  observer.observe(element);

  return () => {
    observer.disconnect();
  };
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

function detectFrameSubjectBounds(image: HTMLImageElement, backgroundColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const targetColor =
    backgroundColor === TRANSPARENT_PREVIEW_BACKGROUND
      ? null
      : parseHexColorToRgba(backgroundColor);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] ?? 0;

      let isForeground = false;

      if (targetColor) {
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const colorDistance =
          Math.abs(red - targetColor.r) +
          Math.abs(green - targetColor.g) +
          Math.abs(blue - targetColor.b) +
          Math.abs(alpha - targetColor.a);
        isForeground = colorDistance > 24;
      } else {
        isForeground = alpha > 8;
      }

      if (!isForeground) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function parseHexColorToRgba(color: string) {
  const normalized = color.replace("#", "");

  if (normalized.length !== 6 && normalized.length !== 8) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255,
  };
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

function sanitizeFileNamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "");
}

function getFileNameSegmentValue({
  config,
  frames,
}: {
  config: FileNameSegmentConfig;
  frames: MergeFrame[];
}) {
  switch (config.type) {
    case "none":
      return "";
    case "frameIndex":
      return "0";
    case "originalName": {
      const baseName = frames.length > 0 ? stripExtension(frames[0].name) : "sprite-sheet";
      return sanitizeFileNamePart(baseName);
    }
    case "custom":
      return sanitizeFileNamePart(config.customValue);
    default:
      return "";
  }
}

function buildMergedExportFileName({
  prefix,
  middle,
  suffix,
  frames,
}: {
  prefix: FileNameSegmentConfig;
  middle: FileNameSegmentConfig;
  suffix: FileNameSegmentConfig;
  frames: MergeFrame[];
  exportFormat: "png" | "jpeg" | "webp";
}) {
  const segments = [
    getFileNameSegmentValue({ config: prefix, frames }),
    getFileNameSegmentValue({ config: middle, frames }),
    getFileNameSegmentValue({ config: suffix, frames }),
  ].filter((segment) => segment.length > 0);

  return segments.length > 0 ? segments.join("_") : "sprite-sheet";
}

function buildSplitExportBaseName(
  splitSource: SplitSource,
  config: FileNameSegmentConfig,
) {
  const segment =
    config.type === "custom"
      ? sanitizeFileNamePart(config.customValue)
      : sanitizeFileNamePart(stripExtension(splitSource.name));

  return segment.length > 0 ? segment : "split-result";
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
  format: "png" | "jpeg" | "webp",
) {
  const canvas = createSplitSliceCanvas(source, slice, backgroundColor);

  if (!canvas) {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      getMimeType(format),
      getQuality(format),
    );
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
