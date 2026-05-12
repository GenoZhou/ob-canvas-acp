import {App, TFile} from "obsidian";
import {normalizeVaultPath} from "./canvas";
import {CanvasAcpSettings} from "./settings";

export interface GeneratedNoteSource {
	title: string;
	path?: string;
	canvasNodeId: string;
}

export async function createGeneratedNote(
	app: App,
	source: GeneratedNoteSource,
	question: string,
	content: string,
	settings: CanvasAcpSettings,
): Promise<TFile> {
	const basename = buildBasename(source.title, question, settings.noteNameTemplate);
	const folder = normalizeVaultPath(settings.outputFolder);
	const path = await nextAvailablePath(app, folder ? `${folder}/${basename}.md` : `${basename}.md`);

	await ensureFolder(app, path.split("/").slice(0, -1).join("/"));

	const body = [
		"---",
		...(source.path ? [`source: "[[${source.path}]]"`] : []),
		`canvasNodeId: ${JSON.stringify(source.canvasNodeId)}`,
		`question: ${JSON.stringify(question)}`,
		"---",
		"",
		`# ${basename}`,
		"",
		content.trim() || "_No response was returned by the ACP agent._",
		"",
	].join("\n");

	return await app.vault.create(path, body);
}

function buildBasename(source: string, question: string, template: string): string {
	const raw = template
		.split("{{source}}").join(source)
		.split("{{question}}").join(question);

	const cleaned = raw
		.replace(/[\\/:#^[\]|?*<>"]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 90);

	return cleaned || "Canvas question";
}

async function nextAvailablePath(app: App, initialPath: string): Promise<string> {
	const extension = ".md";
	const basePath = initialPath.endsWith(extension) ? initialPath.slice(0, -extension.length) : initialPath;
	let candidate = `${basePath}${extension}`;
	let index = 2;

	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = `${basePath} ${index}${extension}`;
		index += 1;
	}

	return candidate;
}

async function ensureFolder(app: App, folder: string) {
	if (!folder) {
		return;
	}

	const segments = folder.split("/").filter(Boolean);
	let current = "";

	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(current)) {
			await app.vault.createFolder(current);
		}
	}
}
