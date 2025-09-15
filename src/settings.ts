import { App, PluginSettingTab, Setting } from "obsidian";
import { EthersyncFolder } from "./ethersync";
import PastaSyncPlugin from "./main";

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
			folders.forEach((entry) => {
				new Setting(containerEl)
					.setName(entry.path)
					.addExtraButton((btn) => {
						btn.setIcon("trash-2");
						btn.setTooltip("Remove");
						btn.onClick(async () => {
							await this.plugin.removeFolder(entry.path);
							this.display(); // re-render UI
						});
					})
					.addToggle(
						(toggle) => toggle.setValue(!!entry.enabled),
						// .onChange((value) => onToggle(index, value)),
					);
			});
		} else {
			new Setting(containerEl).setDesc("No folders shared or joined");
		}
	}
}
