import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";

import {
  AttachmentLinkRuleSettings,
  DEFAULT_SETTINGS,
  FORMAT_EVENT,
  formatAttachmentRequest,
  analyzeInsertedAttachments,
  matchesDroppedFileName,
  normalizeSettings,
} from "./core";

const DROP_OBSERVATION_MS = 60_000;

interface PendingDrop {
  view: MarkdownView;
  filePath: string | undefined;
  before: string;
  event: Event;
  remaining: number;
  fileNames: string[] | null;
  expiry: number;
  check: number | null;
}

export default class AttachmentLinkRulesPlugin extends Plugin {
  settings: AttachmentLinkRuleSettings = DEFAULT_SETTINGS;
  private pendingDrops = new Map<Editor, PendingDrop>();
  private managedDrops = new WeakSet<Event>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new AttachmentLinkRulesSettingTab(this));

    const documents = new WeakSet<Document>();
    const registerFormatter = (doc: Document): void => {
      if (documents.has(doc)) return;
      documents.add(doc);
      this.registerDomEvent(doc, "drop", event => {
        let view: MarkdownView | undefined;
        this.app.workspace.iterateAllLeaves(leaf => {
          if (leaf.view instanceof MarkdownView && event.target && leaf.view.containerEl.contains(event.target as Node)) view = leaf.view;
        });
        if (!view) return;
        this.observeDrop(view, event);
      }, { capture: true });
      const handler = (event: Event): void => {
        formatAttachmentRequest((event as CustomEvent<unknown>).detail, this.settings);
      };
      const claimHandler = (event: Event): void => {
        const detail: unknown = (event as CustomEvent<unknown>).detail;
        if (!detail || typeof detail !== "object") return;
        const request = detail as Record<string, unknown>;
        const EventClass = doc.defaultView?.Event;
        if (request.version === 1 && EventClass && request.event instanceof EventClass) this.managedDrops.add(request.event);
      };
      doc.addEventListener(FORMAT_EVENT, handler);
      doc.addEventListener("attachment-link-rules:managed-drop-v1", claimHandler);
      this.register(() => {
        doc.removeEventListener(FORMAT_EVENT, handler);
        doc.removeEventListener("attachment-link-rules:managed-drop-v1", claimHandler);
      });
    };
    const workspaceDocument = this.app.workspace.containerEl.ownerDocument;
    registerFormatter(workspaceDocument);
    this.app.workspace.iterateAllLeaves(leaf => registerFormatter(leaf.view.containerEl.ownerDocument));
    this.registerEvent(this.app.workspace.on("window-open", (_workspace, win) => registerFormatter(win.document)));
    this.registerEvent(this.app.workspace.on("editor-change", editor => this.queueDropCheck(editor)));
  }

  onunload(): void {
    for (const editor of this.pendingDrops.keys()) this.stopObservingDrop(editor);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData() as Partial<AttachmentLinkRuleSettings> | null;
    this.settings = normalizeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
  }

  private observeDrop(view: MarkdownView, event: Event): void {
    const editor = view.editor;
    const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
    this.stopObservingDrop(editor);
    this.pendingDrops.set(editor, {
      view, filePath: view.file?.path, before: editor.getValue(), event,
      remaining: Math.max(1, (event as DragEvent).dataTransfer?.files.length ?? 0),
      fileNames: files.length > 0 ? files.map(file => file.name) : null,
      expiry: window.setTimeout(() => this.stopObservingDrop(editor), DROP_OBSERVATION_MS),
      check: null,
    });
    this.queueDropCheck(editor);
  }

  private queueDropCheck(editor: Editor): void {
    const pending = this.pendingDrops.get(editor);
    if (!pending) return;
    if (pending.check !== null) window.clearTimeout(pending.check);
    // Defer outside the editor-change transaction before calling replaceRange.
    pending.check = window.setTimeout(() => this.checkPendingDrop(editor), 0);
  }

  private checkPendingDrop(editor: Editor): void {
    const pending = this.pendingDrops.get(editor);
    if (!pending) return;
    pending.check = null;
    if (this.managedDrops.has(pending.event)
      || pending.view.editor !== editor || pending.view.file?.path !== pending.filePath) {
      this.stopObservingDrop(editor);
      return;
    }
    const after = editor.getValue();
    const { edit, insertedCount } = analyzeInsertedAttachments(pending.before, after, this.settings,
      pending.fileNames ? target => matchesDroppedFileName(target, pending.fileNames ?? []) : undefined);
    if (insertedCount === 0) {
      pending.before = after;
      // Internal vault/text drags may insert synchronously, but cannot justify
      // observing unrelated typing after their first deferred check.
      if (!pending.fileNames) this.stopObservingDrop(editor);
      else pending.check = window.setTimeout(() => this.checkPendingDrop(editor), 250);
      return;
    }
    pending.remaining -= insertedCount;
    pending.before = edit
      ? after.slice(0, edit.fromOffset) + edit.replacement + after.slice(edit.toOffset)
      : after;
    if (pending.remaining <= 0) this.stopObservingDrop(editor);
    else pending.check = window.setTimeout(() => this.checkPendingDrop(editor), 250);
    if (edit) editor.replaceRange(edit.replacement, editor.offsetToPos(edit.fromOffset), editor.offsetToPos(edit.toOffset));
  }

  private stopObservingDrop(editor: Editor): void {
    const pending = this.pendingDrops.get(editor);
    if (!pending) return;
    window.clearTimeout(pending.expiry);
    if (pending.check !== null) window.clearTimeout(pending.check);
    this.pendingDrops.delete(editor);
  }
}

class AttachmentLinkRulesSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: AttachmentLinkRulesPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.renderLegacySettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Extension rules",
        items: [
          {
            name: "Link extensions",
            desc: "Dropped files with these extensions use link syntax without an exclamation mark. Separate values with spaces or commas.",
            render: (setting) => {
              setting.addTextArea((textArea) => textArea
                .setPlaceholder("PDF docx xlsx")
                .setValue(this.plugin.settings.linkExtensions)
                .onChange(async (value) => {
                  this.plugin.settings.linkExtensions = value;
                  await this.plugin.saveSettings();
                }));
            },
          },
          {
            name: "Embed extensions",
            desc: "Dropped files with these extensions use embed syntax with an exclamation mark. Link rules take priority when an extension appears in both lists.",
            render: (setting) => {
              setting.addTextArea((textArea) => textArea
                .setPlaceholder("PNG JPG webp")
                .setValue(this.plugin.settings.embedExtensions)
                .onChange(async (value) => {
                  this.plugin.settings.embedExtensions = value;
                  await this.plugin.saveSettings();
                }));
            },
          },
          {
            name: "Unlisted extensions",
            desc: "Choose how other file types are inserted.",
            render: (setting) => {
              setting.addDropdown(dropdown => dropdown
                .addOption("default", "Keep native behavior")
                .addOption("link", "Use links")
                .setValue(this.plugin.settings.unlistedAction ?? "default")
                .onChange(async value => {
                  this.plugin.settings.unlistedAction = value === "link" ? "link" : "default";
                  await this.plugin.saveSettings();
                }));
            },
          },
          {
            name: "Restore defaults",
            desc: "Restore PDF and office files as links, and common image, audio, and video files as embeds.",
            render: (setting) => {
              setting.addButton((button) => button
                .setButtonText("Restore")
                .onClick(async () => {
                  await this.restoreDefaults();
                  if (requireApiVersion("1.13.0")) this.update();
                }));
            },
          },
        ],
      },
    ];
  }

  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Extension rules")
      .setHeading();

    new Setting(containerEl)
      .setName("Link extensions")
      .setDesc("Dropped files with these extensions use link syntax without an exclamation mark. Separate values with spaces or commas.")
      .addTextArea((textArea) => textArea
        .setPlaceholder("PDF docx xlsx")
        .setValue(this.plugin.settings.linkExtensions)
        .onChange(async (value) => {
          this.plugin.settings.linkExtensions = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Embed extensions")
      .setDesc("Dropped files with these extensions use embed syntax with an exclamation mark. Link rules take priority when an extension appears in both lists.")
      .addTextArea((textArea) => textArea
        .setPlaceholder("PNG JPG webp")
        .setValue(this.plugin.settings.embedExtensions)
        .onChange(async (value) => {
          this.plugin.settings.embedExtensions = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Unlisted extensions")
      .setDesc("Choose how other file types are inserted.")
      .addDropdown(dropdown => dropdown
        .addOption("default", "Keep native behavior")
        .addOption("link", "Use links")
        .setValue(this.plugin.settings.unlistedAction ?? "default")
        .onChange(async value => {
          this.plugin.settings.unlistedAction = value === "link" ? "link" : "default";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Restore defaults")
      .setDesc("Restore PDF and office files as links, and common image, audio, and video files as embeds.")
      .addButton((button) => button
        .setButtonText("Restore")
        .onClick(async () => {
          await this.restoreDefaults();
          this.renderLegacySettings();
        }));
  }

  private async restoreDefaults(): Promise<void> {
    this.plugin.settings = { ...DEFAULT_SETTINGS };
    await this.plugin.saveSettings();
    new Notice("Attachment link rules restored.");
  }
}
