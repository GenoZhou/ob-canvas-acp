import {App, Modal, Notice, Setting, TFile} from "obsidian";
import {AcpClient, splitArgs} from "./acpClient";
import {addGeneratedNoteToCanvas, getSelectedCanvasNote, SelectedCanvasNote} from "./canvas";
import {createGeneratedNote} from "./noteFactory";
import {CanvasAcpSettings} from "./settings";

export async function askQuestionFromCanvasSelection(app: App, settings: CanvasAcpSettings): Promise<void> {
	const selection = await getSelectedCanvasNote(app);
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
		private readonly selection: SelectedCanvasNote,
	) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("canvas-acp-modal");
		contentEl.createEl("h2", {text: "Ask about this note"});
		contentEl.createEl("p", {
			text: this.selection.noteFile.path,
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
		this.setStatus("Reading source note...");

		try {
			const sourceContent = await this.app.vault.read(this.selection.noteFile);
			const prompt = buildPrompt(this.selection.noteFile, this.question);
			const basePath = getVaultBasePath(this.app);
			const client = new AcpClient(this.settings.agentCommand, splitArgs(this.settings.agentArgs), basePath);

			this.setStatus("Asking ACP agent...");
			const result = await client.runPrompt(prompt, [{
				uri: encodeURI(`file://${basePath}/${this.selection.noteFile.path}`),
				mimeType: "text/markdown",
				text: sourceContent,
			}]);

			this.setStatus("Creating note and updating canvas...");
			const note = await createGeneratedNote(this.app, this.selection.noteFile, this.question, result.text, this.settings);
			await addGeneratedNoteToCanvas(this.app, this.selection, note, this.question, this.settings);

			new Notice(`Created ${note.path}`);
			this.close();
		} catch (error) {
			this.setStatus(error instanceof Error ? error.message : "Canvas ACP failed.");
			new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
		} finally {
			this.isRunning = false;
			this.updateSubmitState();
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

function buildPrompt(sourceFile: TFile, question: string): string {
	return [
		"You are helping expand an Obsidian canvas graph.",
		"Answer the user's question using the provided source note as context.",
		"Create a concise but useful Markdown note body.",
		"Do not include YAML frontmatter, file names, or code fences around the full answer.",
		"",
		`Source note: ${sourceFile.path}`,
		`Question: ${question}`,
	].join("\n");
}

function getVaultBasePath(app: App): string {
	const adapter = app.vault.adapter as {getBasePath?: () => string};
	const basePath = adapter.getBasePath?.();

	if (!basePath) {
		throw new Error("Canvas ACP requires the desktop file-system adapter.");
	}

	return basePath;
}
