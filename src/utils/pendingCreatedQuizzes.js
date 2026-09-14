/* global BigInt */
import { quiz_address } from "../contract/config";

const STORAGE_KEY = "web3_pending_created_quizzes_v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const UPDATED_EVENT = "pending-created-quizzes-updated";

function normalizeAddress(value = "") {
    return String(value || "").trim().toLowerCase();
}

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPendingQuizKey(quizId, sourceAddress = quiz_address) {
    return `${normalizeAddress(sourceAddress || quiz_address)}:${normalizeNumber(quizId, -1)}`;
}

function readStorage() {
    if (typeof localStorage === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        console.error("Failed to read pending created quizzes", error);
        return {};
    }
}

function writeStorage(nextMap) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(UPDATED_EVENT));
    }
}

function normalizePendingQuiz(entry = {}) {
    const quizId = normalizeNumber(entry.quizId, -1);
    const sourceAddress = String(entry.sourceAddress || quiz_address);
    if (quizId < 0) return null;

    return {
        quizId,
        sourceAddress,
        title: String(entry.title || ""),
        explanation: String(entry.explanation || ""),
        thumbnail_url: String(entry.thumbnail_url || ""),
        startTime: normalizeNumber(entry.startTime, 0),
        deadline: normalizeNumber(entry.deadline, 0),
        rewardWei: String(entry.rewardWei || "0"),
        respondentCount: normalizeNumber(entry.respondentCount, 0),
        respondentLimit: normalizeNumber(entry.respondentLimit, 0),
        status: normalizeNumber(entry.status, 0),
        isPayment: Boolean(entry.isPayment),
        txHash: String(entry.txHash || ""),
        createdAt: String(entry.createdAt || new Date().toISOString()),
    };
}

function pruneExpiredEntries(map) {
    const now = Date.now();
    const next = {};

    Object.entries(map || {}).forEach(([key, value]) => {
        const createdAtMs = new Date(value?.createdAt || 0).getTime();
        if (Number.isFinite(createdAtMs) && now - createdAtMs <= MAX_AGE_MS) {
            next[key] = value;
        }
    });

    return next;
}

function getPendingCreatedQuizMap() {
    const next = pruneExpiredEntries(readStorage());
    writeStorage(next);
    return next;
}

function getPendingCreatedQuizzes() {
    return Object.values(getPendingCreatedQuizMap()).sort((left, right) => {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

function savePendingCreatedQuiz(entry) {
    const normalized = normalizePendingQuiz(entry);
    if (!normalized) return null;

    const current = getPendingCreatedQuizMap();
    current[buildPendingQuizKey(normalized.quizId, normalized.sourceAddress)] = normalized;
    writeStorage(current);
    return normalized;
}

function removePendingCreatedQuiz(quizId, sourceAddress = quiz_address) {
    const current = getPendingCreatedQuizMap();
    delete current[buildPendingQuizKey(quizId, sourceAddress)];
    writeStorage(current);
}

function clearPendingCreatedQuizzes() {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}

function isResolvedQuiz(quiz) {
    if (!Array.isArray(quiz)) return false;
    const title = String(quiz?.[2] || "");
    const owner = String(quiz?.[1] || "");
    const startTime = Number(quiz?.[5] || 0);
    return Boolean(title || owner || startTime);
}

function pruneResolvedPendingCreatedQuizzes(quizList = []) {
    const current = getPendingCreatedQuizMap();
    let changed = false;

    quizList.forEach((quiz) => {
        if (!isResolvedQuiz(quiz)) return;
        const key = buildPendingQuizKey(quiz?.[0], quiz?.sourceAddress || quiz?.[12] || quiz_address);
        if (current[key]) {
            delete current[key];
            changed = true;
        }
    });

    if (changed) {
        writeStorage(current);
    }
}

function toPendingQuizSimple(entry) {
    const normalized = normalizePendingQuiz(entry);
    if (!normalized) return null;

    const reward = BigInt(normalized.rewardWei || "0");
    const quiz = [
        normalized.quizId,
        "",
        normalized.title || "作成直後の問題",
        normalized.explanation,
        normalized.thumbnail_url,
        normalized.startTime,
        normalized.deadline,
        reward,
        normalized.respondentCount,
        normalized.respondentLimit,
        normalized.status,
        normalized.isPayment,
    ];
    quiz.sourceAddress = normalized.sourceAddress;
    quiz.pendingCreated = true;
    quiz.pendingTxHash = normalized.txHash;
    return quiz;
}

function subscribePendingCreatedQuizzes(handler) {
    if (typeof window === "undefined") return () => {};
    const onStorage = (event) => {
        if (event.key === STORAGE_KEY) {
            handler();
        }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATED_EVENT, handler);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(UPDATED_EVENT, handler);
    };
}

export {
    buildPendingQuizKey,
    clearPendingCreatedQuizzes,
    getPendingCreatedQuizzes,
    pruneResolvedPendingCreatedQuizzes,
    removePendingCreatedQuiz,
    savePendingCreatedQuiz,
    subscribePendingCreatedQuizzes,
    toPendingQuizSimple,
};
