import {App, ItemView, normalizePath, TFile} from "obsidian";
import {CanvasAcpSettings} from "./settings";
import {debugLog, debugWarn} from "./debug";

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
	debugLog("canvas", "active view lookup", {
		hasView: Boolean(view),
		viewType: view?.getViewType?.(),
		filePath: view?.file?.path,
		hasCanvas: Boolean(view?.canvas),
		selectionSize: view?.canvas?.selection?.size,
	});
	if (view?.getViewType?.() !== "canvas" || !view.file) {
		throw new Error("Open a canvas and select one note node first.");
	}

	return view;
}

export async function getSelectedCanvasSource(app: App): Promise<SelectedCanvasSource> {
	debugLog("selection", "begin selected source resolution");
	const view = getActiveCanvasView(app);
	const canvasFile = view.file;
	if (!(canvasFile instanceof TFile)) {
		throw new Error("Open a canvas and select one node first.");
	}

	const data = await readCanvasData(app, canvasFile);
	const {selectedIds, selectedFiles} = getCanvasSelection(view, app);
	debugLog("selection", "selection candidates resolved", {
		canvasPath: canvasFile.path,
		nodeCount: data.nodes.length,
		edgeCount: data.edges.length,
		selectedIds: Array.from(selectedIds),
		selectedFiles: Array.from(selectedFiles),
	});

	const selectedNodes = data.nodes.filter((node) => selectedIds.has(node.id) || (node.file && selectedFiles.has(node.file)));
	const sourceNodes = selectedNodes.filter((node) => isSupportedSourceNode(node));
	debugLog("selection", "source node filter result", {
		selectedNodes: selectedNodes.map(summarizeNode),
		sourceNodes: sourceNodes.map(summarizeNode),
	});

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

	debugLog("selection", "resolved text source", summarizeNode(selectedNode));
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
	debugLog("selection", "raw canvas selection", {
		count: selectedItems.length,
		items: selectedItems.map(summarizeSelectionItem),
	});

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

	const selectedElements = Array.from(view.containerEl?.querySelectorAll(".canvas-node.is-selected, .canvas-node.mod-selected, .canvas-node.is-focused") ?? []);
	debugLog("selection", "dom selected nodes", {
		count: selectedElements.length,
		elements: selectedElements.map((element) => element instanceof HTMLElement ? {
			nodeId: element.dataset.nodeId,
			id: element.dataset.id,
			path: element.dataset.path,
			file: element.dataset.file,
			className: element.className,
		} : {elementType: typeof element}),
	});

	for (const element of selectedElements) {
		if (element instanceof HTMLElement) {
			addDefined(selectedIds, element.dataset.nodeId);
			addDefined(selectedIds, element.dataset.id);
			addDefined(selectedFiles, element.dataset.path);
			addDefined(selectedFiles, element.dataset.file);
		}
	}

	const activeFile = app.workspace.getActiveFile();
	debugLog("selection", "active file fallback", {
		activeFilePath: activeFile?.path,
		canvasFilePath: view.file?.path,
	});
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
	const canvasPath = resolveCanvasPath(app, selection.canvasPath, selection.view);
	debugLog("canvas-write", "add generated note node", {
		canvasPath,
		sourceNodeId: selection.sourceNodeId,
		newNotePath: newNote.path,
		questionLength: question.length,
	});
	const canvasFile = getCanvasFile(app, canvasPath);
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
	if (!selection.view) {
		throw new Error("Canvas view is no longer available. Please reopen the canvas and try again.");
	}
	const canvasPath = resolveCanvasPath(app, selection.canvasPath, selection.view);
	debugLog("canvas-write", "add streaming text node start", {
		canvasPath,
		sourceNodeId: selection.sourceNodeId,
		questionLength: question.length,
		initialText,
	});
	const canvasFile = getCanvasFile(app, canvasPath);
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
	debugLog("canvas-write", "new text node and edge prepared", {
		targetNode: summarizeNode(targetNode),
		edge,
		nodeCount: data.nodes.length,
		edgeCount: data.edges.length,
	});

	await writeCanvasData(app, canvasFile, data, selection.view);

	return {
		canvasPath,
		nodeId: targetNode.id,
		view: selection.view,
	};
}

export async function updateCanvasTextNode(app: App, target: CanvasTextNodeTarget, text: string): Promise<void> {
	if (!target.view) {
		throw new Error("Canvas view is no longer available. Please reopen the canvas and try again.");
	}
	const canvasPath = resolveCanvasPath(app, target.canvasPath, target.view);
	debugLog("canvas-write", "update text node start", {
		canvasPath,
		nodeId: target.nodeId,
		textLength: text.length,
		textPreview: text.slice(0, 160),
	});
	const canvasFile = getCanvasFile(app, canvasPath);
	const data = await readCanvasData(app, canvasFile);
	const node = data.nodes.find((canvasNode) => canvasNode.id === target.nodeId);

	if (!node) {
		throw new Error("The generated canvas text node could not be found.");
	}

	node.text = text;
	await writeCanvasData(app, canvasFile, data, target.view);
}

function resolveCanvasPath(app: App, preferredPath: string | undefined, view: CanvasViewLike | undefined): string {
	const path = preferredPath ?? view?.file?.path ?? getActiveCanvasView(app).file?.path;
	debugLog("canvas", "resolve canvas path", {
		preferredPath,
		viewFilePath: view?.file?.path,
		resolvedPath: path,
	});
	if (!path) {
		throw new Error("Canvas file is no longer available.");
	}

	return path;
}

function getCanvasFile(app: App, path: string): TFile {
	const file = app.vault.getAbstractFileByPath(path);
	debugLog("canvas", "resolve canvas file", {
		path,
		fileType: file?.constructor.name,
		isTFile: file instanceof TFile,
	});
	if (!(file instanceof TFile)) {
		throw new Error(`Canvas file is no longer available: ${path}`);
	}

	return file;
}

async function readCanvasData(app: App, file: TFile): Promise<CanvasData> {
	debugLog("canvas-read", "read canvas", {path: file.path});
	const raw = await app.vault.read(file);
	const parsed = JSON.parse(raw) as Partial<CanvasData>;
	const data = {
		nodes: parsed.nodes ?? [],
		edges: parsed.edges ?? [],
	};
	debugLog("canvas-read", "parsed canvas", {
		path: file.path,
		nodeCount: data.nodes.length,
		edgeCount: data.edges.length,
	});
	return data;
}

async function writeCanvasData(app: App, file: TFile, data: CanvasData, view: CanvasViewLike): Promise<void> {
	debugLog("canvas-write", "write canvas", {
		path: file.path,
		nodeCount: data.nodes.length,
		edgeCount: data.edges.length,
	});
	await app.vault.modify(file, `${JSON.stringify(data, null, "\t")}\n`);
	refreshCanvasView(view, data);
}

function refreshCanvasView(view: CanvasViewLike, data: CanvasData) {
	try {
		debugLog("canvas-refresh", "refresh active canvas view", {
			viewFilePath: view.file?.path,
			nodeCount: data.nodes.length,
			edgeCount: data.edges.length,
			hasImportData: Boolean(view.canvas?.importData),
			hasRequestSave: Boolean(view.canvas?.requestSave),
		});
		view.canvas?.importData?.(data);
		view.canvas?.requestSave?.();
	} catch (error) {
		debugWarn("canvas-refresh", "could not refresh active canvas view", error);
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

function summarizeNode(node: CanvasNodeData) {
	return {
		id: node.id,
		type: node.type,
		file: node.file,
		textLength: node.text?.length,
		textPreview: node.text?.slice(0, 120),
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
	};
}

function summarizeSelectionItem(item: CanvasSelectionItem) {
	return {
		id: item.id,
		file: item.file,
		path: item.path,
		data: item.data ? summarizePartialNode(item.data) : undefined,
		child: item.child ? summarizePartialNode(item.child) : undefined,
		node: item.node ? summarizePartialNode(item.node) : undefined,
		keys: Object.keys(item),
	};
}

function summarizePartialNode(node: Partial<CanvasNodeData>) {
	return {
		id: node.id,
		type: node.type,
		file: node.file,
		textLength: node.text?.length,
		textPreview: node.text?.slice(0, 120),
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
	};
}
