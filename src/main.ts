import { Plugin, TFile } from "obsidian";
import { FolderSyncManager } from "./managers/FolderSyncManager";
import { EditorSyncManager } from "./managers/EditorSyncManager";
import { ObsidianUIManager } from "./managers/ObsidianUIManager";
import {
	PastaSettingsTab,
	PastaSyncSettings,
	PASTA_SYNC_DEFAULT_SETTINGS,
} from "./settings";

export default class PastaSyncPlugin extends Plugin {
	public settings: PastaSyncSettings = PASTA_SYNC_DEFAULT_SETTINGS;
	private folderSync!: FolderSyncManager;
	private editorSync!: EditorSyncManager;
	private ui!: ObsidianUIManager;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PastaSettingsTab(this.app, this));

		this.folderSync = new FolderSyncManager(
			this.app,
			this.settings,
			this.saveSettings.bind(this),
		);

		this.editorSync = new EditorSyncManager(
			this.app,
			this.settings,
			this.folderSync,
		);

		this.ui = new ObsidianUIManager(
			this.app,
			this.settings,
			this.folderSync,
			this.saveSettings.bind(this),
			this.openSettings.bind(this),
		);

		this.registerEditorExtension(this.editorSync.extension);

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

		this.app.workspace.onLayoutReady(() => {
			void this.handleVaultReady();
		});

		this.registerEvent(
			this.app.workspace.on("quit", this.handleAppQuit.bind(this)),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				this.ui.handleFileMenu(menu, file);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				const tFile = file instanceof TFile ? file : undefined;
				void this.editorSync.handleFileOpen(tFile);
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.ui.decorateFolders();
			}),
		);

		this.register(() => {
			this.folderSync.killAll();
		});
	}

	private async handleVaultReady() {
		await this.folderSync.startConfiguredFolders();

		setTimeout(() => {
			this.ui.decorateFolders();
		}, 100);
	}

	private handleAppQuit() {
		this.folderSync.killAll();
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
		await this.folderSync.enableFolder(id);
		this.ui.decorateFolders();
	}

	async disableFolder(id: string) {
		await this.folderSync.disableFolder(id);
		this.ui.decorateFolders();
	}

	async removeFolder(path: string) {
		await this.folderSync.removeFolder(path);
		this.ui.decorateFolders();
	}

	async loadSettings() {
		const data = await this.loadData();

		console.warn({ data });

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
