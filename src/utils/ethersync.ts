import { spawn } from "child_process";
import { promises as fs } from "fs";
import { Socket } from "net";
import { userInfo } from "os";
import { join } from "path";
import { shellEnv } from "shell-env";
import { backoff } from "./backoff";

export type EthersyncFolder = {
	mode: "share" | "join";
	path: string;
	enabled: boolean;
	shareCode?: string;
};

export type EthersyncCursorPosition = {
	line: number;
	character: number;
};

export type EthersyncCursorRange = {
	start: EthersyncCursorPosition;
	end: EthersyncCursorPosition;
};

export type EthersyncCursorMessage = {
	userid: string;
	name: string;
	uri: string;
	ranges: Array<EthersyncCursorRange>;
};

type EthersyncJSONRPCMessage = {
	method: "cursor";
	params: EthersyncCursorMessage;
};

type JoinProcessOptions = {
	code?: string;
	binary: string;
};

type ShareProcessOptions = {
	onShareCode?: (code: string) => void;
	binary: string;
};

const GIT_FOLDER = ".git";
const ETHERSYNC_FOLDER = ".ethersync";
export const ETHERSYNC_BINARY_NAME = "ethersync";
const ETHERSYNC_JOIN_CODE_REGEX = /ethersync join ([\w-]+)/;
const DEFAULT_CURSOR_RANGE: EthersyncCursorRange = {
	start: { character: 0, line: 0 },
	end: { character: 0, line: 0 },
};

export class EthersyncClient {
	private socket: Socket;
	private currentMessageId = 0;

	constructor(
		private socketPath: string,
		private uri: string,
		private onCursor: (params: EthersyncCursorMessage) => void,
	) {
		this.socket = new Socket();
		setTimeout(() => this.connect(), 1000);
	}

	// TODO: handle socket close
	private connect() {
		if (this.socket.connecting) {
			return;
		}

		this.socket.on("connect", () => {
			this.updateCursor(DEFAULT_CURSOR_RANGE);
		});

		this.socket.on("data", this.onData.bind(this));

		this.socket.on("error", (e) => {
			console.error("[EthersyncClient] generic socket error", e);
		});

		this.socket.connect(this.socketPath);
	}

	private onData(buffer: Buffer) {
		const data = buffer.toString("utf8");

		const messages = data.split("\n").map((line) => line.trim());

		messages.forEach((message) => {
			if (!message) return;

			try {
				const obj = JSON.parse(message);
				this.processMessage(obj);
			} catch (err) {
				console.error("[EthersyncClient] incoming data error", {
					err,
					data,
				});
			}
		});
	}

	private processMessage(message: EthersyncJSONRPCMessage) {
		if (message.method === "cursor") {
			this.onCursor(message.params);
		}
	}

	private async sendMessage(message: object) {
		if (!this.socket.writable) {
			return;
		}

		await backoff(async () => {
			this.socket.write(JSON.stringify(message) + "\r\n", function (err) {
				if (err)
					console.error("[EthersyncClient] socket write error", err);
			});
		});
	}

	public updateCursor(range: EthersyncCursorRange) {
		const cursorMessage = {
			jsonrpc: "2.0",
			id: ++this.currentMessageId,
			method: "cursor",
			params: {
				uri: this.uri,
				ranges: [range],
			},
		};

		this.sendMessage(cursorMessage).catch((err) => {
			console.error("[EthersyncClient] cursor update failed", err);
		});
	}
}

export async function createGitFolder(directory: string) {
	const username = userInfo().username;

	const gitConfig = `
		[core]
	        repositoryformatversion = 0
	        filemode = true
	        bare = true
	        ignorecase = true
	        precomposeunicode = true
	    [user]
	        name = ${username}
    `;

	await fs.mkdir(join(directory, GIT_FOLDER), {
		recursive: true,
	});

	await fs.writeFile(join(directory, GIT_FOLDER, "config"), gitConfig);
	await fs.writeFile(
		join(directory, GIT_FOLDER, "HEAD"),
		"ref: refs/heads/main",
	);

	await fs.mkdir(join(directory, GIT_FOLDER, "objects", "info"), {
		recursive: true,
	});
	await fs.mkdir(join(directory, GIT_FOLDER, "objects", "pack"), {
		recursive: true,
	});
	await fs.mkdir(join(directory, GIT_FOLDER, "refs", "heads"), {
		recursive: true,
	});
	await fs.mkdir(join(directory, GIT_FOLDER, "refs", "tags"), {
		recursive: true,
	});
}

export async function hasGitFolder(directory: string) {
	try {
		return (await fs.stat(join(directory, GIT_FOLDER))).isDirectory();
	} catch (e) {
		return false;
	}
}

export async function createEthersyncFolder(path: string) {
	const absolutePath = join(path, ETHERSYNC_FOLDER);

	await fs.mkdir(absolutePath, { recursive: true });
	await fs.chmod(absolutePath, 0o700);
}

export async function hasEthersyncFolder(path: string) {
	try {
		return (await fs.stat(join(path, ETHERSYNC_FOLDER))).isDirectory();
	} catch (e) {
		return false;
	}
}

export async function ethersyncJoinProcess(
	path: string,
	options: JoinProcessOptions,
) {
	if (!(await hasEthersyncFolder(path))) {
		await createEthersyncFolder(path);
	}

	if (!(await hasGitFolder(path))) {
		await createGitFolder(path);
	}

	const args = ["join", "--directory", path];

	if (options.code) {
		args.push(options.code);
	}

	const proc = spawn(options.binary, args, {
		detached: false,
		shell: false,
		env: await shellEnv(),
	});

	proc.stdout.on("data", (data: ArrayBuffer) => {
		console.debug("ethersync join >", data.toString());
	});

	proc.stderr.on("data", (data: ArrayBuffer) => {
		console.error("ethersync join (error) >", data.toString());
	});

	return proc;
}

export async function ethersyncShareProcess(
	path: string,
	options: ShareProcessOptions,
) {
	if (!(await hasEthersyncFolder(path))) {
		await createEthersyncFolder(path);
	}

	if (!(await hasGitFolder(path))) {
		await createGitFolder(path);
	}

	const proc = spawn(options.binary, ["share", "--directory", path], {
		detached: false,
		shell: false,
		env: await shellEnv(),
	});

	const onData = (data: ArrayBuffer) => {
		console.debug("ethersync share >", data.toString());

		const match = data.toString().match(ETHERSYNC_JOIN_CODE_REGEX);

		if (match && options.onShareCode) {
			options.onShareCode(match[1]);
		}
	};

	proc.stdout.on("data", onData);

	proc.stderr.on("data", (data: ArrayBuffer) => {
		console.error("ethersync share (error) >", data.toString());
	});

	return proc;
}
