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
  buildInsertedAttachmentEdit,
  normalizeSettings,
} from "./core";

const DROP_RETRY_DELAYS_MS = [0, 30, 100, 250, 500];

export default class AttachmentLinkRulesPlugin extends Plugin {
  settings: AttachmentLinkRuleSettings = DEFAULT_SETTINGS;
  private pendingTimers = new Set<number>();
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
        this.scheduleRewrite(view.editor, view.editor.getValue(), 0, event);
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

  }

  onunload(): void {
    this.pendingTimers.forEach((timer) => window.clearTimeout(timer));
    this.pendingTimers.clear();
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData() as Partial<AttachmentLinkRuleSettings> | null;
    this.settings = normalizeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
  }

  private scheduleRewrite(editor: Editor, before: string, attempt: number, dropEvent: Event): void {
    const delay = DROP_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) return;

    const timer = window.setTimeout(() => {
      this.pendingTimers.delete(timer);
      if (this.managedDrops.has(dropEvent)) return;
      const after = editor.getValue();
      const edit = buildInsertedAttachmentEdit(before, after, this.settings);

      if (edit) {
        editor.replaceRange(
          edit.replacement,
          editor.offsetToPos(edit.fromOffset),
          editor.offsetToPos(edit.toOffset),
        );
        return;
      }

      this.scheduleRewrite(editor, before, attempt + 1, dropEvent);
    }, delay);

    this.pendingTimers.add(timer);
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
