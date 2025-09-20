import { ChildProcess } from "child_process";
import {
	EthersyncFolder,
	ethersyncJoinProcess,
	ethersyncShareProcess,
} from "../ethersync";
import { PastaSyncSettings } from "../settings";

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

	isSharingFolder(id: string) {
		const folder = this.settings.folders.get(id);
		return folder?.mode === "share";
	}

	async startFolder(id: string, options: StartProcessOptions = {}) {
		const folder = this.settings.folders.get(id);
		if (!folder || !folder.enabled) return;

		if (!this.vaultPath) return;
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

		if (folder.mode === "share") {
			const onShareCode = async (code: string) => {
				const folder = this.settings.folders.get(id);

				if (folder) {
					this.settings.folders.set(id, {
						...folder,
						shareCode: code,
					});
				}

				if (options.onShareCode) {
					options.onShareCode(code);
				}
			};

			this.processes.set(id, {
				childProcess: await ethersyncShareProcess(
					absolutePath,
					onShareCode,
				),
			});
		} else {
			this.processes.set(id, {
				childProcess: await ethersyncJoinProcess(
					absolutePath,
					options.code,
				),
			});
		}
	}

	private stopProcess(id: string) {
		const process = this.processes.get(id);
		if (!process) return;

		process.childProcess.kill();
		this.processes.delete(id);
	}
}
