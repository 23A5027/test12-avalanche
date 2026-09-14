const LIVE_STATE_KEY = "web3_quiz_live_broadcast_state_v1";
const LIVE_HISTORY_KEY = "web3_quiz_live_broadcast_history_v1";
const MAX_HISTORY = 200;
const STALE_MS = 15000;

function readJson(key, fallbackValue) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallbackValue;
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Failed to read ${key}`, error);
        return fallbackValue;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function isBroadcastActive(state) {
    if (!state || !state.isActive) return false;
    const heartbeatAt = Number(new Date(state.heartbeatAt || state.startedAt || 0).getTime());
    if (!heartbeatAt) return false;
    return Date.now() - heartbeatAt <= STALE_MS;
}

function getLiveBroadcastState() {
    const state = readJson(LIVE_STATE_KEY, null);
    if (!isBroadcastActive(state)) {
        return null;
    }
    return state;
}

function setLiveBroadcastState(state) {
    writeJson(LIVE_STATE_KEY, state);
}

function clearLiveBroadcastState() {
    localStorage.removeItem(LIVE_STATE_KEY);
}

function getLiveBroadcastHistory() {
    return readJson(LIVE_HISTORY_KEY, []);
}

function appendLiveBroadcastHistory(entry) {
    const history = getLiveBroadcastHistory();
    history.unshift(entry);
    writeJson(LIVE_HISTORY_KEY, history.slice(0, MAX_HISTORY));
    return entry;
}

function subscribeToLiveBroadcast(callback) {
    const handler = (event) => {
        if (event.key === LIVE_STATE_KEY || event.key === LIVE_HISTORY_KEY) {
            callback();
        }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
}

export {
    appendLiveBroadcastHistory,
    clearLiveBroadcastState,
    getLiveBroadcastHistory,
    getLiveBroadcastState,
    isBroadcastActive,
    setLiveBroadcastState,
    subscribeToLiveBroadcast,
};
