import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import process from "process";
import {debugError, debugLog, debugWarn} from "./debug";

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

interface PromptParamsSummary {
	sessionId?: string;
	prompt?: Array<{
		type?: string;
		text?: string;
		resource?: {
			uri?: string;
			text?: string;
			mimeType?: string;
		};
	}>;
}

export interface AcpPromptResult {
	text: string;
	stopReason?: string;
}

export type AcpChunkHandler = (text: string, fullText: string) => void;

export class AcpClient {
	private process: ChildProcessWithoutNullStreams | null = null;
	private nextId = 0;
	private buffer = "";
	private pending = new Map<JsonRpcId, {
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
	}>();
	private chunks: string[] = [];
	private onChunk: AcpChunkHandler | undefined;

	constructor(
		private readonly command: string,
		private readonly args: string[],
		private readonly cwd: string,
	) {}

	async runPrompt(
		prompt: string,
		resources: Array<{uri: string; text: string; mimeType: string}>,
		onChunk?: AcpChunkHandler,
	): Promise<AcpPromptResult> {
		debugLog("acp", "run prompt start", {
			promptLength: prompt.length,
			resourceCount: resources.length,
			resources: resources.map((resource) => ({
				uri: resource.uri,
				mimeType: resource.mimeType,
				textLength: resource.text.length,
			})),
		});
		this.start();

		try {
			debugLog("acp", "initialize request");
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

			debugLog("acp", "new session request", {cwd: this.cwd});
			const session = await this.request("session/new", {
				cwd: this.cwd,
				mcpServers: [],
			}) as SessionNewResponse;
			debugLog("acp", "new session response", {
				sessionId: session.sessionId,
			});

			let response: {stopReason?: string};
			try {
				debugLog("acp", "session prompt request with embedded resources", {
					sessionId: session.sessionId,
					blockCount: 1 + resources.length,
				});
				response = await this.prompt(session.sessionId, buildPromptBlocks(prompt, resources), onChunk) as {stopReason?: string};
			} catch (error) {
				if (!(error instanceof JsonRpcError) || !error.isInvalidParams()) {
					debugError("acp", "session prompt failed", error);
					throw error;
				}

				debugWarn("acp", "embedded resource prompt rejected; retrying text-only prompt", error);
				this.chunks = [];
				response = await this.prompt(session.sessionId, [{
					type: "text",
					text: buildTextOnlyPrompt(prompt, resources),
				}], onChunk) as {stopReason?: string};
			}

			debugLog("acp", "run prompt completed", {
				textLength: this.chunks.join("").trim().length,
				stopReason: response?.stopReason,
			});
			return {
				text: this.chunks.join("").trim(),
				stopReason: response?.stopReason,
			};
		} finally {
			debugLog("acp", "dispose after prompt");
			this.dispose();
		}
	}

	private start() {
		if (!this.command) {
			throw new Error("Set an ACP agent command in Canvas ACP settings first.");
		}

		debugLog("acp", "spawn agent", {
			command: this.command,
			args: this.args,
			cwd: this.cwd,
		});
		this.process = spawn(this.command, this.args, {
			cwd: this.cwd,
			env: process.env,
		});

		this.process.stdout.setEncoding("utf8");
		this.process.stderr.setEncoding("utf8");
		this.process.stdout.on("data", (data: string) => this.handleData(data));
		this.process.stderr.on("data", (data: string) => {
			if (data.trim()) {
				debugWarn("acp", "agent stderr", data);
			}
		});
		this.process.on("error", (error) => {
			debugError("acp", "agent process error", error);
			this.rejectAll(error);
		});
		this.process.on("exit", (code, signal) => {
			debugLog("acp", "agent process exit", {code, signal, pendingCount: this.pending.size});
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
		debugLog("acp-rpc", "send request", {
			id,
			method,
			params: summarizeParams(method, params),
		});

		return new Promise((resolve, reject) => {
			this.pending.set(id, {resolve, reject});
			this.process?.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
		});
	}

	private prompt(sessionId: string, prompt: unknown[], onChunk?: AcpChunkHandler): Promise<unknown> {
		if (!sessionId) {
			throw new Error("ACP agent did not return a sessionId.");
		}

		this.onChunk = onChunk;
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
		debugLog("acp-rpc", "receive message", summarizeMessage(message));
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
		debugLog("acp", "session update", {
			sessionUpdate: update?.sessionUpdate,
			contentType: update?.content?.type,
			textLength: update?.content?.text?.length,
		});
		if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text" && update.content.text) {
			this.chunks.push(update.content.text);
			this.onChunk?.(update.content.text, this.chunks.join(""));
		}
	}

	private respondToAgentRequest(message: JsonRpcRequest) {
		let result: unknown = {};
		debugLog("acp-rpc", "respond to agent request", {
			id: message.id,
			method: message.method,
			params: summarizeParams(message.method, message.params),
		});

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
		debugError("acp", "reject pending requests", error);
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
		this.onChunk = undefined;
	}
}

function summarizeMessage(message: JsonRpcResponse | JsonRpcRequest | JsonRpcNotification) {
	if ("method" in message) {
		return {
			id: "id" in message ? message.id : undefined,
			method: message.method,
			params: summarizeParams(message.method, message.params),
		};
	}

	return {
		id: message.id,
		hasResult: message.result !== undefined,
		error: message.error,
	};
}

function summarizeParams(method: string, params: unknown): unknown {
	if (!params || typeof params !== "object") {
		return params;
	}

	if (method === "session/prompt") {
		const promptParams = params as PromptParamsSummary;
		return {
			sessionId: promptParams.sessionId,
			prompt: promptParams.prompt?.map((block) => ({
				type: block.type,
				textLength: block.text?.length,
				resourceUri: block.resource?.uri,
				resourceMimeType: block.resource?.mimeType,
				resourceTextLength: block.resource?.text?.length,
			})),
		};
	}

	return params;
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
