import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from "obsidian";
import type PastaSyncPlugin from "../main";
import type { EthersyncBinaryLocation } from "../settings";
import { downloadLatestEthersyncBinary } from "../utils/binary";
import { getVaultBasePath } from "../vault";

export class AdvancedSettingsModal extends Modal {
	private readonly plugin: PastaSyncPlugin;
	private readonly vaultPath?: string;
	private customPathSetting?: Setting;
	private downloadSetting?: Setting;
	private downloadButton?: ButtonComponent;

	constructor(app: App, plugin: PastaSyncPlugin) {
		super(app);
		this.plugin = plugin;
		this.vaultPath = getVaultBasePath(app.vault);
	}

	onOpen() {
		const { contentEl, titleEl } = this;

		titleEl.setText("Advanced settings");
		contentEl.empty();

		this.renderEthersyncSection(contentEl);
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderEthersyncSection(containerEl: HTMLElement) {
		const locationSetting = new Setting(containerEl)
			.setName("Ethersync location")
			.setDesc("Choose how Pasta locates the `ethersync` executable.");

		locationSetting.addDropdown((dropdown) => {
			dropdown.addOption("auto", "Automatic");
			dropdown.addOption("custom", "Custom");
			dropdown.setValue(this.plugin.settings.ethersyncBinaryLocation);
			dropdown.onChange(async (value) => {
				if (!this.isBinaryLocation(value)) {
					return;
				}

				await this.updateBinaryLocation(value);

				this.updateDownloadUi();
			});
		});

		let customLocationText: TextComponent | undefined;

		this.customPathSetting = new Setting(containerEl)
			.setName("Custom Ethersync location")
			.setDesc("Full path to an `ethersync` executable.")
			.addText((text) => {
				customLocationText = text;

				text.setPlaceholder("/usr/bin/ethersync")
					.setValue(
						this.plugin.settings.ethersyncCustomBinaryPath ?? "",
					)
					.onChange(async (value) => {
						this.plugin.settings.ethersyncCustomBinaryPath =
							value.trim();
						await this.plugin.saveSettings();
					});
			});

		this.downloadSetting = new Setting(containerEl).setName(
			"Download Ethersync",
		);
		this.downloadSetting.addButton((button) => {
			button.setButtonText("Download v0.7.0");
			button.setCta();
			button.onClick(async () => {
				await this.handleDownload(button, customLocationText);
			});
			this.downloadButton = button;
			this.updateDownloadUi();
		});

		this.updateDownloadUi();
	}

	private async updateBinaryLocation(value: EthersyncBinaryLocation) {
		this.plugin.settings.ethersyncBinaryLocation = value;
		await this.plugin.saveSettings();
	}

	private async handleDownload(
		button: ButtonComponent,
		text?: TextComponent,
	) {
		if (!this.vaultPath) {
			new Notice("Vault path unavailable; cannot download ethersync.");
			return;
		}

		if (process.platform === "win32") {
			new Notice(
				"Downloading ethersync is not available on Windows yet.",
			);
			return;
		}

		if (this.plugin.settings.ethersyncBinaryLocation !== "custom") {
			new Notice(
				"Switch the binary location to 'Downloaded binary' to enable downloads.",
			);
			return;
		}

		const previousText = button.buttonEl.textContent ?? "Download latest";
		button.setDisabled(true);
		button.setButtonText("Downloading…");

		try {
			const path = await downloadLatestEthersyncBinary(this.vaultPath);
			this.plugin.settings.ethersyncCustomBinaryPath = path;
			if (text) {
				text.setValue(path);
			}
			await this.plugin.saveSettings();

			new Notice("Downloaded latest ethersync binary.");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: String(error ?? "Unknown error");
			new Notice("Download failed. Check console for details.");
			console.error(`[AdvancedSettingsModal] ${message}`, error);
		} finally {
			button.setDisabled(false);
			button.setButtonText(previousText);
			this.updateDownloadUi();
		}
	}

	private isBinaryLocation(value: string): value is EthersyncBinaryLocation {
		return value === "auto" || value === "custom";
	}

	private updateDownloadUi() {
		const usingCustom =
			this.plugin.settings.ethersyncBinaryLocation === "custom";

		if (usingCustom) {
			this.customPathSetting?.setDisabled(false);
			this.downloadSetting?.setDisabled(false);
		} else {
			this.customPathSetting?.setDisabled(true);
			this.downloadSetting?.setDisabled(true);
		}
	}
}
