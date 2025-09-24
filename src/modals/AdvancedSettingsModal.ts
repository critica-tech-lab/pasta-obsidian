import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from "obsidian";
import { isExperimentEnabled } from "src/utils/experiments";
import type PastaSyncPlugin from "../main";
import { EthersyncBinaryLocation, PastaExperiment } from "../settings";
import {
	downloadLatestEthersyncBinary,
	ensureBinaryResponds,
} from "../utils/binary";
import { getEthersyncBinary } from "../utils/ethersync";
import { getVaultBasePath } from "../utils/vault";

export class AdvancedSettingsModal extends Modal {
	private readonly plugin: PastaSyncPlugin;
	private readonly vaultPath?: string;
	private customPathSetting?: Setting;
	private downloadSetting?: Setting;
	private versionSetting?: Setting;

	constructor(app: App, plugin: PastaSyncPlugin) {
		super(app);
		this.plugin = plugin;
		this.vaultPath = getVaultBasePath(app.vault);
	}

	onOpen() {
		this.contentEl.empty();

		this.titleEl.setText("Advanced settings");
		this.renderEthersyncSection(this.contentEl);
	}

	onClose() {
		this.contentEl.empty();
	}

	private async updateEthersyncVersion() {
		if (this.versionSetting) {
			this.versionSetting.setDesc(
				(await this.getEthersyncVersion()) ?? "Not Found",
			);
		}
	}

	private async renderEthersyncSection(containerEl: HTMLElement) {
		const { settings } = this.plugin;

		new Setting(containerEl).setName("Experiments").setHeading();

		new Setting(containerEl)
			.setName("Cursors")
			.setDesc(
				"Track and display user cursors when editing (requires restart)",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(
						isExperimentEnabled(
							this.plugin.settings,
							PastaExperiment.Cursors,
						),
					)
					.onChange(async (value) => {
						settings.experiments.set(
							PastaExperiment.Cursors,
							value,
						);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Ethersync").setHeading();

		this.versionSetting = new Setting(containerEl)
			.setName("Version")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Refresh")
					.onClick(async () => {
						await this.updateEthersyncVersion();
					});
			});

		await this.updateEthersyncVersion();

		const locationSetting = new Setting(containerEl)
			.setName("Binary mode")
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
				await this.updateEthersyncVersion();

				this.updateDownloadUi();
			});
		});

		let customLocationText: TextComponent | undefined;

		this.customPathSetting = new Setting(containerEl)
			.setName("Custom binary location")
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

						await this.updateEthersyncVersion();
					});
			});

		this.downloadSetting = new Setting(containerEl).setName(
			"Download Ethersync 0.7.0",
		);

		this.downloadSetting.addButton((button) => {
			button.setButtonText("Download & Use");
			button.setCta();
			button.onClick(async () => {
				await this.handleDownload(button, customLocationText);
			});
		});
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
