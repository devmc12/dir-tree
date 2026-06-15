import type { AsciiTreeOptions } from './types';

/**
 * Date: 2026-06-08
 * Desc: Normalizes host ASCII tree configuration into render options
 */

export interface AsciiTreeOptionsConfig {
  appendDirectorySlash?: boolean;
  connectorParts?: AsciiTreeOptions['connectorParts'];
  connectorStyle?: AsciiTreeOptions['connectorStyle'];
  indentationStyle?: AsciiTreeOptions['indentationStyle'];
  metadataStyle?: AsciiTreeOptions['metadataStyle'];
  metadataTemplate?: string;
  renderNodeLabel?: AsciiTreeOptions['renderNodeLabel'];
  rootLabelMode?: AsciiTreeOptions['rootLabelMode'];
  showFileSize?: boolean;
  showFullPath?: boolean;
  showLineNumbers?: boolean;
  showMetadata?: boolean;
  showModifiedTime?: boolean;
  showRoot?: boolean;
}

/**
 * Converts UI, CLI, or persisted ASCII configuration into render options
 * @param config ASCII tree configuration values from a host application
 * @returns Normalized ASCII tree render options without host-specific state
 */
export function createAsciiTreeOptionsFromConfig(
  config: AsciiTreeOptionsConfig
): AsciiTreeOptions {
  const options: AsciiTreeOptions = {};

  if (config.connectorStyle !== undefined) {
    options.connectorStyle = config.connectorStyle;
  }

  if (config.connectorParts !== undefined) {
    options.connectorParts = config.connectorParts;
  }

  if (config.indentationStyle !== undefined) {
    options.indentationStyle = config.indentationStyle;
  }

  if (config.showLineNumbers !== undefined) {
    options.showLineNumbers = config.showLineNumbers;
  }

  if (config.appendDirectorySlash !== undefined) {
    options.appendDirectorySlash = config.appendDirectorySlash;
  }

  if (config.showRoot !== undefined) {
    options.showRoot = config.showRoot;
  }

  if (config.rootLabelMode !== undefined) {
    options.rootLabelMode = config.rootLabelMode;
  }

  if (config.showFullPath !== undefined) {
    options.showFullPath = config.showFullPath;
  }

  const showFileSize = config.showFileSize ?? config.showMetadata;

  if (showFileSize !== undefined) {
    options.showFileSize = showFileSize;
  }

  const showModifiedTime = config.showModifiedTime ?? config.showMetadata;

  if (showModifiedTime !== undefined) {
    options.showModifiedTime = showModifiedTime;
  }

  if (config.metadataStyle !== undefined) {
    options.metadataStyle = config.metadataStyle;
  }

  if (config.metadataTemplate?.trim()) {
    options.metadataTemplate = config.metadataTemplate;
  }

  if (config.renderNodeLabel !== undefined) {
    options.renderNodeLabel = config.renderNodeLabel;
  }

  return options;
}
