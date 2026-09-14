const STORAGE_KEY = "web3_quiz_batch_answer_queue_v1";
const UPDATE_EVENT = "web3-quiz-batch-answer-queue-updated";
const AUTO_SUBMIT_WINDOW_SECONDS = 60 * 60;
const AUTO_SUBMIT_RETRY_COOLDOWN_SECONDS = 2 * 60;

function normalizeAddress(value = "") {
    return String(value || "").trim().toLowerCase();
}

function buildBatchAnswerKey(quizId, sourceAddress = "") {
    return `${normalizeAddress(sourceAddress)}:${Number(quizId)}`;
}

function normalizeQueueItem(item = {}) {
    return {
        key: String(item.key || buildBatchAnswerKey(item.quizId, item.sourceAddress)),
        quizId: Number(item.quizId || 0),
        sourceAddress: String(item.sourceAddress || ""),
        title: String(item.title || ""),
        answer: String(item.answer || ""),
        answerType: Number(item.answerType || 0),
        savedAt: String(item.savedAt || new Date().toISOString()),
        deadlineEpoch: Number(item.deadlineEpoch || 0),
        autoSubmitAttemptCount: Number(item.autoSubmitAttemptCount || 0),
        lastAutoSubmitAttemptAt: String(item.lastAutoSubmitAttemptAt || ""),
        lastAutoSubmitStatus: String(item.lastAutoSubmitStatus || ""),
        lastAutoSubmitError: String(item.lastAutoSubmitError || ""),
    };
}

function readBatchAnswerQueue() {
    if (typeof localStorage === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.map(normalizeQueueItem) : [];
    } catch (error) {
        return [];
    }
}

function writeBatchAnswerQueue(nextQueue) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify((Array.isArray(nextQueue) ? nextQueue : []).map(normalizeQueueItem)));
    window.dispatchEvent(new Event(UPDATE_EVENT));
}

function getBatchAnswerQueue() {
    return readBatchAnswerQueue();
}

function saveBatchAnswerQueueItem(item) {
    const normalizedItem = normalizeQueueItem(item);
    const current = readBatchAnswerQueue();
    const next = current.filter((entry) => entry.key !== normalizedItem.key);
    next.push(normalizedItem);
    writeBatchAnswerQueue(next);
    return normalizedItem;
}

function updateBatchAnswerQueueItem(key, patch = {}, options = {}) {
    const current = readBatchAnswerQueue();
    const next = current.map((entry) => (
        entry.key === key
            ? normalizeQueueItem({
                ...entry,
                ...patch,
                key,
                savedAt: options.touchSavedAt === false ? entry.savedAt : new Date().toISOString(),
            })
            : entry
    ));
    writeBatchAnswerQueue(next);
    return next.find((entry) => entry.key === key) || null;
}

function getAutoSubmitReadyBatchAnswerQueue(nowEpoch = Math.floor(Date.now() / 1000)) {
    return readBatchAnswerQueue().filter((entry) => {
        const deadlineEpoch = Number(entry.deadlineEpoch || 0);
        if (!deadlineEpoch) return false;
        if (!String(entry.answer || "").trim()) return false;
        if (nowEpoch < deadlineEpoch - AUTO_SUBMIT_WINDOW_SECONDS) return false;
        if (nowEpoch >= deadlineEpoch) return false;

        const lastAttemptEpoch = entry.lastAutoSubmitAttemptAt
            ? Math.floor(new Date(entry.lastAutoSubmitAttemptAt).getTime() / 1000)
            : 0;
        if (lastAttemptEpoch && nowEpoch - lastAttemptEpoch < AUTO_SUBMIT_RETRY_COOLDOWN_SECONDS) {
            return false;
        }

        return true;
    });
}

function getEarliestBatchAnswerDeadlineEpoch() {
    const deadlines = readBatchAnswerQueue()
        .map((entry) => Number(entry.deadlineEpoch || 0))
        .filter((deadlineEpoch) => deadlineEpoch > 0);

    if (!deadlines.length) return 0;
    return Math.min(...deadlines);
}

function removeBatchAnswerQueueItem(key) {
    const current = readBatchAnswerQueue();
    const next = current.filter((entry) => entry.key !== key);
    writeBatchAnswerQueue(next);
}

function clearBatchAnswerQueue() {
    writeBatchAnswerQueue([]);
}

function subscribeBatchAnswerQueue(handler) {
    const onStorage = (event) => {
        if (event.key === STORAGE_KEY) {
            handler(getBatchAnswerQueue());
        }
    };
    const onUpdate = () => handler(getBatchAnswerQueue());
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATE_EVENT, onUpdate);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(UPDATE_EVENT, onUpdate);
    };
}

export {
    AUTO_SUBMIT_RETRY_COOLDOWN_SECONDS,
    AUTO_SUBMIT_WINDOW_SECONDS,
    buildBatchAnswerKey,
    clearBatchAnswerQueue,
    getEarliestBatchAnswerDeadlineEpoch,
    getAutoSubmitReadyBatchAnswerQueue,
    getBatchAnswerQueue,
    removeBatchAnswerQueueItem,
    saveBatchAnswerQueueItem,
    subscribeBatchAnswerQueue,
    updateBatchAnswerQueueItem,
};
