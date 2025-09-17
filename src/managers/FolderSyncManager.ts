import { ChildProcess } from "child_process";
import { App } from "obsidian";
import {
	EthersyncFolder,
	ethersyncJoinProcess,
	ethersyncShareProcess,
} from "../ethersync";
import { PastaSyncSettings } from "../settings";
import { getVaultBasePath } from "../vault";

type StartProcessOptions = {
	code?: string;
	onShareCode?: (code: string) => void;
};

export class FolderSyncManager {
	private processes: Map<string, ChildProcess> = new Map();

	constructor(
		private app: App,
		private settings: PastaSyncSettings,
		private persistSettings: () => Promise<void>,
	) {}

	async startConfiguredFolders() {
		for (const [id, folder] of this.settings.folders) {
			if (!folder.enabled) continue;
			await this.startFolder(id);
		}
	}

	hasActiveProcess(id: string) {
		return this.processes.has(id);
	}

	isFolderEnabled(id: string) {
		const folder = this.settings.folders.get(id);
		return !!folder?.enabled;
	}

	isManagedFolder(id: string) {
		return this.settings.folders.has(id);
	}

	async startFolder(id: string, options: StartProcessOptions = {}) {
		const folder = this.settings.folders.get(id);
		if (!folder || !folder.enabled) return;

		const absolutePath = this.resolveAbsolutePath(folder.path);
		if (!absolutePath) return;

		await this.startProcess(id, folder, absolutePath, options);
	}

	async enableFolder(id: string) {
		const folder = this.settings.folders.get(id);
		if (!folder) return;

		this.settings.folders.set(id, { ...folder, enabled: true });
		await this.persistSettings();
		await this.startFolder(id);
	}

	async disableFolder(id: string) {
		const folder = this.settings.folders.get(id);
		if (!folder) return;

		this.settings.folders.set(id, { ...folder, enabled: false });
		await this.persistSettings();

		this.stopProcess(id);
	}

	async removeFolder(id: string) {
		if (!this.settings.folders.has(id)) return;

		this.settings.folders.delete(id);
		await this.persistSettings();

		this.stopProcess(id);
	}

	killAll() {
		for (const process of this.processes.values()) {
			process.kill();
		}

		this.processes.clear();
	}

	private async startProcess(
		id: string,
		folder: EthersyncFolder,
		absolutePath: string,
		options: StartProcessOptions,
	) {
		this.stopProcess(id);

		if (folder.mode === "share") {
			this.processes.set(
				id,
				await ethersyncShareProcess(absolutePath, options.onShareCode),
			);
		} else {
			this.processes.set(
				id,
				await ethersyncJoinProcess(absolutePath, options.code),
			);
		}
	}

	private stopProcess(id: string) {
		const process = this.processes.get(id);
		if (!process) return;

		process.kill();
		this.processes.delete(id);
	}

	private resolveAbsolutePath(path: string) {
		const vaultBasePath = getVaultBasePath(this.app.vault);
		if (!vaultBasePath) return;

		return [vaultBasePath, path].join("/");
	}
}
