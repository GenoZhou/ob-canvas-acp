import {App, ItemView, TFile} from "obsidian";
import {CanvasAcpSettings} from "./settings";
import {debugLog, debugWarn} from "./debug";

const HORIZONTAL_OFFSET = 180;
const VERTICAL_GAP = 40;
const CANVAS_ID_BYTES = 8;

interface CanvasNodeData {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	file?: string;
	text?: string;
	label?: string;
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
	upstreamContext?: string;
	upstreamNodeCount: number;
	allSourceNodeIds: string[];
}

export interface CanvasTextNodeTarget {
	canvasPath?: string;
	nodeId: string;
	view: CanvasViewLike;
}

export function assertCanvasViewAvailable(view: CanvasViewLike | undefined): asserts view is CanvasViewLike {
	if (!view) {
		throw new Error("Canvas view is no longer available. Please reopen the canvas and try again.");
	}
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
	let sourceNodes = selectedNodes.filter((node) => isSupportedSourceNode(node) || node.type === "group");
	debugLog("selection", "source node filter result", {
		selectedNodes: selectedNodes.map(summarizePartialNode),
		sourceNodes: sourceNodes.map(summarizePartialNode),
	});

	if (sourceNodes.length !== 1) {
		const groupNode = sourceNodes.find((node) => node.type === "group");
		if (groupNode) {
			sourceNodes = [groupNode];
		} else {
			throw new Error(`Select exactly one note, text, or group node on the active canvas. Found ${sourceNodes.length}.`);
		}
	}

	const selectedNode = sourceNodes[0]!;
	const upstreamContext = await getUpstreamContext(app, data, selectedNode);
	const upstreamNodeCount = countUpstreamEdges(data, selectedNode.id);

	const baseResult = {
		canvasPath: canvasFile.path,
		sourceNodeId: selectedNode.id,
		view,
		upstreamContext,
		upstreamNodeCount,
		allSourceNodeIds: [selectedNode.id],
	};

	if (selectedNode.type === "group") {
		const groupNodes = data.nodes.filter((node) =>
			node.id !== selectedNode.id &&
			isSupportedSourceNode(node) &&
			isNodeInGroup(node, selectedNode),
		);

		if (groupNodes.length === 0) {
			throw new Error("The selected group does not contain any note or text nodes.");
		}

		const texts = (await Promise.all(groupNodes.map((node) => readNodeContent(app, node))))
			.filter((text): text is string => Boolean(text));

		debugLog("selection", "resolved group source", {
			groupLabel: selectedNode.label,
			groupNodeCount: groupNodes.length,
			combinedTextLength: texts.join("\n\n").length,
		});

		return {
			...baseResult,
			sourceText: texts.join("\n\n---\n\n"),
			sourceTitle: selectedNode.label || "Group",
			sourceUri: `canvas://${canvasFile.path}#${selectedNode.id}`,
		};
	}

	debugLog("selection", "upstream context resolved", {
		upstreamNodeCount,
		upstreamContextLength: upstreamContext.length,
	});

	if (selectedNode.type === "file") {
		if (!selectedNode.file) {
			throw new Error("The selected note node does not point to a note.");
		}

		const sourceFile = app.vault.getAbstractFileByPath(selectedNode.file);
		if (!(sourceFile instanceof TFile)) {
			throw new Error("The selected note node does not point to an existing note.");
		}

		return {
			...baseResult,
			sourceFile,
			sourceText: await app.vault.read(sourceFile),
			sourceTitle: sourceFile.basename,
			sourceUri: `vault://${sourceFile.path}`,
		};
	}

	debugLog("selection", "resolved text source", summarizePartialNode(selectedNode));
	return {
		...baseResult,
		sourceText: selectedNode.text ?? "",
		sourceTitle: firstTextLine(selectedNode.text) || "Canvas text",
		sourceUri: `canvas://${canvasFile.path}#${selectedNode.id}`,
	};
}

function isSupportedSourceNode(node: CanvasNodeData): boolean {
	return (node.type === "file" && Boolean(node.file)) || node.type === "text";
}

function isNodeInGroup(node: CanvasNodeData, group: CanvasNodeData): boolean {
	return (
		node.x >= group.x &&
		node.y >= group.y &&
		node.x + (node.width ?? 0) <= group.x + (group.width ?? 0) &&
		node.y + (node.height ?? 0) <= group.y + (group.height ?? 0)
	);
}

function firstTextLine(text: string | undefined): string {
	return text?.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 60) ?? "";
}

async function getUpstreamContext(app: App, data: CanvasData, selectedNode: CanvasNodeData, excludeNodeIds?: Set<string>): Promise<string> {
	const upstreamEdges = data.edges.filter((edge) => edge.toNode === selectedNode.id);
	const upstreamNodes = upstreamEdges
		.map((edge) => data.nodes.find((node) => node.id === edge.fromNode))
		.filter((node): node is CanvasNodeData => Boolean(node))
		.filter((node) => !excludeNodeIds?.has(node.id));

	if (upstreamNodes.length === 0) {
		return "";
	}

	const parts = (await Promise.all(upstreamNodes.map((node) => readNodeContent(app, node))))
		.filter((text): text is string => Boolean(text));

	return parts.join("\n\n");
}

async function readNodeContent(app: App, node: CanvasNodeData): Promise<string | undefined> {
	if (node.type === "file" && node.file) {
		const file = app.vault.getAbstractFileByPath(node.file);
		if (file instanceof TFile) {
			const content = await app.vault.read(file);
			return `Note [[${file.basename}]]:\n${content}`;
		}
	} else if (node.type === "text") {
		return `Text node:\n${node.text ?? ""}`;
	}
	return undefined;
}

function countUpstreamEdges(data: CanvasData, nodeId: string): number {
	return data.edges.filter((edge) => edge.toNode === nodeId).length;
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
		addDefined(selectedIds, item.data?.id, item.child?.id, item.node?.id, item.id);
		addDefined(selectedFiles, item.data?.file, item.child?.file, item.node?.file, item.file, item.path);
	}

	const selectedElements = Array.from(view.containerEl?.querySelectorAll(".canvas-node.is-selected, .canvas-node.mod-selected, .canvas-node.is-focused, .canvas-group.is-selected, .canvas-group.mod-selected, .canvas-group.is-focused") ?? []);
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
			addDefined(selectedIds, element.dataset.nodeId, element.dataset.id);
			addDefined(selectedFiles, element.dataset.path, element.dataset.file);
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

function addDefined(values: Set<string>, ...items: Array<string | undefined>) {
	for (const value of items) {
		if (value) {
			values.add(value);
		}
	}
}

export async function addStreamingTextNodeToCanvas(
	app: App,
	selection: SelectedCanvasSource,
	question: string,
	settings: CanvasAcpSettings,
	initialText: string,
): Promise<CanvasTextNodeTarget> {
	assertCanvasViewAvailable(selection.view);
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

	const {x: targetX, y: targetY} = findNonOverlappingPosition(data, sourceNode, settings.nodeWidth, settings.nodeHeight);
	const targetNode: CanvasNodeData = {
		id: createCanvasId(),
		type: "text",
		text: initialText,
		x: targetX,
		y: targetY,
		width: settings.nodeWidth,
		height: settings.nodeHeight,
	};

	for (const sourceNodeId of selection.allSourceNodeIds) {
		const fromNode = data.nodes.find((node) => node.id === sourceNodeId);
		if (fromNode) {
			const edge: CanvasEdgeData = {
				id: createCanvasId(),
				fromNode: sourceNodeId,
				fromSide: "right",
				toNode: targetNode.id,
				toSide: "left",
				label: question,
			};
			data.edges.push(edge);
		}
	}

	data.nodes.push(targetNode);
	debugLog("canvas-write", "new text node and edges prepared", {
		targetNode: summarizePartialNode(targetNode),
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
	assertCanvasViewAvailable(target.view);
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

function findNonOverlappingPosition(data: CanvasData, sourceNode: CanvasNodeData, nodeWidth: number, nodeHeight: number): {x: number; y: number} {
	const targetX = sourceNode.x + sourceNode.width + HORIZONTAL_OFFSET;
	const gap = VERTICAL_GAP;

	const overlappingNodes = data.nodes.filter((node) => {
		return node.x < targetX + nodeWidth && node.x + (node.width ?? nodeWidth) > targetX;
	});

	overlappingNodes.sort((a, b) => a.y - b.y);

	let targetY = sourceNode.y;
	for (const node of overlappingNodes) {
		const nodeBottom = node.y + (node.height ?? nodeHeight);
		if (node.y <= targetY && nodeBottom > targetY) {
			targetY = nodeBottom + gap;
		}
	}

	return {x: targetX, y: targetY};
}

function createCanvasId(): string {
	const bytes = new Uint8Array(CANVAS_ID_BYTES);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
