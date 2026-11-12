export type DropAction = "link" | "embed" | "default";

export interface AttachmentLinkRuleSettings {
  linkExtensions: string;
  embedExtensions: string;
  unlistedAction?: "default" | "link";
}

export const FORMAT_EVENT = "attachment-link-rules:format-v1";

export const DEFAULT_SETTINGS: AttachmentLinkRuleSettings = {
  unlistedAction: "default",
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
    unlistedAction: value?.unlistedAction === "link" ? "link" : "default",
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
  if (!extension) return settings.unlistedAction === "link" ? "link" : "default";

  const linkExtensions = new Set(normalizeExtensionList(settings.linkExtensions));
  if (linkExtensions.has(extension)) return "link";

  const embedExtensions = new Set(normalizeExtensionList(settings.embedExtensions));
  if (embedExtensions.has(extension)) return "embed";

  return settings.unlistedAction === "link" ? "link" : "default";
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
  return analyzeInsertedAttachments(before, after, settings).edit;
}

export function analyzeInsertedAttachments(
  before: string,
  after: string,
  settings: AttachmentLinkRuleSettings,
  acceptsFile?: (target: string) => boolean,
): { edit: InsertedAttachmentEdit | null; insertedCount: number } {
  if (before === after) return { edit: null, insertedCount: 0 };

  const analyze = (fromOffset: number, toOffset: number, protectedLinks?: Set<string>, oldCounts = new Map<string, number>()) => {
    const inserted = after.slice(fromOffset, toOffset);
    let insertedCount = 0;
    const replacement = rewriteAttachmentLinks(inserted, settings, protectedLinks, link => {
      const remaining = oldCounts.get(link) ?? 0;
      if (remaining > 0) oldCounts.set(link, remaining - 1);
      else insertedCount += 1;
    }, acceptsFile);
    return {
      edit: replacement === inserted ? null : { fromOffset, toOffset, replacement },
      insertedCount,
    };
  };

  const insertionLength = after.length - before.length;
  if (insertionLength > 0) {
    const commonPrefix = commonPrefixLength(before, after);
    const earliestCandidate = Math.max(0, commonPrefix - insertionLength);
    let candidate: number | null = null;
    let validPositions = 0;
    for (let position = commonPrefix; position >= earliestCandidate; position -= 1) {
      const beforePrefix = before.slice(0, position);
      const beforeSuffix = before.slice(position);
      if (!after.startsWith(beforePrefix) || !after.endsWith(beforeSuffix)) continue;

      validPositions += 1;
      const result = analyze(position, position + insertionLength);
      if (candidate === null && result.insertedCount > 0) candidate = position;
      if (candidate !== null && validPositions > 1) {
        const protectedLinks = new Set<string>();
        rewriteAttachmentLinks(before, settings, undefined, link => { protectedLinks.add(link); });
        return analyze(candidate, candidate + insertionLength, protectedLinks);
      }
    }
    if (candidate !== null) return analyze(candidate, candidate + insertionLength);
  }

  const prefixLength = commonPrefixLength(before, after);
  const suffixLength = commonSuffixLength(before, after, prefixLength);
  const insertedEnd = after.length - suffixLength;
  // A disjoint edit can span unchanged old links. Protect every pre-existing
  // token rather than guessing which identical occurrence came from the drop.
  const protectedLinks = new Set<string>();
  rewriteAttachmentLinks(before, settings, undefined, link => { protectedLinks.add(link); });
  const oldCounts = new Map<string, number>();
  rewriteAttachmentLinks(before.slice(prefixLength, before.length - suffixLength), settings, undefined,
    link => { oldCounts.set(link, (oldCounts.get(link) ?? 0) + 1); }, acceptsFile);
  return analyze(prefixLength, insertedEnd, protectedLinks, oldCounts);
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
  protectedLinks?: Set<string>,
  found?: (link: string) => void,
  acceptsFile?: (target: string) => boolean,
): string {
  const withWikiLinks = value.replace(
    /(!?)\[\[([^\]|#]+)([^\]]*)\]\]/g,
    (match, _prefix: string, target: string) => {
      if (acceptsFile && !acceptsFile(target)) return match;
      found?.(match);
      if (protectedLinks?.has(match)) return match;
      const action = actionForFileName(target, settings);
      return applyDropAction(match, action);
    },
  );

  return withWikiLinks.replace(
    /(!?)\[([^\]]*)\]\((<[^>]+>|[^)\s]+)([^)]*)\)/g,
    (match, _prefix: string, _label: string, rawTarget: string) => {
      const target = decodeLinkTarget(rawTarget);
      if (acceptsFile && !acceptsFile(target)) return match;
      found?.(match);
      if (protectedLinks?.has(match)) return match;
      const action = actionForFileName(target, settings);
      return applyDropAction(match, action);
    },
  );
}

/** Match native destinations without reading or owning attachment storage. */
export function matchesDroppedFileName(target: string, fileNames: string[]): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
  const name = decodeLinkTarget(target).split("/").pop()?.normalize("NFC").toLowerCase();
  return fileNames.some(fileName => {
    const original = fileName.normalize("NFC").toLowerCase();
    if (name === original) return true;
    const dot = original.lastIndexOf(".");
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : "";
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escape(stem)} (?:[1-9]\\d*|\\([1-9]\\d*\\))${escape(extension)}$`).test(name ?? "");
  });
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

/** Optional synchronous formatting protocol for importers; no attachment I/O. */
export function formatAttachmentRequest(input: unknown, settings: AttachmentLinkRuleSettings): boolean {
  if (!input || typeof input !== "object") return false;
  const request = input as Record<string, unknown>;
  if (request.version !== 1 || request.handled !== false || typeof request.fileName !== "string" || typeof request.link !== "string") return false;
  request.link = applyDropAction(request.link, actionForFileName(request.fileName, settings));
  request.handled = true;
  return true;
}
