export type MergeFrame = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  originalUrl: string;
  originalImage: HTMLImageElement;
  width: number;
  height: number;
};

export type SplitSource = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
};

export type FrameExtractSource = {
  id: string;
  name: string;
  url: string;
  file: File;
  type: "video" | "gif";
};

export type SplitMode = "grid" | "size" | "smart";
export type SplitPreviewMode = "preview" | "results" | "video";
export type FrameEditAspectPreset = "none" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type FrameEditProcessMode = "scale" | "smartScale" | "extendOnly";

export type SplitSlice = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount?: number;
  previewUrl?: string;
};

export type SplitExecutionConfig = {
  mode: SplitMode;
  rows: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  alphaThreshold: number;
  minArea: number;
};

export type DirectoryInputProps = {
  directory?: string;
  webkitdirectory?: string;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type FileNameSegmentType = "none" | "frameIndex" | "originalName" | "custom";

export type FileNameSegmentConfig = {
  type: FileNameSegmentType;
  customValue: string;
};

export type FileNameSegmentOption = {
  value: FileNameSegmentType;
  label: string;
};

export type SpriteEditorTab = "merge" | "split" | "frame-extract" | "frame-edit";
export type PreviewMode = "sprite" | "video";

export type SpriteEditorTranslation = (
  key: string,
  values?: Record<string, string | number>,
) => string;
