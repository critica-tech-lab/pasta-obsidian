import { Plugin, TFile, TFolder } from "obsidian";
import { EthersyncManager } from "./managers/EthersyncManager";
import { EditorManager } from "./managers/EditorManager";
import { ObsidianManager } from "./managers/ObsidianManager";
import {
	PastaSettingsTab,
	PastaSyncSettings,
	PASTA_SYNC_DEFAULT_SETTINGS,
} from "./settings";
import { getVaultBasePath } from "./vault";

export default class PastaSyncPlugin extends Plugin {
	public settings: PastaSyncSettings = PASTA_SYNC_DEFAULT_SETTINGS;
	private processManager!: EthersyncManager;
	private editorManager!: EditorManager;
	private ui!: ObsidianManager;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PastaSettingsTab(this.app, this));

		const vaultPath = getVaultBasePath(this.app.vault);

		this.processManager = new EthersyncManager(
			vaultPath,
			this.settings,
			this.saveSettings.bind(this),
		);

		this.editorManager = new EditorManager(
			this.app,
			this.settings,
			this.processManager,
		);

		this.ui = new ObsidianManager(
			this.app,
			this.settings,
			this.processManager,
			this.saveSettings.bind(this),
			this.openSettings.bind(this),
		);

		this.registerEditorExtension(this.editorManager.extension);

		this.addCommand({
			id: "pasta-join-folder",
			name: "Join a folder",
			callback: () => {
				this.openJoinFolderModal();
			},
		});

		this.addCommand({
			id: "pasta-share-folder",
			name: "Share a folder",
			callback: () => {
				this.openShareFolderModal();
			},
		});

		this.addCommand({
			id: "pasta-settings",
			name: "Settings",
			callback: async () => {
				await this.openSettings();
			},
		});

		this.app.workspace.onLayoutReady(async () => {
			try {
				await this.handleVaultReady();
			} catch (error) {
				console.error(
					"[PastaSyncPlugin] handleVaultReady failed",
					error,
				);
			}
		});

		this.registerEvent(
			this.app.vault.on("create", (folder) => {
				this.ui.decorateFolders();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (folder) => {
				if (folder instanceof TFolder) {
					this.removeFolder(folder.path);
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				this.ui.handleFileMenu(menu, file);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				const tFile = file instanceof TFile ? file : undefined;
				try {
					await this.editorManager.handleFileOpen(tFile);
				} catch (error) {
					console.error(
						"[PastaSyncPlugin] handleFileOpen failed",
						error,
					);
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("quit", async () => {
				this.processManager.killAll();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.ui.decorateFolders();
			}),
		);
	}

	onunload(): void {
		this.processManager.killAll();
	}

	private async handleVaultReady() {
		await this.processManager.startConfiguredFolders();

		setTimeout(() => {
			this.ui.decorateFolders();
		}, 100);
	}

	async openSettings() {
		const setting = this.app.setting;
		await setting.open();
		await setting.openTabById("pasta");
	}

	openJoinFolderModal() {
		this.ui.openJoinFolderModal();
	}

	openShareFolderModal(onShare?: () => void) {
		this.ui.openShareFolderModal(onShare);
	}

	async enableFolder(id: string) {
		await this.processManager.enableFolder(id);
		this.ui.decorateFolders();
	}

	async disableFolder(id: string) {
		await this.processManager.disableFolder(id);
		this.ui.decorateFolders();
	}

	async removeFolder(path: string) {
		await this.processManager.removeFolder(path);
		this.ui.decorateFolders();
	}

	async loadSettings() {
		const data = await this.loadData();

		this.settings = Object.assign({}, PASTA_SYNC_DEFAULT_SETTINGS, {
			...data,
			folders: Array.isArray(data?.folders)
				? new Map(data.folders as [string, unknown][])
				: new Map(),
		});
	}

	async saveSettings() {
		const data = {
			...this.settings,
			folders: Array.from(this.settings.folders.entries()),
		};

		await this.saveData(data);
	}
}
