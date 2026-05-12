import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import process from "process";

type JsonRpcId = number;

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: JsonRpcId;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: JsonRpcId;
	result?: unknown;
	error?: {message?: string; code?: number; data?: unknown};
}

interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

interface SessionNewResponse {
	sessionId: string;
}

export interface AcpPromptResult {
	text: string;
	stopReason?: string;
}

export class AcpClient {
	private process: ChildProcessWithoutNullStreams | null = null;
	private nextId = 0;
	private buffer = "";
	private pending = new Map<JsonRpcId, {
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
	}>();
	private chunks: string[] = [];

	constructor(
		private readonly command: string,
		private readonly args: string[],
		private readonly cwd: string,
	) {}

	async runPrompt(prompt: string, resources: Array<{uri: string; text: string; mimeType: string}>): Promise<AcpPromptResult> {
		this.start();

		try {
			await this.request("initialize", {
				protocolVersion: 1,
				clientCapabilities: {
					fs: {
						readTextFile: false,
						writeTextFile: false,
					},
					terminal: false,
				},
				clientInfo: {
					name: "ob-canvas-acp",
					title: "Canvas ACP",
					version: "1.0.0",
				},
			});

			const session = await this.request("session/new", {
				cwd: this.cwd,
				mcpServers: [],
			}) as SessionNewResponse;

			let response: {stopReason?: string};
			try {
				response = await this.prompt(session.sessionId, buildPromptBlocks(prompt, resources)) as {stopReason?: string};
			} catch (error) {
				if (!(error instanceof JsonRpcError) || !error.isInvalidParams()) {
					throw error;
				}

				this.chunks = [];
				response = await this.prompt(session.sessionId, [{
					type: "text",
					text: buildTextOnlyPrompt(prompt, resources),
				}]) as {stopReason?: string};
			}

			return {
				text: this.chunks.join("").trim(),
				stopReason: response?.stopReason,
			};
		} finally {
			this.dispose();
		}
	}

	private start() {
		if (!this.command) {
			throw new Error("Set an ACP agent command in Canvas ACP settings first.");
		}

		this.process = spawn(this.command, this.args, {
			cwd: this.cwd,
			env: process.env,
		});

		this.process.stdout.setEncoding("utf8");
		this.process.stderr.setEncoding("utf8");
		this.process.stdout.on("data", (data: string) => this.handleData(data));
		this.process.stderr.on("data", (data: string) => {
			if (data.trim()) {
				console.warn(`Canvas ACP agent stderr: ${data}`);
			}
		});
		this.process.on("error", (error) => this.rejectAll(error));
		this.process.on("exit", (code, signal) => {
			if (this.pending.size > 0) {
				this.rejectAll(new Error(`ACP agent exited before responding (${signal ?? code ?? "unknown"}).`));
			}
		});
	}

	private request(method: string, params?: unknown): Promise<unknown> {
		const id = this.nextId++;
		const message: JsonRpcRequest = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		return new Promise((resolve, reject) => {
			this.pending.set(id, {resolve, reject});
			this.process?.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
		});
	}

	private prompt(sessionId: string, prompt: unknown[]): Promise<unknown> {
		if (!sessionId) {
			throw new Error("ACP agent did not return a sessionId.");
		}

		return this.request("session/prompt", {
			sessionId,
			prompt,
		});
	}

	private handleData(data: string) {
		this.buffer += data;

		let newlineIndex = this.buffer.indexOf("\n");
		while (newlineIndex >= 0) {
			const line = this.buffer.slice(0, newlineIndex).trim();
			this.buffer = this.buffer.slice(newlineIndex + 1);

			if (line) {
				this.handleMessage(JSON.parse(line) as JsonRpcResponse | JsonRpcNotification);
			}

			newlineIndex = this.buffer.indexOf("\n");
		}
	}

	private handleMessage(message: JsonRpcResponse | JsonRpcRequest | JsonRpcNotification) {
		if ("id" in message) {
			const pending = this.pending.get(message.id);
			if (pending) {
				this.pending.delete(message.id);
				if ("error" in message && message.error) {
					pending.reject(new JsonRpcError(message.error.message, message.error.code, message.error.data));
				} else {
					pending.resolve(("result" in message) ? message.result : undefined);
				}
				return;
			}

			if ("method" in message) {
				this.respondToAgentRequest(message);
			}
			return;
		}

		if (message.method === "session/update") {
			this.handleSessionUpdate(message.params);
		}
	}

	private handleSessionUpdate(params: unknown) {
		const update = (params as {update?: {sessionUpdate?: string; content?: {type?: string; text?: string}}})?.update;
		if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text" && update.content.text) {
			this.chunks.push(update.content.text);
		}
	}

	private respondToAgentRequest(message: JsonRpcRequest) {
		let result: unknown = {};

		if (message.method === "session/request_permission") {
			result = {
				outcome: {
					outcome: "cancelled",
				},
			};
		}

		this.process?.stdin.write(`${JSON.stringify({
			jsonrpc: "2.0",
			id: message.id,
			result,
		})}\n`, "utf8");
	}

	private rejectAll(error: Error) {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}

	private dispose() {
		if (this.process && !this.process.killed) {
			this.process.kill();
		}
		this.process = null;
		this.pending.clear();
		this.buffer = "";
	}
}

export function splitArgs(args: string): string[] {
	return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((arg) => {
		if ((arg.startsWith("\"") && arg.endsWith("\"")) || (arg.startsWith("'") && arg.endsWith("'"))) {
			return arg.slice(1, -1);
		}

		return arg;
	}) ?? [];
}

class JsonRpcError extends Error {
	constructor(message: string | undefined, readonly code: number | undefined, readonly data: unknown) {
		const dataText = data ? ` ${JSON.stringify(data)}` : "";
		super(`${message ?? `ACP error ${code ?? ""}`.trim()}${dataText}`);
	}

	isInvalidParams(): boolean {
		return this.code === -32602 || this.message.toLowerCase().includes("invalid params");
	}
}

function buildPromptBlocks(prompt: string, resources: Array<{uri: string; text: string; mimeType: string}>): unknown[] {
	return [
		{text: prompt, type: "text"},
		...resources.map((resource) => ({
			type: "resource",
			resource,
		})),
	];
}

function buildTextOnlyPrompt(prompt: string, resources: Array<{uri: string; text: string; mimeType: string}>): string {
	if (resources.length === 0) {
		return prompt;
	}

	return [
		prompt,
		"",
		"Context:",
		...resources.map((resource) => [
			`<resource uri="${resource.uri}" mimeType="${resource.mimeType}">`,
			resource.text,
			"</resource>",
		].join("\n")),
	].join("\n");
}
