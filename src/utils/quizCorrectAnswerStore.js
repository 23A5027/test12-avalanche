import { quiz_address } from "../contract/config";

const CORRECT_ANSWER_STORAGE_KEY = "web3_quiz_registered_correct_answers_v2";
const LEGACY_CORRECT_ANSWER_STORAGE_KEY = "web3_quiz_registered_correct_answers_v1";

function readCorrectAnswerMap() {
    try {
        const raw = localStorage.getItem(CORRECT_ANSWER_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeCorrectAnswerMap(map) {
    localStorage.setItem(CORRECT_ANSWER_STORAGE_KEY, JSON.stringify(map));
}

function normalizeQuizId(quizId) {
    return String(Number(quizId));
}

function normalizeContractAddress(contractAddress = quiz_address) {
    return String(contractAddress || "").toLowerCase();
}

function readLegacyCorrectAnswerMap() {
    try {
        const raw = localStorage.getItem(LEGACY_CORRECT_ANSWER_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getScopedCorrectAnswerMap(contractAddress = quiz_address) {
    const contractKey = normalizeContractAddress(contractAddress);
    const map = readCorrectAnswerMap();
    const scopedMap = map[contractKey];
    return scopedMap && typeof scopedMap === "object" && !Array.isArray(scopedMap) ? scopedMap : {};
}

function setRegisteredCorrectAnswer(quizId, correctAnswer, contractAddress = quiz_address) {
    const normalizedQuizId = normalizeQuizId(quizId);
    if (!normalizedQuizId || normalizedQuizId === "NaN") return;

    const contractKey = normalizeContractAddress(contractAddress);
    const map = readCorrectAnswerMap();
    const scopedMap = getScopedCorrectAnswerMap(contractKey);
    scopedMap[normalizedQuizId] = String(correctAnswer || "");
    map[contractKey] = scopedMap;
    writeCorrectAnswerMap(map);
}

function getRegisteredCorrectAnswer(quizId, contractAddress = quiz_address) {
    const normalizedQuizId = normalizeQuizId(quizId);
    if (!normalizedQuizId || normalizedQuizId === "NaN") return "";

    const scopedMap = getScopedCorrectAnswerMap(contractAddress);
    if (scopedMap[normalizedQuizId]) {
        return String(scopedMap[normalizedQuizId] || "");
    }

    const legacyMap = readLegacyCorrectAnswerMap();
    return String(legacyMap[normalizedQuizId] || "");
}

function buildQuizStorageKey(quizId, contractAddress = quiz_address) {
    return `quiz_${String(contractAddress || "").toLowerCase()}_${String(Number(quizId))}_answer`;
}

export {
    buildQuizStorageKey,
    getRegisteredCorrectAnswer,
    setRegisteredCorrectAnswer,
};
