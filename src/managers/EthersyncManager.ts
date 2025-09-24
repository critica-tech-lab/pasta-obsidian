import { ChildProcess } from "child_process";
import { Notice } from "obsidian";
import {
	EthersyncFolder,
	ethersyncJoinProcess,
	ethersyncShareProcess,
} from "../utils/ethersync";
import { getEthersyncBinary, PastaSettings } from "../settings";

type StartProcessOptions = {
	code?: string;
	onShareCode?: (code: string) => void;
};

type EthersyncProcess = {
	childProcess: ChildProcess;
	code?: string;
};

export class EthersyncManager {
	private processes: Map<string, EthersyncProcess> = new Map();

	constructor(
		private vaultPath: string | undefined,
		private settings: PastaSettings,
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

	isSharingFolder(id: string) {
		const folder = this.settings.folders.get(id);
		return folder ? folder.mode === "share" && folder.enabled : false;
	}

	async startFolder(id: string, options: StartProcessOptions = {}) {
		const folder = this.settings.folders.get(id);

		if (!this.vaultPath || !folder || !folder.enabled) return;

		const absolutePath = [this.vaultPath, folder.path].join("/");

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

	async renameFolder(id: string, path: string) {
		const folder = this.settings.folders.get(id);

		if (!folder) {
			return;
		}

		// Terminate existing process
		this.stopProcess(id);

		// Add a new folder entry
		this.settings.folders.set(path, {
			...folder,
			path,
		});

		// Remove old folder entry
		this.settings.folders.delete(id);

		await this.persistSettings();

		// Start the new process
		await this.startFolder(path);
	}

	async removeFolder(id: string) {
		if (!this.settings.folders.has(id)) return;

		this.settings.folders.delete(id);
		await this.persistSettings();

		this.stopProcess(id);
	}

	killAll() {
		for (const [id] of this.processes) {
			this.stopProcess(id);
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

		const binary = getEthersyncBinary(this.settings);

		if (!binary) {
			console.error("ethersync not found");
			return;
		}

		if (folder.mode === "share") {
			const onShareCode = async (code: string) => {
				this.settings.folders.set(id, {
					...folder,
					shareCode: code,
				});

				if (options.onShareCode) {
					options.onShareCode(code);
				}
			};

			try {
				this.processes.set(id, {
					childProcess: await ethersyncShareProcess(absolutePath, {
						binary,
						onShareCode,
					}),
				});
			} catch (error) {
				this.handleBinaryError(error);
			}
		} else {
			try {
				this.processes.set(id, {
					childProcess: await ethersyncJoinProcess(absolutePath, {
						binary,
						code: options.code,
					}),
				});
			} catch (error) {
				this.handleBinaryError(error);
			}
		}

		const process = this.processes.get(id);

		if (process) {
			process.childProcess.on("exit", async (code) => {
				if (code && code > 0) {
					console.debug("process crashed, restarting...");
					await this.startProcess(id, folder, absolutePath, options);
				}
			});
		}
	}

	private stopProcess(id: string) {
		const process = this.processes.get(id);
		if (!process) return;

		process.childProcess.kill();
		this.processes.delete(id);
	}

	private handleBinaryError(error: unknown) {
		const message =
			error instanceof Error
				? error.message
				: String(error ?? "Unknown error");
		console.error("[EthersyncManager] Unable to start ethersync", error);
		new Notice(`Failed to launch ethersync: ${message}`);
	}
}
