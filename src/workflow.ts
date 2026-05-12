import {App, ButtonComponent, Modal, Notice} from "obsidian";
import {AcpClient, splitArgs} from "./acpClient";
import {
	addStreamingTextNodeToCanvas,
	CanvasTextNodeTarget,
	getSelectedCanvasSource,
	SelectedCanvasSource,
	updateCanvasTextNode,
} from "./canvas";
import {CanvasAcpSettings} from "./settings";
import {debugError, debugLog} from "./debug";

export async function askQuestionFromCanvasSelection(app: App, settings: CanvasAcpSettings): Promise<void> {
	debugLog("workflow", "command invoked");
	const selection = await getSelectedCanvasSource(app);
	debugLog("workflow", "selection resolved", summarizeSelection(selection));
	new AskQuestionModal(app, settings, selection).open();
}

class AskQuestionModal extends Modal {
	private question = "";
	private promptPreview = "";
	private submitButton: HTMLButtonElement | null = null;
	private statusEl: HTMLElement | null = null;
	private isRunning = false;

	constructor(
		app: App,
		private readonly settings: CanvasAcpSettings,
		private readonly canvasSource: SelectedCanvasSource,
	) {
		super(app);
	}

	onOpen() {
		try {
			debugLog("modal", "open start", summarizeSelection(this.canvasSource));
			this.renderModal();
			debugLog("modal", "open complete");
		} catch (error) {
			debugError("modal", "open failed", error);
			throw error;
		}
	}

	onClose() {
		debugLog("modal", "close");
		this.contentEl.empty();
	}

	private async submit() {
		if (!this.question || this.isRunning) {
			return;
		}

		if (!this.canvasSource?.view) {
			new Notice("Canvas source is no longer available. Please reopen the canvas and try again.");
			this.close();
			return;
		}

		this.isRunning = true;
		this.updateSubmitState();
		const question = this.question;
		const promptTextarea = this.contentEl.querySelector(".canvas-acp-prompt") as HTMLTextAreaElement | null;
		this.promptPreview = promptTextarea?.value ?? "";
		debugLog("modal", "submit", {
			questionLength: question.length,
			questionPreview: question.slice(0, 160),
			selection: summarizeSelection(this.canvasSource),
		});
		this.close();
		void this.createResponseNodeAndStream(question);
	}

	private async createResponseNodeAndStream(question: string) {
		try {
			if (!this.canvasSource?.view) {
				throw new Error("Canvas source is no longer available. Please reopen the canvas and try again.");
			}
			debugLog("workflow", "create response node start", {
				questionLength: question.length,
				selection: summarizeSelection(this.canvasSource),
			});
			const target = await addStreamingTextNodeToCanvas(
				this.app,
				this.canvasSource,
				question,
				this.settings,
				"Thinking...",
			);
			debugLog("workflow", "response node created", target);
			await this.streamResponse(question, target);
		} catch (error) {
			debugError("workflow", "create response node failed", error);
			new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
		}
	}

	private async streamResponse(question: string, target: CanvasTextNodeTarget) {
		let lastText = "";
		const canvasUpdate = createThrottledCanvasUpdate(this.app, target);

		try {
			if (!this.canvasSource?.view) {
				throw new Error("Canvas source is no longer available. Please reopen the canvas and try again.");
			}
			debugLog("workflow", "stream response start", {
				target,
				questionLength: question.length,
				selection: summarizeSelection(this.canvasSource),
			});
			const prompt = this.promptPreview || buildPrompt(this.canvasSource, question, this.settings.includeThinking);
			const basePath = getVaultBasePath(this.app);
			debugLog("workflow", "vault base path resolved", {
				basePath,
				hasAgentCommand: this.settings.agentCommand.length > 0,
				agentCommand: this.settings.agentCommand,
				agentArgsLength: this.settings.agentArgs.length,
			});
			const client = new AcpClient(this.settings.agentCommand, splitArgs(this.settings.agentArgs), basePath);

			const result = await client.runPrompt(prompt, [{
				uri: getSourceUri(this.canvasSource, basePath),
				mimeType: "text/markdown",
				text: this.canvasSource.sourceText ?? "",
			}], (_chunk, fullText) => {
				lastText = fullText.trimStart();
				debugLog("workflow", "ACP chunk received", {
					chunkedTextLength: lastText.length,
					targetNodeId: target.nodeId,
				});
				canvasUpdate.schedule(lastText || "Thinking...");
			});

			lastText = result.text || lastText;
			debugLog("workflow", "ACP prompt completed", {
				finalLength: lastText.length,
				stopReason: result.stopReason,
			});
			await canvasUpdate.flush();
			let finalText = lastText.trim() || "No response was returned by the ACP agent.";
			if (!this.settings.includeThinking) {
				finalText = finalText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
			}
			await updateCanvasTextNode(this.app, target, finalText);
		} catch (error) {
			debugError("workflow", "stream response failed", error);
			await canvasUpdate.flush();
			const message = error instanceof Error ? error.message : "Canvas ACP failed.";
			await updateCanvasTextNode(this.app, target, `Canvas ACP failed:\n\n${message}`);
			new Notice(message);
		}
	}

	private setStatus(message: string) {
		if (this.statusEl) {
			this.statusEl.setText(message);
		}
	}

	private updateSubmitState() {
		if (this.submitButton) {
			this.submitButton.disabled = !this.question || this.isRunning;
		}
	}

	private renderModal() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("canvas-acp-modal");

		debugLog("modal", "render stats");
		const stats = contentEl.createDiv({cls: "canvas-acp-stats"});
		const upstreamCount = this.canvasSource.upstreamNodeCount ?? 0;
		const sourceLen = this.canvasSource.sourceText?.length ?? 0;
		const upstreamLen = this.canvasSource.upstreamContext?.length ?? 0;
		stats.setText(`${upstreamCount} upstream nodes | ${sourceLen + upstreamLen} chars`);

		debugLog("modal", "render input");
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Ask a question...";

		const promptLabel = contentEl.createEl("label", {text: "Prompt", cls: "canvas-acp-prompt-label"});
		const promptTextarea = document.createElement("textarea");
		promptTextarea.rows = 6;
		promptTextarea.classList.add("canvas-acp-prompt");

		const updatePrompt = () => {
			this.promptPreview = buildPrompt(this.canvasSource, this.question, this.settings.includeThinking);
			promptTextarea.value = this.promptPreview;
		};

		input.addEventListener("input", () => {
			this.question = input.value.trim();
			this.updateSubmitState();
			updatePrompt();
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
			if (event.key === "Escape") {
				event.preventDefault();
				this.close();
			}
		});
		contentEl.appendChild(input);
		contentEl.appendChild(promptLabel);
		contentEl.appendChild(promptTextarea);

		// Initialize prompt even when question is empty
		updatePrompt();

		const actions = contentEl.createDiv({cls: "canvas-acp-actions"});
		const askButton = new ButtonComponent(actions)
			.setButtonText("Ask")
			.setCta()
			.onClick(() => void this.submit());
		this.submitButton = askButton.buttonEl;
		new ButtonComponent(actions)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		this.updateSubmitState();
		window.setTimeout(() => input.focus(), 0);
	}
}

function appendTextElement(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap, text: string, cls?: string): HTMLElement {
	const element = document.createElement(tagName);
	element.textContent = text;
	if (cls) {
		element.addClass(cls);
	}
	parent.appendChild(element);
	return element;
}

function createThrottledCanvasUpdate(app: App, target: CanvasTextNodeTarget): {
	schedule: (text: string) => void;
	flush: () => Promise<void>;
} {
	let queuedText = "";
	let timeoutId: number | null = null;
	let lastWrite = Promise.resolve();

	const writeQueuedText = () => {
		const textToWrite = queuedText;
		timeoutId = null;
		debugLog("canvas-write", "scheduled text node flush", {
			nodeId: target.nodeId,
			canvasPath: target.canvasPath,
			textLength: textToWrite.length,
		});
		lastWrite = lastWrite.then(() => updateCanvasTextNode(app, target, textToWrite));
	};

	return {
		schedule: (text: string) => {
			queuedText = text;
			if (timeoutId === null) {
				debugLog("canvas-write", "schedule text node update", {
					nodeId: target.nodeId,
					canvasPath: target.canvasPath,
					textLength: text.length,
				});
				timeoutId = window.setTimeout(writeQueuedText, 250);
			}
		},
		flush: async () => {
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
				writeQueuedText();
			}
			await lastWrite;
		},
	};
}

function buildPrompt(selection: SelectedCanvasSource, question: string, includeThinking: boolean): string {
	const parts = [
		"You are helping expand an Obsidian canvas graph.",
		"Answer the user's question using the provided canvas node as context.",
	];

	if (selection.upstreamContext) {
		parts.push("");
		parts.push("The following upstream nodes also connect to the source node and may provide additional context:");
		parts.push(selection.upstreamContext);
	}

	if (includeThinking) {
		parts.push("");
		parts.push("Please show your reasoning process before giving the final answer.");
	}

	parts.push("");
	parts.push("Create a concise but useful Markdown note body.");
	parts.push("Do not include YAML frontmatter, file names, or code fences around the full answer.");
	parts.push("");
	parts.push(`Source: ${selection.sourceFile?.path ?? selection.sourceTitle ?? selection.sourceUri ?? "Canvas node"}`);
	parts.push(`Question: ${question}`);

	return parts.join("\n");
}

function getSourceUri(selection: SelectedCanvasSource, basePath: string): string {
	if (selection.sourceFile) {
		return encodeURI(`file://${basePath}/${selection.sourceFile.path}`);
	}

	return encodeURI(selection.sourceUri ?? "canvas://unknown");
}

function getSelectionLabel(selection: SelectedCanvasSource): string {
	return selection.sourceFile?.path ?? (selection.sourceTitle || selection.sourceUri || "Canvas node");
}

function getVaultBasePath(app: App): string {
	const adapter = app.vault.adapter as {getBasePath?: () => string};
	const basePath = adapter.getBasePath?.();

	if (!basePath) {
		throw new Error("Canvas ACP requires the desktop file-system adapter.");
	}

	return basePath;
}

function summarizeSelection(selection: SelectedCanvasSource) {
	const sourceText = selection.sourceText ?? "";
	const upstreamContext = selection.upstreamContext ?? "";
	return {
		canvasPath: selection.canvasPath,
		sourceFilePath: selection.sourceFile?.path,
		sourceTitle: selection.sourceTitle,
		sourceUri: selection.sourceUri,
		sourceNodeId: selection.sourceNodeId,
		sourceTextLength: sourceText.length,
		sourceTextPreview: sourceText.slice(0, 160),
		upstreamNodeCount: selection.upstreamNodeCount,
		upstreamContextLength: upstreamContext.length,
		upstreamContextPreview: upstreamContext.slice(0, 160),
		viewFilePath: selection.view?.file?.path,
		viewType: selection.view?.getViewType?.(),
	};
}
