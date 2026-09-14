const BOARD_LOG_KEY = "web3_quiz_board_moderation_log_v1";
const BOARD_LOG_EVENT = "board-moderation-log-updated";
const MAX_LOGS = 300;

function readBoardLogs() {
    try {
        const raw = localStorage.getItem(BOARD_LOG_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read board logs", error);
        return [];
    }
}

function emitBoardLogUpdate() {
    window.dispatchEvent(new Event(BOARD_LOG_EVENT));
}

function saveBoardLogs(logs) {
    localStorage.setItem(BOARD_LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
    emitBoardLogUpdate();
}

function getBoardLogs() {
    return readBoardLogs();
}

function appendBoardLog(entry) {
    const logs = readBoardLogs();
    const nextLogs = [{
        id: entry.id || `board_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: entry.createdAt || new Date().toISOString(),
        type: entry.type || "normal",
        messageKind: entry.messageKind || "comment",
        user: entry.user || "",
        text: entry.text || "",
        amount: Number(entry.amount || 0),
        isAnonymous: Boolean(entry.isAnonymous),
        likeCount: Number(entry.likeCount || 0),
        status: entry.status || "visible",
        reason: entry.reason || "",
        categories: Array.isArray(entry.categories) ? entry.categories : [],
    }, ...logs].slice(0, MAX_LOGS);

    saveBoardLogs(nextLogs);
}

function upsertBoardLog(entry) {
    const logs = readBoardLogs();
    const nextEntry = {
        id: entry.id || `board_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: entry.createdAt || new Date().toISOString(),
        type: entry.type || "normal",
        messageKind: entry.messageKind || "comment",
        user: entry.user || "",
        text: entry.text || "",
        amount: Number(entry.amount || 0),
        isAnonymous: Boolean(entry.isAnonymous),
        likeCount: Number(entry.likeCount || 0),
        status: entry.status || "visible",
        reason: entry.reason || "",
        categories: Array.isArray(entry.categories) ? entry.categories : [],
    };

    const index = logs.findIndex((item) => item.id === nextEntry.id);
    if (index === -1) {
        saveBoardLogs([nextEntry, ...logs]);
        return;
    }

    const clone = [...logs];
    clone[index] = {
        ...clone[index],
        ...nextEntry,
        categories: nextEntry.categories,
    };
    saveBoardLogs(clone);
}

function subscribeToBoardLogs(handler) {
    const onStorage = (event) => {
        if (event.key === BOARD_LOG_KEY) handler();
    };
    const onCustom = () => handler();

    window.addEventListener("storage", onStorage);
    window.addEventListener(BOARD_LOG_EVENT, onCustom);

    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(BOARD_LOG_EVENT, onCustom);
    };
}

export {
    appendBoardLog,
    getBoardLogs,
    subscribeToBoardLogs,
    upsertBoardLog,
};
