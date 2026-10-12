
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const uploadBox = document.getElementById("uploadBox");
    const chooseButton = document.getElementById("chooseButton");
    const audioFile = document.getElementById("audioFile");
    const editor = document.getElementById("editor");
    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const audioPlayer = document.getElementById("audioPlayer");
    const startTime = document.getElementById("startTime");
    const endTime = document.getElementById("endTime");
    const selectedDuration = document.getElementById("selectedDuration");
    const cutButton = document.getElementById("cutButton");
    const resetButton = document.getElementById("resetButton");
    const statusMessage = document.getElementById("statusMessage");

    let currentFile = null;
    let originalAudioUrl = null;
    let audioDuration = 0;
    let isProcessing = false;

    function setStatus(message, type = "info") {
        statusMessage.textContent = message;

        if (type === "info") {
            statusMessage.removeAttribute("data-type");
        } else {
            statusMessage.dataset.type = type;
        }
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) {
            return "0:00";
        }

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function getTrimRange() {
        const start = Number(startTime.value);
        const end = Number(endTime.value);

        if (
            startTime.value.trim() === "" ||
            endTime.value.trim() === "" ||
            !Number.isFinite(start) ||
            !Number.isFinite(end)
        ) {
            return { error: "Please enter valid start and end times." };
        }

        if (start < 0 || end < 0) {
            return { error: "Time values cannot be negative." };
        }

        if (start >= end) {
            return { error: "End time must be greater than start time." };
        }

        if (end > audioDuration) {
            return {
                error: `End time cannot exceed ${audioDuration.toFixed(2)} seconds.`
            };
        }

        return {
            start,
            end,
            duration: end - start
        };
    }

    function updateSelectedDuration() {
        if (!currentFile || !audioDuration) {
            selectedDuration.textContent = "0:00";
            return;
        }

        const range = getTrimRange();

        if (range.error) {
            selectedDuration.textContent = "Invalid range";
            return;
        }

        selectedDuration.textContent =
            `${formatTime(range.duration)} (${range.duration.toFixed(2)} sec)`;
    }

    function clearCurrentAudio() {
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();

        if (originalAudioUrl) {
            URL.revokeObjectURL(originalAudioUrl);
            originalAudioUrl = null;
        }

        currentFile = null;
        audioDuration = 0;
    }

    function loadAudio(file) {
        if (!file) {
            return;
        }

        if (file.size === 0) {
            setStatus("This file is empty. Please choose another audio file.", "error");
            return;
        }

        const looksLikeAudio =
            file.type.startsWith("audio/") ||
            /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i.test(file.name);

        if (!looksLikeAudio) {
            setStatus("Please choose a valid audio file.", "error");
            return;
        }

        clearCurrentAudio();

        currentFile = file;
        originalAudioUrl = URL.createObjectURL(file);

        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);

        startTime.value = "0";
        endTime.value = "0";
        startTime.min = "0";
        endTime.min = "0";

        editor.classList.add("active");
        setStatus("Loading your audio file...");

        audioPlayer.src = originalAudioUrl;
        audioPlayer.load();

        audioPlayer.onloadedmetadata = () => {
            if (!currentFile || audioPlayer.src !== originalAudioUrl) {
                return;
            }

            const duration = audioPlayer.duration;

            if (!Number.isFinite(duration) || duration <= 0) {
                setStatus(
                    "The audio duration could not be read. Try another supported audio file.",
                    "error"
                );
                return;
            }

            audioDuration = duration;

            startTime.max = String(duration);
            endTime.max = String(duration);
            endTime.value = String(duration);

            updateSelectedDuration();

            setStatus(
                `Audio loaded successfully! Total duration: ${duration.toFixed(2)} seconds.`,
                "success"
            );
        };

        audioPlayer.onerror = () => {
            setStatus(
                "This audio format could not be played by your browser. Try an MP3 or WAV file.",
                "error"
            );
        };
    }

    function writeAscii(view, offset, text) {
        for (let i = 0; i < text.length; i++) {
            view.setUint8(offset + i, text.charCodeAt(i));
        }
    }

    function audioBufferToWav(buffer, startSeconds, endSeconds) {
        const sampleRate = buffer.sampleRate;
        const channelCount = buffer.numberOfChannels;

        const startSample = Math.floor(startSeconds * sampleRate);
        const endSample = Math.min(
            buffer.length,
            Math.floor(endSeconds * sampleRate)
        );

        const sampleCount = endSample - startSample;

        if (sampleCount <= 0) {
            throw new Error("The selected audio section is too short.");
        }

        const bytesPerSample = 2;
        const blockAlign = channelCount * bytesPerSample;
        const dataSize = sampleCount * blockAlign;

        const wavBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(wavBuffer);

        writeAscii(view, 0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeAscii(view, 8, "WAVE");
        writeAscii(view, 12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeAscii(view, 36, "data");
        view.setUint32(40, dataSize, true);

        let offset = 44;

        for (let i = 0; i < sampleCount; i++) {
            for (let channel = 0; channel < channelCount; channel++) {
                const sample = buffer.getChannelData(channel)[startSample + i];

                const clampedSample = Math.max(-1, Math.min(1, sample));

                const pcmValue = clampedSample < 0
                    ? clampedSample * 32768
                    : clampedSample * 32767;

                view.setInt16(offset, pcmValue, true);
                offset += bytesPerSample;
            }
        }

        return new Blob([wavBuffer], { type: "audio/wav" });
    }

    function downloadBlob(blob, filename) {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = filename;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
        }, 60000);
    }

    async function cutAndDownload() {
        if (isProcessing) {
            return;
        }

        if (!currentFile) {
            setStatus("Please upload an audio file first.", "error");
            return;
        }

        const range = getTrimRange();

        if (range.error) {
            setStatus(range.error, "error");
            return;
        }

        isProcessing = true;
        cutButton.disabled = true;
        cutButton.textContent = "Processing audio...";

        let audioContext = null;

        try {
            setStatus("Processing your audio. Please wait...");

            const fileBuffer = await currentFile.arrayBuffer();

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error(
                    "Your browser does not support audio processing. Please use an updated browser."
                );
            }

            audioContext = new AudioContextClass();

            const decodedBuffer = await audioContext.decodeAudioData(fileBuffer);

            const safeEnd = Math.min(range.end, decodedBuffer.duration);

            if (range.start >= safeEnd) {
                throw new Error("The selected audio range is invalid.");
            }

            const wavBlob = audioBufferToWav(
                decodedBuffer,
                range.start,
                safeEnd
            );

            const originalName = currentFile.name.replace(/\.[^.]+$/, "");
            const safeName = originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
            const outputName = `${safeName || "trimmed-audio"}-trimmed.wav`;

            downloadBlob(wavBlob, outputName);

            setStatus(
                `Success! Your trimmed audio has been downloaded as ${outputName}.`,
                "success"
            );
        } catch (error) {
            console.error("Audio cutting error:", error);

            setStatus(
                error.message ||
                "Something went wrong while processing the audio. Try an MP3 or WAV file.",
                "error"
            );
        } finally {
            if (audioContext && audioContext.state !== "closed") {
                try {
                    await audioContext.close();
                } catch (error) {
                    console.warn("Audio context cleanup:", error);
                }
            }

            isProcessing = false;
            cutButton.disabled = false;
            cutButton.textContent = "✂️ Cut & Download";
        }
    }

    function resetEditor() {
        if (isProcessing) {
            setStatus("Please wait until audio processing finishes.");
            return;
        }

        clearCurrentAudio();

        audioFile.value = "";
        startTime.value = "0";
        endTime.value = "0";

        fileName.textContent = "Your audio file";
        fileSize.textContent = "Ready to edit";
        selectedDuration.textContent = "0:00";

        editor.classList.remove("active");

        setStatus("Upload an audio file to get started.");
    }

    chooseButton.addEventListener("click", () => {
        audioFile.click();
    });

    audioFile.addEventListener("change", (event) => {
        const file = event.target.files && event.target.files[0];

        if (file) {
            loadAudio(file);
        }
    });

    startTime.addEventListener("input", updateSelectedDuration);
    endTime.addEventListener("input", updateSelectedDuration);

    cutButton.addEventListener("click", cutAndDownload);
    resetButton.addEventListener("click", resetEditor);

    uploadBox.addEventListener("dragover", (event) => {
        event.preventDefault();
        uploadBox.classList.add("drag-over");
    });

    uploadBox.addEventListener("dragleave", (event) => {
        if (!uploadBox.contains(event.relatedTarget)) {
            uploadBox.classList.remove("drag-over");
        }
    });

    uploadBox.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadBox.classList.remove("drag-over");

        const file = event.dataTransfer.files[0];

        if (file) {
            loadAudio(file);
        }
    });

    setStatus("Upload an audio file to get started.");
});
