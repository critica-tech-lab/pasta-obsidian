import { App, PluginSettingTab, Setting } from "obsidian";
import { EthersyncFolder, ETHERSYNC_BINARY_NAME } from "./utils/ethersync";
import PastaSyncPlugin from "./main";
import { AdvancedSettingsModal } from "./modals/AdvancedSettingsModal";
import { ShareCodeModal } from "./modals/ShareCodeModal";
import { ensureBinaryResponds } from "./utils/binary";

export type EthersyncBinaryLocation = "auto" | "custom";

export type PastaSyncSettings = {
	folders: Map<string, EthersyncFolder>;
	ethersyncBinaryLocation: EthersyncBinaryLocation;
	ethersyncCustomBinaryPath?: string;
};

export const PASTA_SYNC_DEFAULT_SETTINGS: PastaSyncSettings = {
	folders: new Map(),
	ethersyncBinaryLocation: "auto",
	ethersyncCustomBinaryPath: "",
};

export function getEthersyncBinary(settings: PastaSyncSettings) {
	if (settings.ethersyncBinaryLocation === "auto") {
		return ETHERSYNC_BINARY_NAME;
	}

	return settings.ethersyncCustomBinaryPath;
}

export class PastaSettingsTab extends PluginSettingTab {
	plugin: PastaSyncPlugin;

	constructor(app: App, plugin: PastaSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display() {
		const { containerEl } = this;
		const { folders } = this.plugin.settings;

		const version = await this.getEthersyncVersion();

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

		new Setting(containerEl)
			.setName("Advanced settings")
			.setDesc("Customize Pasta to your needs")
			.setClass("pasta-settings-advanced")
			.addButton((btn) =>
				btn.setButtonText("Open Advanced settings").onClick(() => {
					new AdvancedSettingsModal(this.app, this.plugin).open();
				}),
			);

		new Setting(containerEl)
			.setName("Ethersync version")
			.setDesc(version ?? "Not found")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Refresh")
					.onClick(async () => {
						await this.display();
					});
			});
	}

	private async getEthersyncVersion() {
		const binary = getEthersyncBinary(this.plugin.settings);

		if (!binary) {
			return;
		}

		try {
			const version = await ensureBinaryResponds(binary);
			return version;
		} catch (err) {
			console.error("Failed to detect ethersync version", err);
		}
	}
}
