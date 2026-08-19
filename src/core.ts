export type DropAction = "link" | "embed" | "default";

export interface AttachmentLinkRuleSettings {
  linkExtensions: string;
  embedExtensions: string;
}

export const DEFAULT_SETTINGS: AttachmentLinkRuleSettings = {
  linkExtensions: "pdf doc docx xls xlsx ppt pptx zip 7z rar",
  embedExtensions: "png jpg jpeg gif webp svg avif bmp mp3 wav m4a ogg flac mp4 webm mov",
};

export function normalizeExtensionList(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\s,;]+/)
      .map((extension) => extension.trim().toLowerCase().replace(/^\.+/, ""))
      .filter((extension) => /^[a-z0-9][a-z0-9+_-]*$/.test(extension)),
  ));
}

export function normalizeSettings(
  value: Partial<AttachmentLinkRuleSettings> | null | undefined,
): AttachmentLinkRuleSettings {
  return {
    linkExtensions: normalizeExtensionList(value?.linkExtensions ?? DEFAULT_SETTINGS.linkExtensions).join(" "),
    embedExtensions: normalizeExtensionList(value?.embedExtensions ?? DEFAULT_SETTINGS.embedExtensions).join(" "),
  };
}

export function extensionFromFileName(fileName: string): string | null {
  const name = fileName.trim();
  const finalDot = name.lastIndexOf(".");
  if (finalDot <= 0 || finalDot === name.length - 1) return null;
  return name.slice(finalDot + 1).toLowerCase();
}

export function actionForFileName(
  fileName: string,
  settings: AttachmentLinkRuleSettings,
): DropAction {
  const extension = extensionFromFileName(fileName);
  if (!extension) return "default";

  const linkExtensions = new Set(normalizeExtensionList(settings.linkExtensions));
  if (linkExtensions.has(extension)) return "link";

  const embedExtensions = new Set(normalizeExtensionList(settings.embedExtensions));
  if (embedExtensions.has(extension)) return "embed";

  return "default";
}

export function applyDropAction(markdownLink: string, action: DropAction): string {
  if (action === "default") return markdownLink;
  if (action === "link") return markdownLink.replace(/^!/, "");
  return markdownLink.startsWith("!") ? markdownLink : `!${markdownLink}`;
}

export function formatDroppedLinks(markdownLinks: string[]): string {
  return markdownLinks.join("\n");
}

export interface RewriteResult {
  changed: boolean;
  text: string;
}

export interface InsertedAttachmentEdit {
  fromOffset: number;
  toOffset: number;
  replacement: string;
}

export function buildInsertedAttachmentEdit(
  before: string,
  after: string,
  settings: AttachmentLinkRuleSettings,
): InsertedAttachmentEdit | null {
  if (before === after) return null;

  const insertionLength = after.length - before.length;
  if (insertionLength > 0) {
    const commonPrefix = commonPrefixLength(before, after);
    const earliestCandidate = Math.max(0, commonPrefix - insertionLength);
    for (let position = commonPrefix; position >= earliestCandidate; position -= 1) {
      const beforePrefix = before.slice(0, position);
      const beforeSuffix = before.slice(position);
      if (!after.startsWith(beforePrefix) || !after.endsWith(beforeSuffix)) continue;

      const inserted = after.slice(position, position + insertionLength);
      const rewritten = rewriteAttachmentLinks(inserted, settings);
      if (rewritten !== inserted) {
        return {
          fromOffset: position,
          toOffset: position + insertionLength,
          replacement: rewritten,
        };
      }
    }
  }

  const prefixLength = commonPrefixLength(before, after);
  const suffixLength = commonSuffixLength(before, after, prefixLength);
  const insertedEnd = after.length - suffixLength;
  const inserted = after.slice(prefixLength, insertedEnd);
  const rewritten = rewriteAttachmentLinks(inserted, settings);
  if (rewritten === inserted) return null;

  return {
    fromOffset: prefixLength,
    toOffset: insertedEnd,
    replacement: rewritten,
  };
}

export function rewriteInsertedAttachmentSyntax(
  before: string,
  after: string,
  settings: AttachmentLinkRuleSettings,
): RewriteResult {
  const edit = buildInsertedAttachmentEdit(before, after, settings);
  if (!edit) return { changed: false, text: after };

  return {
    changed: true,
    text: `${after.slice(0, edit.fromOffset)}${edit.replacement}${after.slice(edit.toOffset)}`,
  };
}

function rewriteAttachmentLinks(
  value: string,
  settings: AttachmentLinkRuleSettings,
): string {
  const withWikiLinks = value.replace(
    /(!?)\[\[([^\]|#]+)([^\]]*)\]\]/g,
    (match, _prefix: string, target: string) => {
      const action = actionForFileName(target, settings);
      return applyDropAction(match, action);
    },
  );

  return withWikiLinks.replace(
    /(!?)\[([^\]]*)\]\((<[^>]+>|[^)\s]+)([^)]*)\)/g,
    (match, _prefix: string, _label: string, rawTarget: string) => {
      const target = decodeLinkTarget(rawTarget);
      const action = actionForFileName(target, settings);
      return applyDropAction(match, action);
    },
  );
}

function decodeLinkTarget(rawTarget: string): string {
  const unwrapped = rawTarget.startsWith("<") && rawTarget.endsWith(">")
    ? rawTarget.slice(1, -1)
    : rawTarget;
  try {
    return decodeURIComponent(unwrapped);
  } catch {
    return unwrapped;
  }
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (
    length < limit
    && left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length += 1;
  }
  return length;
}
