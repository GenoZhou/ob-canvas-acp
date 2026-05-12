import {App, ItemView, normalizePath, TFile} from "obsidian";
import {CanvasAcpSettings} from "./settings";

interface CanvasNodeData {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	file?: string;
	text?: string;
}

interface CanvasEdgeData {
	id: string;
	fromNode: string;
	fromSide?: string;
	toNode: string;
	toSide?: string;
	label?: string;
}

interface CanvasData {
	nodes: CanvasNodeData[];
	edges: CanvasEdgeData[];
}

interface CanvasSelectionItem {
	id?: string;
	file?: string;
	path?: string;
	child?: Partial<CanvasNodeData>;
	node?: Partial<CanvasNodeData>;
	data?: Partial<CanvasNodeData>;
}

interface CanvasViewLike {
	file?: TFile;
	containerEl?: HTMLElement;
	getViewType?: () => string;
	canvas?: {
		selection?: Set<CanvasSelectionItem>;
		importData?: (data: CanvasData) => void;
		requestSave?: () => void;
	};
}

export interface SelectedCanvasSource {
	canvasPath?: string;
	sourceFile?: TFile;
	sourceText: string;
	sourceTitle: string;
	sourceUri: string;
	sourceNodeId: string;
	view: CanvasViewLike;
}

export interface CanvasTextNodeTarget {
	canvasPath?: string;
	nodeId: string;
	view: CanvasViewLike;
}

export function getActiveCanvasView(app: App): CanvasViewLike {
	const view = app.workspace.getActiveViewOfType(ItemView) as CanvasViewLike | null;
	if (view?.getViewType?.() !== "canvas" || !view.file) {
		throw new Error("Open a canvas and select one note node first.");
	}

	return view;
}

export async function getSelectedCanvasSource(app: App): Promise<SelectedCanvasSource> {
	const view = getActiveCanvasView(app);
	const canvasFile = view.file;
	if (!(canvasFile instanceof TFile)) {
		throw new Error("Open a canvas and select one node first.");
	}

	const data = await readCanvasData(app, canvasFile);
	const {selectedIds, selectedFiles} = getCanvasSelection(view, app);

	const selectedNodes = data.nodes.filter((node) => selectedIds.has(node.id) || (node.file && selectedFiles.has(node.file)));
	const sourceNodes = selectedNodes.filter((node) => isSupportedSourceNode(node));

	if (sourceNodes.length !== 1) {
		throw new Error(`Select exactly one note or text node on the active canvas. Found ${sourceNodes.length}.`);
	}

	const selectedNode = sourceNodes[0];
	if (!selectedNode) {
		throw new Error("The selected canvas node could not be read.");
	}

	if (selectedNode.type === "file") {
		if (!selectedNode.file) {
			throw new Error("The selected note node does not point to a note.");
		}

		const sourceFile = app.vault.getAbstractFileByPath(selectedNode.file);
		if (!(sourceFile instanceof TFile)) {
			throw new Error("The selected note node does not point to an existing note.");
		}

		return {
			canvasPath: canvasFile.path,
			sourceFile,
			sourceText: await app.vault.read(sourceFile),
			sourceTitle: sourceFile.basename,
			sourceUri: `vault://${sourceFile.path}`,
			sourceNodeId: selectedNode.id,
			view,
		};
	}

	return {
		canvasPath: canvasFile.path,
		sourceText: selectedNode.text ?? "",
		sourceTitle: firstTextLine(selectedNode.text) || "Canvas text",
		sourceUri: `canvas://${canvasFile.path}#${selectedNode.id}`,
		sourceNodeId: selectedNode.id,
		view,
	};
}

function isSupportedSourceNode(node: CanvasNodeData): boolean {
	return (node.type === "file" && Boolean(node.file)) || node.type === "text";
}

function firstTextLine(text: string | undefined): string {
	return text?.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 60) ?? "";
}

function getCanvasSelection(view: CanvasViewLike, app: App): {selectedIds: Set<string>; selectedFiles: Set<string>} {
	const selectedItems = Array.from(view.canvas?.selection ?? []);
	const selectedIds = new Set<string>();
	const selectedFiles = new Set<string>();

	for (const item of selectedItems) {
		addDefined(selectedIds, item.data?.id);
		addDefined(selectedIds, item.child?.id);
		addDefined(selectedIds, item.node?.id);
		addDefined(selectedIds, item.id);

		addDefined(selectedFiles, item.data?.file);
		addDefined(selectedFiles, item.child?.file);
		addDefined(selectedFiles, item.node?.file);
		addDefined(selectedFiles, item.file);
		addDefined(selectedFiles, item.path);
	}

	for (const element of Array.from(view.containerEl?.querySelectorAll(".canvas-node.is-selected, .canvas-node.mod-selected, .canvas-node.is-focused") ?? [])) {
		if (element instanceof HTMLElement) {
			addDefined(selectedIds, element.dataset.nodeId);
			addDefined(selectedIds, element.dataset.id);
			addDefined(selectedFiles, element.dataset.path);
			addDefined(selectedFiles, element.dataset.file);
		}
	}

	const activeFile = app.workspace.getActiveFile();
	if (activeFile instanceof TFile && activeFile.extension === "md" && activeFile.path !== view.file?.path) {
		selectedFiles.add(activeFile.path);
	}

	return {selectedIds, selectedFiles};
}

function addDefined(values: Set<string>, value: string | undefined) {
	if (value) {
		values.add(value);
	}
}

export async function addGeneratedNoteToCanvas(
	app: App,
	selection: SelectedCanvasSource,
	newNote: TFile,
	question: string,
	settings: CanvasAcpSettings,
) {
	const canvasFile = getCanvasFile(app, resolveCanvasPath(app, selection.canvasPath, selection.view));
	const data = await readCanvasData(app, canvasFile);
	const sourceNode = data.nodes.find((node) => node.id === selection.sourceNodeId);

	if (!sourceNode) {
		throw new Error("The selected canvas node could not be found.");
	}

	const targetNode: CanvasNodeData = {
		id: createCanvasId(),
		type: "file",
		file: newNote.path,
		x: sourceNode.x + sourceNode.width + 180,
		y: sourceNode.y,
		width: settings.nodeWidth,
		height: settings.nodeHeight,
	};

	const edge: CanvasEdgeData = {
		id: createCanvasId(),
		fromNode: sourceNode.id,
		fromSide: "right",
		toNode: targetNode.id,
		toSide: "left",
		label: question,
	};

	data.nodes.push(targetNode);
	data.edges.push(edge);

	await app.vault.modify(canvasFile, `${JSON.stringify(data, null, "\t")}\n`);
	selection.view.canvas?.importData?.(data);
	selection.view.canvas?.requestSave?.();
}

export async function addStreamingTextNodeToCanvas(
	app: App,
	selection: SelectedCanvasSource,
	question: string,
	settings: CanvasAcpSettings,
	initialText: string,
): Promise<CanvasTextNodeTarget> {
	const canvasFile = getCanvasFile(app, resolveCanvasPath(app, selection.canvasPath, selection.view));
	const data = await readCanvasData(app, canvasFile);
	const sourceNode = data.nodes.find((node) => node.id === selection.sourceNodeId);

	if (!sourceNode) {
		throw new Error("The selected canvas node could not be found.");
	}

	const targetNode: CanvasNodeData = {
		id: createCanvasId(),
		type: "text",
		text: initialText,
		x: sourceNode.x + sourceNode.width + 180,
		y: sourceNode.y,
		width: settings.nodeWidth,
		height: settings.nodeHeight,
	};

	const edge: CanvasEdgeData = {
		id: createCanvasId(),
		fromNode: sourceNode.id,
		fromSide: "right",
		toNode: targetNode.id,
		toSide: "left",
		label: question,
	};

	data.nodes.push(targetNode);
	data.edges.push(edge);

	await writeCanvasData(app, canvasFile, data, selection.view);

	return {
		canvasPath: resolveCanvasPath(app, selection.canvasPath, selection.view),
		nodeId: targetNode.id,
		view: selection.view,
	};
}

export async function updateCanvasTextNode(app: App, target: CanvasTextNodeTarget, text: string): Promise<void> {
	const canvasFile = getCanvasFile(app, resolveCanvasPath(app, target.canvasPath, target.view));
	const data = await readCanvasData(app, canvasFile);
	const node = data.nodes.find((canvasNode) => canvasNode.id === target.nodeId);

	if (!node) {
		throw new Error("The generated canvas text node could not be found.");
	}

	node.text = text;
	await writeCanvasData(app, canvasFile, data, target.view);
}

function resolveCanvasPath(app: App, preferredPath: string | undefined, view: CanvasViewLike): string {
	const path = preferredPath ?? view.file?.path ?? getActiveCanvasView(app).file?.path;
	if (!path) {
		throw new Error("Canvas file is no longer available.");
	}

	return path;
}

function getCanvasFile(app: App, path: string): TFile {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		throw new Error(`Canvas file is no longer available: ${path}`);
	}

	return file;
}

async function readCanvasData(app: App, file: TFile): Promise<CanvasData> {
	const raw = await app.vault.read(file);
	const parsed = JSON.parse(raw) as Partial<CanvasData>;
	return {
		nodes: parsed.nodes ?? [],
		edges: parsed.edges ?? [],
	};
}

async function writeCanvasData(app: App, file: TFile, data: CanvasData, view: CanvasViewLike): Promise<void> {
	await app.vault.modify(file, `${JSON.stringify(data, null, "\t")}\n`);
	refreshCanvasView(view, data);
}

function refreshCanvasView(view: CanvasViewLike, data: CanvasData) {
	try {
		view.canvas?.importData?.(data);
		view.canvas?.requestSave?.();
	} catch (error) {
		console.warn("Canvas ACP could not refresh the active canvas view.", error);
	}
}

function createCanvasId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeVaultPath(path: string): string {
	return normalizePath(path).replace(/^\/+/, "");
}
