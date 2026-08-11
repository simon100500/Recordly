import { fileURLToPath } from "node:url";

export type CaptionAudioCandidate = {
	path: string;
	label: string;
	startMs: number;
};

function normalizeCaptionAudioPath(candidatePath?: string | null) {
	if (typeof candidatePath !== "string") {
		return null;
	}

	const trimmed = candidatePath.trim();
	if (!trimmed) {
		return null;
	}

	if (/^file:\/\//i.test(trimmed)) {
		try {
			return fileURLToPath(trimmed);
		} catch {
			// Keep the original path as a best-effort fallback.
		}
	}

	return trimmed;
}

export function buildCaptionAudioCandidates(
	videoPath: string,
	externalAudioPath?: string | null,
	externalAudioStartMs = 0,
): CaptionAudioCandidate[] {
	const candidates: CaptionAudioCandidate[] = [];
	const seenPaths = new Set<string>();

	const pushCandidate = (
		candidatePath: string | null | undefined,
		label: string,
		startMs = 0,
	) => {
		const normalizedPath = normalizeCaptionAudioPath(candidatePath);
		if (!normalizedPath || seenPaths.has(normalizedPath)) {
			return;
		}

		seenPaths.add(normalizedPath);
		candidates.push({
			path: normalizedPath,
			label,
			startMs: Number.isFinite(startMs) ? Math.max(0, Math.round(startMs)) : 0,
		});
	};

	pushCandidate(externalAudioPath, "external audio track", externalAudioStartMs);
	pushCandidate(videoPath, "recording");

	return candidates;
}

export function shiftCaptionCueTimes<T extends { startMs: number; endMs: number }>(
	cues: T[],
	startMs: number,
): T[] {
	if (!Number.isFinite(startMs) || startMs === 0) {
		return cues;
	}

	const offsetMs = Math.max(0, Math.round(startMs));
	return cues.map((cue) => ({
		...cue,
		startMs: cue.startMs + offsetMs,
		endMs: cue.endMs + offsetMs,
	}));
}
