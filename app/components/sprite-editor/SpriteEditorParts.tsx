"use client";

import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaChevronDown, FaTrashAlt } from "react-icons/fa";
import { HexAlphaColorPicker } from "react-colorful";
import styles from "../SpriteEditor.module.css";
import type {
  FileNameSegmentConfig,
  FileNameSegmentOption,
  SpriteEditorTranslation,
} from "./shared";

export function FileNameSegmentField({
  label,
  config,
  options,
  placeholder,
  hideLabel = false,
  onChange,
}: {
  label: string;
  config: FileNameSegmentConfig;
  options: FileNameSegmentOption[];
  placeholder: string;
  hideLabel?: boolean;
  onChange: (nextConfig: FileNameSegmentConfig) => void;
}) {
  const activeOption = options.find((option) => option.value === config.type) ?? options[0];

  return (
    <label className={styles.fileNameField}>
      {hideLabel ? null : <span>{label}</span>}
      <div className={styles.fileNameFieldControl}>
        {config.type === "custom" ? (
          <input
            className={styles.fileNameCustomInput}
            onChange={(event) =>
              onChange({
                ...config,
                customValue: event.target.value,
              })
            }
            placeholder={placeholder}
            type="text"
            value={config.customValue}
          />
        ) : (
          <>
            <div className={styles.fileNameSelectionValue}>{activeOption?.label}</div>
            <select
              aria-label={label}
              className={styles.fileNameFieldSelectFull}
              onChange={(event) =>
                onChange({
                  type: event.target.value as FileNameSegmentConfig["type"],
                  customValue: config.customValue,
                })
              }
              value={config.type}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        )}

        <div className={styles.fileNameFieldSelectWrap}>
          <select
            aria-label={label}
            className={styles.fileNameFieldSelect}
            onChange={(event) =>
              onChange({
                type: event.target.value as FileNameSegmentConfig["type"],
                customValue: config.customValue,
              })
            }
            value={config.type}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FaChevronDown aria-hidden="true" className={styles.fileNameFieldChevron} />
        </div>
      </div>
    </label>
  );
}

export function SelectField({
  ariaLabel,
  children,
  className,
  onChange,
  value,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  value: string;
}) {
  return (
    <div className={`${styles.selectField} ${className ?? ""}`.trim()}>
      <select
        aria-label={ariaLabel}
        className={styles.selectFieldNative}
        onChange={onChange}
        value={value}
      >
        {children}
      </select>
      <FaChevronDown aria-hidden="true" className={styles.selectFieldChevron} />
    </div>
  );
}

export function PreviewBackgroundColorPanel({
  applyPreviewBackgroundColor,
  previewBackgroundColor,
  previewPickerColor,
  presets,
  transparentValue,
  t,
}: {
  applyPreviewBackgroundColor: (color: string) => void;
  previewBackgroundColor: string;
  previewPickerColor: string;
  presets: readonly string[];
  transparentValue: string;
  t: SpriteEditorTranslation;
}) {
  return (
    <div className={styles.previewColorPanel}>
      <div className={styles.previewColorHeader}>
        <span>{t("preview.background")}</span>
        <span
          aria-hidden="true"
          className={`${styles.previewColorCurrent} ${
            previewBackgroundColor === transparentValue ? styles.previewColorTransparent : ""
          }`}
          style={
            previewBackgroundColor === transparentValue
              ? undefined
              : { backgroundColor: previewBackgroundColor }
          }
        />
      </div>

      <div className={styles.previewColorPresets}>
        {presets.map((color) => (
          <button
            aria-label={t("preview.backgroundPreset", {
              color: color === transparentValue ? t("preview.transparent") : color,
            })}
            className={`${styles.previewColorSwatch} ${
              previewBackgroundColor.toLowerCase() === color.toLowerCase()
                ? styles.previewColorSwatchActive
                : ""
            } ${color === transparentValue ? styles.previewColorTransparent : ""}`}
            key={color}
            onClick={() => applyPreviewBackgroundColor(color)}
            style={color === transparentValue ? undefined : { backgroundColor: color }}
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
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{value}</div>
    </div>
  );
}

export function SortablePreviewTile({
  id,
  imageUrl,
  name,
  width,
  height,
  onDelete,
}: {
  id: string;
  imageUrl: string;
  name: string;
  width: number;
  height: number;
  onDelete: (frameId: string) => void;
}) {
  const suppressClickUntilRef = useRef(0);
  const wasDraggingRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
    });

  useEffect(() => {
    if (wasDraggingRef.current && !isDragging) {
      suppressClickUntilRef.current = performance.now() + 180;
    }

    wasDraggingRef.current = isDragging;
  }, [isDragging]);

  return (
    <div
      className={`${styles.previewTile} ${isDragging ? styles.previewTileDragging : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? "none" : transition,
      }}
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
            aria-label="Delete"
            className={styles.previewTileDelete}
            onClick={(event) => {
              if (performance.now() < suppressClickUntilRef.current) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onDelete(String(id));
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
