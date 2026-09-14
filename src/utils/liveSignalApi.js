const DELETED_QUIZ_STORAGE_KEY = "web3_quiz_deleted_quizzes_v1";
const CREATED_QUIZ_STORAGE_KEY = "web3_quiz_created_quizzes_v1";
const DEFAULT_RENDER_HTTP_URL = "https://test12-live-signal.onrender.com";
const DEFAULT_RENDER_WS_URL = "wss://test12-live-signal.onrender.com";
const LIVE_SIGNAL_FETCH_TIMEOUT_MS = 1500;

function normalizeLiveSignalHttpUrl(rawUrl = "") {
    const configuredUrl = String(rawUrl || "").trim();
    if (!configuredUrl) return "";
    if (configuredUrl.startsWith("wss://")) return configuredUrl.replace("wss://", "https://");
    if (configuredUrl.startsWith("ws://")) return configuredUrl.replace("ws://", "http://");
    return configuredUrl.replace(/\/+$/, "");
}

function normalizeLiveSignalWsUrl(rawUrl = "") {
    const configuredUrl = String(rawUrl || "").trim();
    if (!configuredUrl) return "";
    if (configuredUrl.startsWith("https://")) return configuredUrl.replace("https://", "wss://");
    if (configuredUrl.startsWith("http://")) return configuredUrl.replace("http://", "ws://");
    return configuredUrl.replace(/\/+$/, "");
}

function isGithubPagesHost(hostname = "") {
    return /\.github\.io$/i.test(String(hostname || "").trim());
}

function getLiveSignalApiBaseUrl() {
    const configuredUrl = normalizeLiveSignalHttpUrl(process.env.REACT_APP_LIVE_SIGNAL_URL || "");
    if (configuredUrl) return configuredUrl;

    if (typeof window !== "undefined") {
        const hostname = window.location.hostname || "localhost";
        if (isGithubPagesHost(hostname)) {
            return DEFAULT_RENDER_HTTP_URL;
        }
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        return `${protocol}//${hostname}:3001`;
    }

    return DEFAULT_RENDER_HTTP_URL;
}

function getLiveSignalWebSocketUrl() {
    const configuredUrl = normalizeLiveSignalWsUrl(process.env.REACT_APP_LIVE_SIGNAL_URL || "");
    if (configuredUrl) return configuredUrl;

    if (typeof window !== "undefined") {
        const hostname = window.location.hostname || "localhost";
        if (isGithubPagesHost(hostname)) {
            return DEFAULT_RENDER_WS_URL;
        }
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${hostname}:3001`;
    }

    return DEFAULT_RENDER_WS_URL;
}

function normalizeDeletedQuizKey(quizKey = "") {
    const [sourceAddress = "", quizId = ""] = String(quizKey || "").split(":");
    return `${sourceAddress.toLowerCase()}:${quizId}`;
}

function normalizeDeletedQuizMap(rawMap = {}) {
    const normalized = {};
    Object.entries(rawMap || {}).forEach(([quizKey, value]) => {
        const normalizedKey = normalizeDeletedQuizKey(quizKey);
        if (!normalizedKey || normalizedKey === ":") return;
        normalized[normalizedKey] = {
            ...(value || {}),
            sourceAddress: String(value?.sourceAddress || normalizedKey.split(":")[0] || "").toLowerCase(),
            quizId: value?.quizId ?? Number(normalizedKey.split(":")[1]),
        };
    });
    return normalized;
}

function normalizeCreatedQuizKey(quizKey = "") {
    const [sourceAddress = "", quizId = ""] = String(quizKey || "").split(":");
    return `${sourceAddress.toLowerCase()}:${quizId}`;
}

function normalizeCreatedQuizMap(rawMap = {}) {
    const normalized = {};
    Object.entries(rawMap || {}).forEach(([quizKey, value]) => {
        const normalizedKey = normalizeCreatedQuizKey(quizKey);
        if (!normalizedKey || normalizedKey === ":") return;
        normalized[normalizedKey] = {
            ...(value || {}),
            sourceAddress: String(value?.sourceAddress || normalizedKey.split(":")[0] || "").toLowerCase(),
            quizId: value?.quizId ?? Number(normalizedKey.split(":")[1]),
        };
    });
    return normalized;
}

function readDeletedQuizCache() {
    try {
        if (typeof localStorage === "undefined") return {};
        const raw = localStorage.getItem(DELETED_QUIZ_STORAGE_KEY);
        return normalizeDeletedQuizMap(raw ? JSON.parse(raw) : {});
    } catch (error) {
        console.error("Failed to read deleted quiz cache", error);
        return {};
    }
}

function getDeletedQuizCacheSnapshot() {
    return readDeletedQuizCache();
}

function hasDeletedQuizCache() {
    return Object.keys(readDeletedQuizCache()).length > 0;
}

function writeDeletedQuizCache(nextMap = {}) {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(DELETED_QUIZ_STORAGE_KEY, JSON.stringify(normalizeDeletedQuizMap(nextMap)));
    } catch (error) {
        console.error("Failed to write deleted quiz cache", error);
    }
}

function readCreatedQuizCache() {
    try {
        if (typeof localStorage === "undefined") return {};
        const raw = localStorage.getItem(CREATED_QUIZ_STORAGE_KEY);
        return normalizeCreatedQuizMap(raw ? JSON.parse(raw) : {});
    } catch (error) {
        console.error("Failed to read created quiz cache", error);
        return {};
    }
}

function writeCreatedQuizCache(nextMap = {}) {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(CREATED_QUIZ_STORAGE_KEY, JSON.stringify(normalizeCreatedQuizMap(nextMap)));
    } catch (error) {
        console.error("Failed to write created quiz cache", error);
    }
}

function mergeDeletedQuizMaps(baseMap = {}, nextMap = {}) {
    return normalizeDeletedQuizMap({
        ...normalizeDeletedQuizMap(baseMap),
        ...normalizeDeletedQuizMap(nextMap),
    });
}

function mergeCreatedQuizMaps(baseMap = {}, nextMap = {}) {
    return normalizeCreatedQuizMap({
        ...normalizeCreatedQuizMap(baseMap),
        ...normalizeCreatedQuizMap(nextMap),
    });
}

function getPendingDeletedQuizMap(rawMap = {}) {
    const pendingMap = {};
    Object.entries(normalizeDeletedQuizMap(rawMap)).forEach(([quizKey, value]) => {
        if (value?.pendingSync) {
            pendingMap[quizKey] = value;
        }
    });
    return pendingMap;
}

function reconcileDeletedQuizMaps(serverMap = {}, localMap = {}) {
    const normalizedServerMap = normalizeDeletedQuizMap(serverMap);
    const normalizedLocalMap = normalizeDeletedQuizMap(localMap);
    const mergedMap = mergeDeletedQuizMaps(normalizedServerMap, normalizedLocalMap);

    Object.entries(normalizedLocalMap).forEach(([quizKey, value]) => {
        if (!normalizedServerMap[quizKey]) {
            mergedMap[quizKey] = {
                ...mergedMap[quizKey],
                ...value,
                pendingSync: true,
            };
        }
    });

    return mergedMap;
}

async function flushPendingDeletedQuizzes() {
    const cachedMap = readDeletedQuizCache();
    const pendingMap = getPendingDeletedQuizMap(cachedMap);
    const pendingEntries = Object.entries(pendingMap);
    if (!pendingEntries.length) {
        return cachedMap;
    }

    const nextMap = { ...cachedMap };
    await Promise.all(pendingEntries.map(async ([quizKey, value]) => {
        try {
            await fetchLiveSignalJson("/deleted-quizzes", {
                method: "POST",
                body: JSON.stringify({
                    quizKey,
                    payload: {
                        deletedAt: value?.deletedAt || new Date().toISOString(),
                        deletedBy: value?.deletedBy || "",
                        deletedByLabel: value?.deletedByLabel || "",
                        sourceAddress: value?.sourceAddress || "",
                        quizId: value?.quizId ?? Number(quizKey.split(":")[1]),
                    },
                }),
            });
            if (nextMap[quizKey]) {
                delete nextMap[quizKey].pendingSync;
            }
        } catch (error) {
            console.error("Failed to flush pending deleted quiz", error);
        }
    }));

    writeDeletedQuizCache(nextMap);
    return nextMap;
}

async function fetchLiveSignalJson(path, options = {}) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller
        ? window.setTimeout(() => controller.abort(), LIVE_SIGNAL_FETCH_TIMEOUT_MS)
        : null;

    let response;
    try {
        response = await fetch(`${getLiveSignalApiBaseUrl()}${path}`, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
            signal: options.signal || controller?.signal,
        });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error("live_signal_timeout");
        }
        throw error;
    } finally {
        if (timeout) {
            window.clearTimeout(timeout);
        }
    }

    if (!response.ok) {
        throw new Error(`live_signal_http_${response.status}`);
    }

    return await response.json();
}

async function getDeletedQuizzes() {
    const cachedMap = await flushPendingDeletedQuizzes();
    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes");
        const mergedMap = reconcileDeletedQuizMaps(response?.deletedQuizzes || {}, cachedMap);
        writeDeletedQuizCache(mergedMap);
        return await flushPendingDeletedQuizzes();
    } catch (error) {
        console.error("Failed to fetch deleted quizzes from server", error);
        return cachedMap;
    }
}

async function getDeletedQuizzesWithStatus() {
    const cachedMap = await flushPendingDeletedQuizzes();
    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes");
        const mergedMap = reconcileDeletedQuizMaps(response?.deletedQuizzes || {}, cachedMap);
        writeDeletedQuizCache(mergedMap);
        const stabilizedMap = await flushPendingDeletedQuizzes();
        return {
            deletedQuizzes: stabilizedMap,
            ready: true,
            fromServer: true,
        };
    } catch (error) {
        console.error("Failed to fetch deleted quizzes from server", error);
        return {
            deletedQuizzes: cachedMap,
            ready: true,
            fromServer: false,
            degraded: true,
        };
    }
}

async function saveDeletedQuiz(quizKey, payload = {}) {
    const normalizedKey = normalizeDeletedQuizKey(quizKey);
    const localMap = mergeDeletedQuizMaps(readDeletedQuizCache(), {
        [normalizedKey]: {
            ...payload,
            deletedAt: payload?.deletedAt || new Date().toISOString(),
            pendingSync: true,
        },
    });
    writeDeletedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                payload,
            }),
        });
        const mergedMap = mergeDeletedQuizMaps(response?.deletedQuizzes || {}, getPendingDeletedQuizMap(localMap));
        if (mergedMap[normalizedKey]) {
            delete mergedMap[normalizedKey].pendingSync;
        }
        writeDeletedQuizCache(mergedMap);
        return { ...response, deletedQuizzes: mergedMap };
    } catch (error) {
        console.error("Failed to save deleted quiz to server", error);
        return { ok: false, offline: true, deletedQuizzes: localMap };
    }
}

async function removeDeletedQuiz(quizKey) {
    const normalizedKey = normalizeDeletedQuizKey(quizKey);
    const localMap = readDeletedQuizCache();
    delete localMap[normalizedKey];
    writeDeletedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                remove: true,
            }),
        });
        const serverMap = mergeDeletedQuizMaps(response?.deletedQuizzes || {}, getPendingDeletedQuizMap(localMap));
        delete serverMap[normalizedKey];
        writeDeletedQuizCache(serverMap);
        return { ...response, deletedQuizzes: serverMap };
    } catch (error) {
        console.error("Failed to remove deleted quiz from server", error);
        return { ok: false, offline: true, deletedQuizzes: localMap };
    }
}

async function getCreatedQuizzes() {
    const cachedMap = readCreatedQuizCache();
    try {
        const response = await fetchLiveSignalJson("/created-quizzes");
        const mergedMap = mergeCreatedQuizMaps(response?.createdQuizzes || {}, cachedMap);
        writeCreatedQuizCache(mergedMap);
        return mergedMap;
    } catch (error) {
        console.error("Failed to fetch created quizzes from server", error);
        return cachedMap;
    }
}

async function saveCreatedQuiz(quizKey, payload = {}) {
    const normalizedKey = normalizeCreatedQuizKey(quizKey);
    const localMap = mergeCreatedQuizMaps(readCreatedQuizCache(), {
        [normalizedKey]: {
            ...payload,
            createdAt: payload?.createdAt || new Date().toISOString(),
        },
    });
    writeCreatedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/created-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                payload,
            }),
        });
        const mergedMap = mergeCreatedQuizMaps(response?.createdQuizzes || {}, localMap);
        writeCreatedQuizCache(mergedMap);
        return { ...response, createdQuizzes: mergedMap };
    } catch (error) {
        console.error("Failed to save created quiz to server", error);
        return { ok: false, offline: true, createdQuizzes: localMap };
    }
}

async function removeCreatedQuiz(quizKey) {
    const normalizedKey = normalizeCreatedQuizKey(quizKey);
    const localMap = readCreatedQuizCache();
    delete localMap[normalizedKey];
    writeCreatedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/created-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                remove: true,
            }),
        });
        const serverMap = mergeCreatedQuizMaps(response?.createdQuizzes || {}, localMap);
        delete serverMap[normalizedKey];
        writeCreatedQuizCache(serverMap);
        return { ...response, createdQuizzes: serverMap };
    } catch (error) {
        console.error("Failed to remove created quiz from server", error);
        return { ok: false, offline: true, createdQuizzes: localMap };
    }
}

export {
    getLiveSignalApiBaseUrl,
    getLiveSignalWebSocketUrl,
    fetchLiveSignalJson,
    getDeletedQuizCacheSnapshot,
    getDeletedQuizzesWithStatus,
    hasDeletedQuizCache,
    getCreatedQuizzes,
    getDeletedQuizzes,
    removeCreatedQuiz,
    saveDeletedQuiz,
    saveCreatedQuiz,
    removeDeletedQuiz,
    normalizeCreatedQuizKey,
    normalizeDeletedQuizKey,
};
