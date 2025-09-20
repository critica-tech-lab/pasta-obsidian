import { App, PluginSettingTab, Setting } from "obsidian";
import { EthersyncFolder } from "./ethersync";
import PastaSyncPlugin from "./main";
import { ShareCodeModal } from "./modals/ShareCodeModal";

export type PastaSyncSettings = {
	folders: Map<string, EthersyncFolder>;
};

export const PASTA_SYNC_DEFAULT_SETTINGS: PastaSyncSettings = {
	folders: new Map(),
};

export class PastaSettingsTab extends PluginSettingTab {
	plugin: PastaSyncPlugin;

	constructor(app: App, plugin: PastaSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const { folders } = this.plugin.settings;

		containerEl.empty();

		new Setting(containerEl)
			.setHeading()
			.setName("Folders")
			.addButton((btn) => {
				btn.setButtonText("Share folder")
					.setCta()
					.onClick(() =>
						this.plugin.openShareFolderModal(() => this.display()),
					);
			})
			.addButton((btn) => {
				btn.setButtonText("Join remote folder")
					.setCta()
					.onClick(() => this.plugin.openJoinFolderModal());
			});

		if (folders.size > 0) {
			for (const [id, folder] of folders) {
				const setting = new Setting(containerEl).setName(folder.path);

				setting.addExtraButton((btn) => {
					btn.setIcon("trash-2");
					btn.setTooltip("Remove");
					btn.onClick(async () => {
						await this.plugin.removeFolder(folder.path);
						this.display();
					});
				});

				if (folder.mode === "share") {
					setting.addExtraButton((btn) => {
						btn.setIcon("share")
							.setTooltip("Share")
							.onClick(() => {
								const folder = folders.get(id);

								if (folder) {
									new ShareCodeModal(
										this.app,
										folder.shareCode ?? "",
									).open();
								}
							});
					});
				}

				setting.addToggle((toggle) =>
					toggle
						.setValue(!!folder.enabled)
						.onChange(async (enabled) => {
							if (enabled) {
								await this.plugin.enableFolder(folder.path);
							} else {
								await this.plugin.disableFolder(folder.path);
							}
						}),
				);
			}
		} else {
			new Setting(containerEl).setDesc("No folders shared or joined");
		}
	}
}
