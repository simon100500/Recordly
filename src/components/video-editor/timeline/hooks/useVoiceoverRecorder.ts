import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const VOICEOVER_AUDIO_BITRATE = 256_000;
const RECORDER_TIMESLICE_MS = 250;

export function useVoiceoverRecorder() {
	const [isRecording, setIsRecording] = useState(false);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const resolveRef = useRef<{ resolve: (path: string | null) => void; promise: Promise<string | null> } | null>(null);

	const startRecording = useCallback(async (deviceId?: string): Promise<string | null> => {
		if (isRecording) return null;
		chunksRef.current = [];

		const audioConstraints: MediaTrackConstraints = {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			channelCount: { ideal: 2 },
			sampleRate: { ideal: 48000 },
			sampleSize: { ideal: 24 },
		};
		if (deviceId) {
			audioConstraints.deviceId = { exact: deviceId };
		}

		let micStream: MediaStream;
		try {
			micStream = await navigator.mediaDevices.getUserMedia({
				audio: audioConstraints,
				video: false,
			});
		} catch (err) {
			const message =
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Microphone access denied. Please allow microphone permission to record voiceover."
					: "Failed to access microphone. Please check your microphone settings.";
			toast.error(message);
			return null;
		}

		streamRef.current = micStream;

		const recorder = new MediaRecorder(micStream, {
			mimeType: "audio/webm;codecs=opus",
			audioBitsPerSecond: VOICEOVER_AUDIO_BITRATE,
		});

		recorderRef.current = recorder;

		let resolvePromise: (path: string | null) => void;
		const promise = new Promise<string | null>((resolve) => {
			resolvePromise = resolve;
		});

		resolveRef.current = { resolve: resolvePromise!, promise };

		recorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) {
				chunksRef.current.push(event.data);
			}
		};

		recorder.onstop = async () => {
			const blob =
				chunksRef.current.length > 0
					? new Blob(chunksRef.current, { type: recorder.mimeType })
					: null;
			chunksRef.current = [];

			micStream.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
			recorderRef.current = null;

			if (!blob) {
				resolvePromise!(null);
				return;
			}

			try {
				const arrayBuffer = await blob.arrayBuffer();
				const timestamp = Date.now();
				const fileName = `voiceover-${timestamp}.webm`;
				const result = await window.electronAPI.storeVoiceoverAudio(
					arrayBuffer,
					fileName,
				);
				resolvePromise!(result.success ? (result.path ?? null) : null);
			} catch {
				resolvePromise!(null);
			}
		};

		recorder.onerror = () => {
			micStream.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
			recorderRef.current = null;
			resolvePromise!(null);
		};

		setIsRecording(true);
		recorder.start(RECORDER_TIMESLICE_MS);
		return promise;
	}, [isRecording]);

	const stopRecording = useCallback((): Promise<string | null> | null => {
		const recorder = recorderRef.current;
		if (!recorder || recorder.state === "inactive") {
			setIsRecording(false);
			return Promise.resolve(null);
		}

		const pending = resolveRef.current;
		setIsRecording(false);
		recorder.stop();
		return pending?.promise ?? Promise.resolve(null);
	}, []);

	const cancelRecording = useCallback(() => {
		const recorder = recorderRef.current;
		if (recorder && recorder.state !== "inactive") {
			recorder.ondataavailable = null;
			recorder.onstop = null;
			recorder.stream.getTracks().forEach((t) => t.stop());
			try {
				recorder.stop();
			} catch {
				/* ignore */
			}
		}
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		recorderRef.current = null;
		chunksRef.current = [];
		setIsRecording(false);
	}, []);

	useEffect(() => {
		return () => {
			cancelRecording();
		};
	}, [cancelRecording]);

	return {
		isRecording,
		startRecording,
		stopRecording,
		cancelRecording,
	};
}
