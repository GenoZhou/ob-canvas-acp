import {App, Modal, Notice, Setting} from "obsidian";
import {AcpClient, splitArgs} from "./acpClient";
import {
	addStreamingTextNodeToCanvas,
	CanvasTextNodeTarget,
	getSelectedCanvasSource,
	SelectedCanvasSource,
	updateCanvasTextNode,
} from "./canvas";
import {CanvasAcpSettings} from "./settings";

export async function askQuestionFromCanvasSelection(app: App, settings: CanvasAcpSettings): Promise<void> {
	const selection = await getSelectedCanvasSource(app);
	new AskQuestionModal(app, settings, selection).open();
}

class AskQuestionModal extends Modal {
	private question = "";
	private submitButton: HTMLButtonElement | null = null;
	private statusEl: HTMLElement | null = null;
	private isRunning = false;

	constructor(
		app: App,
		private readonly settings: CanvasAcpSettings,
		private readonly selection: SelectedCanvasSource,
	) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("canvas-acp-modal");
		contentEl.createEl("h2", {text: "Ask about this canvas node"});
		contentEl.createEl("p", {
			text: this.selection.sourceFile?.path ?? this.selection.sourceTitle,
			cls: "canvas-acp-source",
		});

		new Setting(contentEl)
			.setName("Question")
			.setDesc("The question becomes the canvas edge label.")
			.addTextArea((text) => {
				text.inputEl.rows = 5;
				text.setPlaceholder("What should this note help answer?");
				text.onChange((value) => {
					this.question = value.trim();
					this.updateSubmitState();
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		this.statusEl = contentEl.createDiv({cls: "canvas-acp-status"});

		new Setting(contentEl)
			.addButton((button) => {
				this.submitButton = button.buttonEl;
				button
					.setButtonText("Ask")
					.setCta()
					.onClick(() => void this.submit());
			})
			.addButton((button) => {
				button
					.setButtonText("Cancel")
					.onClick(() => this.close());
			});

		this.updateSubmitState();
	}

	onClose() {
		this.contentEl.empty();
	}

	private async submit() {
		if (!this.question || this.isRunning) {
			return;
		}

		this.isRunning = true;
		this.updateSubmitState();
		const question = this.question;
		this.close();
		void this.createResponseNodeAndStream(question);
	}

	private async createResponseNodeAndStream(question: string) {
		try {
			const target = await addStreamingTextNodeToCanvas(
				this.app,
				this.selection,
				question,
				this.settings,
				"Thinking...",
			);
			await this.streamResponse(question, target);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
		}
	}

	private async streamResponse(question: string, target: CanvasTextNodeTarget) {
		let lastText = "";
		const canvasUpdate = createThrottledCanvasUpdate(this.app, target);

		try {
			const prompt = buildPrompt(this.selection, question);
			const basePath = getVaultBasePath(this.app);
			const client = new AcpClient(this.settings.agentCommand, splitArgs(this.settings.agentArgs), basePath);

			const result = await client.runPrompt(prompt, [{
				uri: getSourceUri(this.selection, basePath),
				mimeType: "text/markdown",
				text: this.selection.sourceText,
			}], (_chunk, fullText) => {
				lastText = fullText.trimStart();
				canvasUpdate.schedule(lastText || "Thinking...");
			});

			lastText = result.text || lastText;
			await canvasUpdate.flush();
			await updateCanvasTextNode(this.app, target, lastText.trim() || "No response was returned by the ACP agent.");
		} catch (error) {
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
		lastWrite = lastWrite.then(() => updateCanvasTextNode(app, target, textToWrite));
	};

	return {
		schedule: (text: string) => {
			queuedText = text;
			if (timeoutId === null) {
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

function buildPrompt(selection: SelectedCanvasSource, question: string): string {
	return [
		"You are helping expand an Obsidian canvas graph.",
		"Answer the user's question using the provided canvas node as context.",
		"Create a concise but useful Markdown note body.",
		"Do not include YAML frontmatter, file names, or code fences around the full answer.",
		"",
		`Source: ${selection.sourceFile?.path ?? selection.sourceTitle}`,
		`Question: ${question}`,
	].join("\n");
}

function getSourceUri(selection: SelectedCanvasSource, basePath: string): string {
	if (selection.sourceFile) {
		return encodeURI(`file://${basePath}/${selection.sourceFile.path}`);
	}

	return encodeURI(selection.sourceUri);
}

function getVaultBasePath(app: App): string {
	const adapter = app.vault.adapter as {getBasePath?: () => string};
	const basePath = adapter.getBasePath?.();

	if (!basePath) {
		throw new Error("Canvas ACP requires the desktop file-system adapter.");
	}

	return basePath;
}
