let debugLoggingEnabled = true;

export function setCanvasAcpDebugLogging(enabled: boolean) {
	debugLoggingEnabled = enabled;
}

export function debugLog(scope: string, message: string, data?: unknown) {
	if (!debugLoggingEnabled) {
		return;
	}

	console.debug(`[Canvas ACP][${scope}] ${message}`, sanitizeDebugData(data));
}

export function debugWarn(scope: string, message: string, data?: unknown) {
	if (!debugLoggingEnabled) {
		return;
	}

	console.warn(`[Canvas ACP][${scope}] ${message}`, sanitizeDebugData(data));
}

export function debugError(scope: string, message: string, error: unknown) {
	if (!debugLoggingEnabled) {
		return;
	}

	console.error(`[Canvas ACP][${scope}] ${message}`, sanitizeDebugData(error));
}

function sanitizeDebugData(data: unknown): unknown {
	return sanitizeDebugDataInner(data, new WeakSet<object>());
}

function sanitizeDebugDataInner(data: unknown, seen: WeakSet<object>): unknown {
	if (data instanceof Error) {
		return {
			message: data.message,
			name: data.name,
			stack: data.stack,
		};
	}

	if (Array.isArray(data)) {
		return data.map((item) => sanitizeDebugDataInner(item, seen));
	}

	if (data && typeof data === "object") {
		if (seen.has(data)) {
			return "[Circular]";
		}
		seen.add(data);

		const safe: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data)) {
			if (key.toLowerCase().includes("text") && typeof value === "string") {
				safe[key] = summarizeText(value);
			} else if (key.toLowerCase().includes("content") && typeof value === "string") {
				safe[key] = summarizeText(value);
			} else {
				safe[key] = sanitizeDebugDataInner(value, seen);
			}
		}
		return safe;
	}

	return data;
}

function summarizeText(text: string): {length: number; preview: string} {
	return {
		length: text.length,
		preview: text.slice(0, 160),
	};
}
