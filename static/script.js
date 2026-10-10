const inputText = document.getElementById("inputText");
const outputText = document.getElementById("outputText");
const sourceLang = document.getElementById("sourceLang");
const targetLang = document.getElementById("targetLang");
const translateBtn = document.getElementById("translateBtn");
const btnText = document.getElementById("btnText");
const statusText = document.getElementById("status");
const errorMessage = document.getElementById("errorMessage");
const charCount = document.getElementById("charCount");
const copyBtn = document.getElementById("copyBtn");
const speakBtn = document.getElementById("speakBtn");
const clearBtn = document.getElementById("clearBtn");
const swapBtn = document.getElementById("swapBtn");
const greetWord = document.getElementById("greetWord");
const greetLang = document.getElementById("greetLang");
const shortcutKey = document.getElementById("shortcutKey");

const workbench = document.querySelector(".workbench");
const inputPanel = inputText.closest(".panel");

const PLACEHOLDER_TEXT = "Your translation will appear here...";
const MAX_CHARACTERS = Number(inputText.maxLength) || 3000;

let activeRequest = null;
let copyTimer = null;
let voices = [];

const languageCodes = {
    en: "en-US",
    kn: "kn-IN",
    hi: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    ml: "ml-IN",
    fr: "fr-FR",
    es: "es-ES",
    de: "de-DE",
    it: "it-IT",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh-CN",
    ar: "ar-SA",
    pt: "pt-PT",
    ru: "ru-RU"
};

const greetings = [
    ["en", "Hello"],
    ["kn", "ನಮಸ್ಕಾರ"],
    ["hi", "नमस्ते"],
    ["fr", "Bonjour"],
    ["ja", "こんにちは"],
    ["ta", "வணக்கம்"],
    ["es", "Hola"],
    ["ar", "مرحبا"],
    ["de", "Hallo"],
    ["te", "నమస్కారం"],
    ["ko", "안녕하세요"],
    ["ml", "നമസ്കാരം"],
    ["it", "Ciao"],
    ["zh", "你好"],
    ["pt", "Olá"],
    ["ru", "Привет"]
];

/* ---------- Helpers ---------- */

function languageName(code) {
    const option = sourceLang.querySelector(`option[value="${code}"]`);
    return option ? option.textContent.trim() : "";
}

function updateCharCount() {
    const length = inputText.value.length;

    charCount.textContent = `${length} / ${MAX_CHARACTERS}`;
    charCount.classList.toggle("is-near", length >= MAX_CHARACTERS * 0.9);
    inputPanel.classList.toggle("has-text", length > 0);
}

function setError(message = "") {
    errorMessage.textContent = message;
}

function setStatus(message) {
    statusText.textContent = message;
}

function setOutput(text = "") {
    const hasTranslation = Boolean(text);

    outputText.textContent = hasTranslation ? text : PLACEHOLDER_TEXT;
    outputText.classList.toggle("placeholder", !hasTranslation);

    copyBtn.disabled = !hasTranslation;
    speakBtn.disabled = !hasTranslation;

    workbench.classList.toggle("is-done", hasTranslation);
}

function cancelActiveRequest() {
    if (activeRequest) {
        activeRequest.abort();
        activeRequest = null;
    }
}

function stopSpeaking() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
    speakBtn.classList.remove("is-speaking");
}

function resetTranslation(status = "Ready to translate") {
    cancelActiveRequest();
    stopSpeaking();
    setOutput();
    setStatus(status);
    setError("");
}

function setLoading(isLoading) {
    translateBtn.disabled = isLoading;
    translateBtn.classList.toggle("is-loading", isLoading);
    workbench.classList.toggle("is-loading", isLoading);
    btnText.textContent = isLoading ? "Translating..." : "Translate";
}

/* ---------- Translate ---------- */

async function translate() {
    const text = inputText.value.trim();

    setError("");

    if (!text) {
        setError("Enter some text to translate, then try again.");
        inputText.focus();
        return;
    }

    if (sourceLang.value === targetLang.value) {
        setError("Choose two different languages to translate between.");
        return;
    }

    cancelActiveRequest();
    activeRequest = new AbortController();

    setLoading(true);
    setStatus("Translating...");

    try {
        const response = await fetch("/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: activeRequest.signal,
            body: JSON.stringify({
                text,
                source_lang: sourceLang.value,
                target_lang: targetLang.value
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Translation failed. Please try again.");
        }

        if (!data.translated_text) {
            throw new Error("No translation was returned. Please try again.");
        }

        setOutput(data.translated_text);
        setStatus("Translation complete");
    } catch (error) {
        if (error.name !== "AbortError") {
            setError(error.message || "Something went wrong. Please try again.");
            setStatus("Translation unsuccessful");
        }
    } finally {
        activeRequest = null;
        setLoading(false);
    }
}

/* ---------- Copy ---------- */

async function copyTranslation() {
    const text = outputText.textContent;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const temporaryTextArea = document.createElement("textarea");
            temporaryTextArea.value = text;
            temporaryTextArea.style.position = "fixed";
            temporaryTextArea.style.opacity = "0";
            document.body.appendChild(temporaryTextArea);
            temporaryTextArea.select();

            const copied = document.execCommand("copy");
            temporaryTextArea.remove();

            if (!copied) {
                throw new Error("Copy failed.");
            }
        }

        setError("");
        setStatus("Copied to clipboard");

        copyBtn.classList.add("done");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
            copyBtn.classList.remove("done");
            setStatus("Translation complete");
        }, 1600);
    } catch {
        setError("Could not copy automatically. Select the text and copy it manually.");
    }
}

/* ---------- Speak ---------- */

function loadVoices() {
    if ("speechSynthesis" in window) {
        voices = window.speechSynthesis.getVoices();
    }
}

if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
}

function findVoice(code) {
    const full = (languageCodes[code] || code).toLowerCase();
    const short = code.toLowerCase();
    const normalize = (voice) => voice.lang.toLowerCase().replace("_", "-");

    return (
        voices.find((voice) => normalize(voice) === full) ||
        voices.find((voice) => normalize(voice).startsWith(short))
    );
}

function speakTranslation() {
    if (!("speechSynthesis" in window)) {
        setError("Speech playback is not supported by this browser.");
        return;
    }

    const text = outputText.textContent.trim();

    if (!text || outputText.classList.contains("placeholder")) {
        return;
    }

    if (!voices.length) {
        loadVoices();
    }

    const voice = findVoice(targetLang.value);

    if (voices.length && !voice) {
        setError(
            `No ${languageName(targetLang.value)} voice is installed on this device. ` +
            "Try Microsoft Edge, which includes voices for most Indian languages."
        );
        return;
    }

    setError("");
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice ? voice.lang : (languageCodes[targetLang.value] || targetLang.value);

    if (voice) {
        utterance.voice = voice;
    }

    utterance.onstart = () => {
        speakBtn.classList.add("is-speaking");
        setStatus("Playing translation...");
    };
    utterance.onend = () => {
        speakBtn.classList.remove("is-speaking");
        setStatus("Translation complete");
    };
    utterance.onerror = (event) => {
        speakBtn.classList.remove("is-speaking");
        if (event.error !== "canceled" && event.error !== "interrupted") {
            setError("Speech playback failed for this language. Try a different browser.");
        }
        setStatus("Translation complete");
    };

    // A short delay avoids a Chrome bug where speak() right after cancel() is ignored.
    setTimeout(() => window.speechSynthesis.speak(utterance), 100);
}

/* ---------- Hero greeting ---------- */

function startGreetings() {
    const available = greetings.filter(([code]) => languageName(code));

    if (!greetWord || available.length < 2) {
        return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    let index = 0;

    setInterval(() => {
        index = (index + 1) % available.length;
        const [code, word] = available[index];

        greetWord.classList.add("is-leaving");

        setTimeout(() => {
            greetWord.classList.remove("is-leaving");
            greetWord.classList.add("is-entering");

            greetWord.textContent = word;
            greetLang.textContent = languageName(code);

            // Force a reflow so the entering position is applied before it animates to rest.
            void greetWord.offsetWidth;
            greetWord.classList.remove("is-entering");
        }, 260);
    }, 2800);
}

/* ---------- Events ---------- */

inputText.addEventListener("input", () => {
    updateCharCount();
    setError("");
});

inputText.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        translate();
    }
});

document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        sourceLang.value = "en";
        inputText.value = chip.dataset.text;
        updateCharCount();
        resetTranslation();
        inputText.focus();
    });
});
clearBtn.addEventListener("click", () => {
    inputText.value = "";
    updateCharCount();
    resetTranslation();
    inputText.focus();
});

swapBtn.addEventListener("click", () => {
    const previousSource = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = previousSource;

    swapBtn.classList.toggle("flipped");

    if (!outputText.classList.contains("placeholder")) {
        inputText.value = outputText.textContent;
        updateCharCount();
    }

    resetTranslation("Languages swapped");
});

sourceLang.addEventListener("change", () => resetTranslation("Language selection changed"));
targetLang.addEventListener("change", () => resetTranslation("Language selection changed"));

translateBtn.addEventListener("click", translate);
copyBtn.addEventListener("click", copyTranslation);
speakBtn.addEventListener("click", speakTranslation);

/* ---------- Init ---------- */

if (shortcutKey && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    shortcutKey.textContent = "⌘";
}

setOutput();
updateCharCount();
startGreetings();