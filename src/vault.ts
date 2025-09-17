import { FileSystemAdapter, TFile, Vault } from "obsidian";
import { hasEthersyncFolder } from "./ethersync";

export function getVaultBasePath(vault: Vault) {
	if (vault.adapter instanceof FileSystemAdapter) {
		return vault.adapter.getBasePath();
	}
}

export async function getEthersyncFolder(file: TFile, vault: Vault) {
	const vaultPath = getVaultBasePath(vault);
	if (!vaultPath) return;

	let currentDir = file.parent;

	while (currentDir) {
		if (currentDir.isRoot()) {
			return;
		}

		const currentDirPath = [vaultPath, currentDir.path].join("/");

		if (await hasEthersyncFolder(currentDirPath)) {
			return [currentDirPath, ".ethersync"].join("/");
		}

		currentDir = currentDir.parent;
	}
}
