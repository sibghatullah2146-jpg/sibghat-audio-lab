
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const uploadBox = document.getElementById("uploadBox");
    const chooseButton = document.getElementById("chooseButton");
    const audioFile = document.getElementById("audioFile");
    const editor = document.getElementById("editor");
    const audioPlayer = document.getElementById("audioPlayer");

    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const startTime = document.getElementById("startTime");
    const endTime = document.getElementById("endTime");
    const selectedDuration = document.getElementById("selectedDuration");

    const cutButton = document.getElementById("cutButton");
    const resetButton = document.getElementById("resetButton");
    const statusMessage = document.getElementById("statusMessage");

    let currentFile = null;
    let audioUrl = null;
    let audioBuffer = null;

    function showStatus(message, type = "info") {
        statusMessage.textContent = message;
        statusMessage.dataset.type = type;
    }

    function formatSize(bytes) {
        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    function updateDuration() {
        const start = Number(startTime.value);
        const end = Number(endTime.value);

        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            selectedDuration.textContent =
                (end - start).toFixed(2).replace(/\.00$/, "") + " seconds";
        } else {
            selectedDuration.textContent = "0 seconds";
        }
    }

    function clearAudio() {
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();

        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            audioUrl = null;
        }

        currentFile = null;
        audioBuffer = null;
    }

    function resetEditor() {
        clearAudio();
        audioFile.value = "";
        fileName.textContent = "Audio File";
        fileSize.textContent = "0 MB";
        startTime.value = "0";
        endTime.value = "0";
        editor.classList.remove("active");
        updateDuration();
        showStatus("Upload an audio file to get started.");
    }

    async function loadAudio(file) {
        if (!file) return;

        if (!file.type.startsWith("audio/")) {
            showStatus("Please choose a valid audio file.", "error");
            return;
        }

        clearAudio();
        currentFile = file;
        audioUrl = URL.createObjectURL(file);

        audioPlayer.src = audioUrl;
        fileName.textContent = file.name;
        fileSize.textContent = formatSize(file.size);
        editor.classList.add("active");
        showStatus("Loading audio...");

        audioPlayer.onloadedmetadata = () => {
            const duration = audioPlayer.duration;

            if (!Number.isFinite(duration)) {
                showStatus("Could not read this audio file's duration.", "error");
                return;
            }

            startTime.value = "0";
            endTime.value = duration.toFixed(2);
            startTime.max = duration;
            endTime.max = duration;
            updateDuration();
            showStatus("Audio loaded successfully.", "success");
        };

        audioPlayer.onerror = () => {
            showStatus("This audio format could not be played by your browser.", "error");
        };
    }

    chooseButton.addEventListener("click", () => audioFile.click());

    audioFile.addEventListener("change", () => {
        loadAudio(audioFile.files[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadBox.classList.add("drag-over");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadBox.classList.remove("drag-over");
        });
    });

    uploadBox.addEventListener("drop", (event) => {
        const file = event.dataTransfer.files[0];
        if (file) loadAudio(file);
    });

    startTime.addEventListener("input", updateDuration);
    endTime.addEventListener("input", updateDuration);

    cutButton.addEventListener("click", async () => {
        if (!currentFile) {
            showStatus("Please upload an audio file first.", "error");
            return;
        }

        const start = Number(startTime.value);
        const end = Number(endTime.value);
        const duration = audioPlayer.duration;

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            start < 0 ||
            end <= start ||
            end > duration
        ) {
            showStatus("Enter a valid start and end time.", "error");
            return;
        }

        cutButton.disabled = true;
        showStatus("Preparing your trimmed audio...");

        try {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error("Your browser does not support audio processing.");
            }

            const context = new AudioContextClass();

            try {
                const bytes = await currentFile.arrayBuffer();
                audioBuffer = await context.decodeAudioData(bytes);

                const sampleRate = audioBuffer.sampleRate;
                const firstSample = Math.floor(start * sampleRate);
                const lastSample = Math.min(
                    Math.floor(end * sampleRate),
                    audioBuffer.length
                );
                const frameCount = lastSample - firstSample;

                if (frameCount <= 0) {
                    throw new Error("The selected audio range is empty.");
                }

                const channels = audioBuffer.numberOfChannels;
                const pcmData = [];

                for (let channel = 0; channel < channels; channel++) {
                    pcmData.push(
                        audioBuffer.getChannelData(channel).slice(
                            firstSample,
                            lastSample
                        )
                    );
                }

                const wavBlob = createWavBlob(
                    pcmData,
                    sampleRate,
                    channels
                );

                const downloadUrl = URL.createObjectURL(wavBlob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = "trimmed-audio.wav";
                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

                showStatus("Trimmed audio downloaded as a WAV file.", "success");
            } finally {
                await context.close();
            }
        } catch (error) {
            showStatus(
                error.message ||
                "Could not trim this file. Try another audio format.",
                "error"
            );
        } finally {
            cutButton.disabled = false;
        }
    });

    function createWavBlob(channelsData, sampleRate, channels) {
        const frames = channelsData[0].length;
        const bytesPerSample = 2;
        const blockAlign = channels * bytesPerSample;
        const dataSize = frames * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        function writeText(offset, text) {
            for (let i = 0; i < text.length; i++) {
                view.setUint8(offset + i, text.charCodeAt(i));
            }
        }

        writeText(0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeText(8, "WAVE");
        writeText(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeText(36, "data");
        view.setUint32(40, dataSize, true);

        let offset = 44;

        for (let frame = 0; frame < frames; frame++) {
            for (let channel = 0; channel < channels; channel++) {
                const sample = Math.max(
                    -1,
                    Math.min(1, channelsData[channel][frame])
                );

                const value = sample < 0
                    ? sample * 32768
                    : sample * 32767;

                view.setInt16(offset, value, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: "audio/wav" });
    }

    resetButton.addEventListener("click", resetEditor);

    resetEditor();
});

