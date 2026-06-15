import type { FileNode } from '../reader/types';

/**
 * Date: 2026-06-07
 * Desc: Defines ASCII tree rendering types and presets
 */

// Public connector style identifiers supported by ASCII rendering
export const ASCII_TREE_CONNECTOR_STYLES = ['unicode', 'ascii'] as const;
export type AsciiTreeConnectorStyle =
  (typeof ASCII_TREE_CONNECTOR_STYLES)[number];

export interface AsciiTreeConnectorParts {
  vertical: string;
  branch: string;
  horizontal: string;
  lastBranch: string;
}

export type AsciiTreeConnectorPartKey = keyof AsciiTreeConnectorParts;

export interface AsciiTreeConnectorPartPreset {
  id: string;
  connectorParts: AsciiTreeConnectorParts;
}

// Connector part keys used by custom connector presets
export const ASCII_TREE_CONNECTOR_PART_KEYS = [
  'vertical',
  'branch',
  'horizontal',
  'lastBranch',
] as const satisfies AsciiTreeConnectorPartKey[];

// Named connector part presets grouped by connector style
export const ASCII_TREE_CONNECTOR_PART_PRESETS: Record<
  AsciiTreeConnectorStyle,
  readonly AsciiTreeConnectorPartPreset[]
> = {
  unicode: [
    {
      id: 'unicode-default',
      connectorParts: {
        vertical: '│',
        branch: '├',
        horizontal: '─',
        lastBranch: '└',
      },
    },
  ],
  ascii: [
    {
      id: 'ascii-backtick',
      connectorParts: {
        vertical: '|',
        branch: '|',
        horizontal: '-',
        lastBranch: '`',
      },
    },
    {
      id: 'ascii-backslash',
      connectorParts: {
        vertical: '|',
        branch: '+',
        horizontal: '-',
        lastBranch: '\\',
      },
    },
  ],
};

// Default connector parts used for each connector style
export const ASCII_TREE_CONNECTOR_PRESETS: Record<
  AsciiTreeConnectorStyle,
  AsciiTreeConnectorParts
> = {
  unicode: ASCII_TREE_CONNECTOR_PART_PRESETS.unicode[0]!.connectorParts,
  ascii: ASCII_TREE_CONNECTOR_PART_PRESETS.ascii[0]!.connectorParts,
};

// Public indentation style identifiers supported by ASCII rendering
export const ASCII_TREE_INDENTATION_STYLES = [
  'spaces-2',
  'spaces-4',
  'tab-1',
  'tab-2',
] as const;
export type AsciiTreeIndentationStyle =
  (typeof ASCII_TREE_INDENTATION_STYLES)[number];

export type AsciiTreeRootLabelMode = 'name' | 'dot';

// Default metadata template used when metadata rendering is enabled
export const DEFAULT_ASCII_TREE_METADATA_TEMPLATE =
  '[%size% | %YYYY-MM-DD HH:mm%]  %filename%';

// Metadata template presets surfaced by playground and package consumers
export const ASCII_TREE_METADATA_STYLE_TEMPLATES = {
  'prefix-brackets': '[%size% | %YYYY-MM-DD HH:mm%]  %filename%',
  'prefix-brackets-date': '[%size% | %YYYY-MM-DD%]  %filename%',
  'prefix-brackets-bytes': '[%bytes% | %YYYY-MM-DD HH:mm%]  %filename%',
  'suffix-parentheses': '%filename% (%size% | %YYYY-MM-DD HH:mm%)',
  'suffix-parentheses-date': '%filename% (%size% | %YYYY-MM-DD%)',
  'suffix-parentheses-bytes': '%filename% (%bytes% | %YYYY-MM-DD HH:mm%)',
} as const;

export type AsciiTreeMetadataPresetStyle =
  keyof typeof ASCII_TREE_METADATA_STYLE_TEMPLATES;

// Sentinel style used when consumers pass a custom metadata template
export const CUSTOM_ASCII_TREE_METADATA_STYLE = 'custom';

export type AsciiTreeMetadataStyle =
  | AsciiTreeMetadataPresetStyle
  | typeof CUSTOM_ASCII_TREE_METADATA_STYLE;

// Metadata preset identifiers derived from the template map
export const ASCII_TREE_METADATA_PRESET_STYLES = Object.keys(
  ASCII_TREE_METADATA_STYLE_TEMPLATES
) as AsciiTreeMetadataPresetStyle[];

// All supported metadata style identifiers including custom templates
export const ASCII_TREE_METADATA_STYLES = [
  ...ASCII_TREE_METADATA_PRESET_STYLES,
  CUSTOM_ASCII_TREE_METADATA_STYLE,
] as const;

export interface AsciiTreeRenderContext {
  depth: number;
  isRoot: boolean;
  defaultLabel: string;
}

export interface AsciiTreeLine {
  node: FileNode;
  path: string;
  depth: number;
  isRoot: boolean;
  isSynthetic?: boolean;
  text: string;
}

export interface AsciiTreeOptions {
  connectorStyle?: AsciiTreeConnectorStyle;
  connectorParts?: Partial<AsciiTreeConnectorParts>;
  indentationStyle?: AsciiTreeIndentationStyle;
  showLineNumbers?: boolean;
  appendDirectorySlash?: boolean;
  showRoot?: boolean;
  rootLabelMode?: AsciiTreeRootLabelMode;
  showFileSize?: boolean;
  showModifiedTime?: boolean;
  metadataStyle?: AsciiTreeMetadataStyle;
  metadataTemplate?: string;
  showFullPath?: boolean;
  renderNodeLabel?: (node: FileNode, context: AsciiTreeRenderContext) => string;
}
