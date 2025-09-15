import { FileSystemAdapter, Vault } from "obsidian";

export function getVaultBasePath(vault: Vault) {
	if (vault.adapter instanceof FileSystemAdapter) {
		return vault.adapter.getBasePath();
	}
}
