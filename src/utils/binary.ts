import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { shellEnv } from "shell-env";
import { createEthersyncFolder } from "./ethersync";

const DOWNLOADED_FOLDER = ".ethersync";
const DEFAULT_BINARY_COMMAND = "ethersync";

const DEFAULT_RELEASE_BASE_URL =
	"https://github.com/ethersync/ethersync/releases/download/v0.7.0/";

// TODO: confirm asset naming once official release artifacts are available.
const PLATFORM_ASSET_MAP: Record<string, string | undefined> = {
	"darwin-arm64": "ethersync-universal-apple-darwin.tar.gz",
	"darwin-x64": "ethersync-universal-apple-darwin.tar.gz",
	"linux-x64": "ethersync-x86_64-unknown-linux-musl.tar.gz",
	"linux-arm64": "ethersync-aarch64-unknown-linux-musl.tar.gz",
};

export function getDownloadedBinaryCandidates(vaultPath: string): string[] {
	if (process.platform === "win32") {
		return [];
	}

	const basePath = join(vaultPath, DOWNLOADED_FOLDER);
	return [join(basePath, DEFAULT_BINARY_COMMAND)];
}

export type DownloadEthersyncOptions = {
	signal?: AbortSignal;
	onProgress?: (progress: DownloadProgress) => void;
};

export type DownloadProgress = {
	transferred: number;
	total?: number;
};

export async function downloadLatestEthersyncBinary(
	vaultPath: string,
	options: DownloadEthersyncOptions = {},
): Promise<string> {
	const assetName = resolveAssetName();
	if (!assetName) {
		throw new Error(
			`No download available for ${process.platform}-${process.arch}.`,
		);
	}

	await createEthersyncFolder(vaultPath);

	const downloadUrl = `${DEFAULT_RELEASE_BASE_URL}/${assetName}`;

	const destination = join(
		vaultPath,
		DOWNLOADED_FOLDER,
		DEFAULT_BINARY_COMMAND,
	);

	const tmpRoot = await fs.mkdtemp(join(tmpdir(), "pasta-ethersync-"));
	const archivePath = join(tmpRoot, assetName);
	const extractDir = join(tmpRoot, "extract");
	await fs.mkdir(extractDir, { recursive: true });

	try {
		await downloadArchive(downloadUrl, archivePath, options);
		await extractArchive(archivePath, extractDir);
		const extractedBinary = await findBinary(
			extractDir,
			DEFAULT_BINARY_COMMAND,
		);

		if (!extractedBinary) {
			throw new Error(
				"Downloaded archive did not contain the ethersync binary.",
			);
		}

		await fs.copyFile(extractedBinary, destination);
		await fs.chmod(destination, 0o755);
	} finally {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	}

	return destination;
}

export async function ensureBinaryResponds(command: string) {
	const env = await shellEnv();

	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, ["--version"], {
			detached: false,
			shell: false,
			env,
		});

		let output = "";
		let settled = false;

		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});

		child.stdout.on("data", (data: ArrayBuffer) => {
			output = output + data.toString();
		});

		child.once("exit", (code) => {
			if (settled) return;
			settled = true;
			if (code === 0) {
				resolve(output);
			} else {
				reject(
					new Error(`Process exited with code ${code ?? "unknown"}`),
				);
			}
		});
	});
}

function resolveAssetName() {
	const key = `${process.platform}-${process.arch}`;
	return PLATFORM_ASSET_MAP[key];
}

async function downloadArchive(
	url: string,
	destination: string,
	options: DownloadEthersyncOptions,
) {
	await new Promise<void>((resolve, reject) => {
		const args = ["-L", "-o", destination, url];

		const curl = spawn("curl", args, {
			detached: false,
			shell: false,
		});

		curl.once("error", reject);

		curl.once("exit", async (code) => {
			if (code === 0) {
				try {
					const stats = await fs.stat(destination);
					options.onProgress?.({
						transferred: stats.size,
						total: stats.size,
					});
					resolve();
				} catch (error) {
					reject(error);
				}
			} else {
				reject(new Error(`curl exited with code ${code ?? "unknown"}`));
			}
		});

		options.signal?.addEventListener(
			"abort",
			() => {
				curl.kill();
				reject(new Error("Download aborted"));
			},
			{ once: true },
		);
	});
}

async function extractArchive(archivePath: string, targetDir: string) {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("tar", ["-xzf", archivePath, "-C", targetDir], {
			detached: false,
			shell: false,
		});

		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`tar exited with code ${code ?? "unknown"}`));
			}
		});
	});
}

async function findBinary(
	root: string,
	filename: string,
): Promise<string | undefined> {
	const entries = await fs.readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(root, entry.name);

		if (entry.isDirectory()) {
			const nested = await findBinary(fullPath, filename);
			if (nested) {
				return nested;
			}
		} else if (entry.isFile() && entry.name === filename) {
			return fullPath;
		}
	}

	return undefined;
}
