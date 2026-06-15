import {
  DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN,
  MAX_TREE_ANNOTATION_COMMENT_COLUMN,
  MIN_TREE_ANNOTATION_COMMENT_COLUMN,
  TREE_ANNOTATION_COMMENT_PREFIXES,
  TREE_ANNOTATION_TEMPLATE_PLACEHOLDER,
} from './types';
import type {
  AnnotatedAsciiTreeRenderOptions,
  AnnotatedAsciiTreeRenderOptionsConfig,
  TreeAnnotationCommentPrefix,
} from './types';

/**
 * Date: 2026-06-08
 * Desc: Normalizes annotated ASCII tree render options
 */

/**
 * Builds an annotation comment template from a prefix and placeholder
 * @param commentPrefix Comment prefix such as # or //
 * @param includeSpace Whether to insert a space between prefix and placeholder
 * @returns Comment template containing the annotation placeholder
 */
export function createTreeAnnotationPresetTemplate(
  commentPrefix: TreeAnnotationCommentPrefix | string,
  includeSpace = true
): string {
  return `${commentPrefix}${includeSpace ? ' ' : ''}${TREE_ANNOTATION_TEMPLATE_PLACEHOLDER}`;
}

/**
 * Normalizes host annotation configuration into render options
 * @param config Annotation render configuration from a host application
 * @returns Normalized annotated ASCII tree render options
 */
export function createAnnotatedAsciiTreeRenderOptionsFromConfig(
  config: AnnotatedAsciiTreeRenderOptionsConfig
): AnnotatedAsciiTreeRenderOptions {
  const options: AnnotatedAsciiTreeRenderOptions = {};

  if (config.alignmentMode !== undefined) {
    options.alignmentMode = config.alignmentMode;
  }

  if (config.commentColumn !== undefined) {
    options.commentColumn = clampTreeAnnotationCommentColumn(
      config.commentColumn
    );
  }

  const commentTemplate = resolveAnnotatedAsciiTreeCommentTemplate(config);

  if (commentTemplate !== undefined) {
    options.commentTemplate = commentTemplate;
  }

  if (config.gap !== undefined) {
    options.gap = config.gap;
  }

  if (config.gapPaddingMode !== undefined) {
    options.gapPaddingMode = config.gapPaddingMode;
  }

  if (config.rootCommentOffset !== undefined) {
    options.rootCommentOffset = config.rootCommentOffset;
  }

  return options;
}

/**
 * Finds the preset prefix that matches a comment template
 * @param commentTemplate Comment template to inspect
 * @returns Matching preset prefix, or null when the template is custom
 */
export function getActiveTreeAnnotationPresetPrefix(
  commentTemplate: string
): TreeAnnotationCommentPrefix | null {
  return (
    TREE_ANNOTATION_COMMENT_PREFIXES.find(
      prefix =>
        commentTemplate === createTreeAnnotationPresetTemplate(prefix, true) ||
        commentTemplate === createTreeAnnotationPresetTemplate(prefix, false)
    ) ?? null
  );
}

/**
 * Detects whether a preset comment template includes a trailing space
 * @param commentTemplate Comment template to inspect
 * @returns True or false for preset templates, or null when the template is custom
 */
export function getTreeAnnotationPresetSpacing(
  commentTemplate: string
): boolean | null {
  const activePrefix = getActiveTreeAnnotationPresetPrefix(commentTemplate);

  if (activePrefix === null) {
    return null;
  }

  return (
    commentTemplate === createTreeAnnotationPresetTemplate(activePrefix, true)
  );
}

/**
 * Clamps a comment column into the supported range
 * @param commentColumn Requested comment column
 * @returns Comment column constrained to the allowed bounds
 */
export function clampTreeAnnotationCommentColumn(
  commentColumn: number
): number {
  if (!Number.isFinite(commentColumn)) {
    return DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN;
  }

  return Math.min(
    MAX_TREE_ANNOTATION_COMMENT_COLUMN,
    Math.max(MIN_TREE_ANNOTATION_COMMENT_COLUMN, Math.round(commentColumn))
  );
}

/**
 * Resolves the effective comment template from options or a fallback prefix
 * @param options Render options that may include a template or prefix
 * @param fallbackPrefix Prefix used when options omit template and prefix
 * @returns Comment template containing the annotation placeholder
 */
export function resolveTreeAnnotationTemplate(
  options: AnnotatedAsciiTreeRenderOptions,
  fallbackPrefix: string
): string {
  if (options.commentTemplate?.includes(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER)) {
    return options.commentTemplate;
  }

  return createTreeAnnotationPresetTemplate(
    options.commentPrefix ?? fallbackPrefix
  );
}

/**
 * Resolves a serializable comment template from host configuration
 * @param config Annotation render configuration from a host application
 * @returns Custom or preset template, or undefined when no comment settings exist
 */
function resolveAnnotatedAsciiTreeCommentTemplate(
  config: AnnotatedAsciiTreeRenderOptionsConfig
): string | undefined {
  if (config.commentTemplate?.includes(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER)) {
    return config.commentTemplate;
  }

  if (config.commentPrefix !== undefined) {
    return createTreeAnnotationPresetTemplate(
      config.commentPrefix,
      config.commentPrefixHasSpace ?? true
    );
  }

  return undefined;
}
