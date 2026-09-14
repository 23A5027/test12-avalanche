const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || process.env.LIVE_SIGNAL_PORT || 3001);
const HEARTBEAT_TIMEOUT_MS = 180 * 1000;
const MAX_REACTION_HISTORY = 20;
const BLOCKED_MESSAGE_PATTERNS = [/ばか/i, /あほ/i, /死ね/i, /殺す/i, /くそ/i, /fuck/i, /shit/i, /bitch/i, /(.)\1{7,}/];
const REACTION_KEYS = ["understood", "repeat", "slow", "fast"];
const STATE_FILE_PATH = path.join(__dirname, ".live-board-state.json");
const MAX_ACTIVITY_LOGS = 30000;
let tokenGrantLedger = {};
let rewardPayoutEntries = [];
let surveyRewardEntries = [];
let deletedQuizzes = {};
let pendingCreatedQuizzes = {};
let activityLogs = [];

function normalizeRewardPayoutEntry(entry = {}) {
    return {
        id: String(entry?.id || ""),
        quizId: Number(entry?.quizId || 0),
        sourceAddress: String(entry?.sourceAddress || "").toLowerCase(),
        quizTitle: String(entry?.quizTitle || ""),
        studentAddress: String(entry?.studentAddress || "").toLowerCase(),
        studentName: String(entry?.studentName || ""),
        studentId: String(entry?.studentId || ""),
        answerText: String(entry?.answerText || ""),
        resultState: String(entry?.resultState || ""),
        rewardTft: Number(entry?.rewardTft || 0),
        rewardWei: String(entry?.rewardWei || ""),
        txHash: String(entry?.txHash || ""),
        actorAddress: String(entry?.actorAddress || "").toLowerCase(),
        mode: String(entry?.mode || ""),
        contractTypeLabel: String(entry?.contractTypeLabel || ""),
        paidAt: entry?.paidAt || entry?.createdAt || new Date().toISOString(),
        confirmed: entry?.confirmed !== false,
    };
}

function normalizeRewardPayoutEntries(entries = []) {
    const deduped = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const normalized = normalizeRewardPayoutEntry(entry);
        if (!normalized.id || normalized.quizId == null || !normalized.studentAddress) return;
        deduped.set(normalized.id, normalized);
    });
    return Array.from(deduped.values()).sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));
}

function normalizeSurveyRewardEntry(entry = {}) {
    return {
        id: String(entry?.id || ""),
        address: String(entry?.address || "").toLowerCase(),
        campaignKey: String(entry?.campaignKey || "").toLowerCase(),
        campaignLabel: String(entry?.campaignLabel || ""),
        amount: Number(entry?.amount || 0),
        txHash: String(entry?.txHash || ""),
        createdAt: entry?.createdAt || entry?.grantedAt || new Date().toISOString(),
        type: String(entry?.type || (entry?.confirmed === false ? "pending" : "grant")),
        confirmed: entry?.confirmed !== false,
        actorAddress: String(entry?.actorAddress || "").toLowerCase(),
        source: String(entry?.source || ""),
        studentName: String(entry?.studentName || ""),
        studentId: String(entry?.studentId || ""),
    };
}

function normalizeSurveyRewardEntries(entries = []) {
    const deduped = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const normalized = normalizeSurveyRewardEntry(entry);
        if (!normalized.id || !normalized.address || !normalized.campaignKey) return;
        deduped.set(normalized.id, normalized);
    });
    return Array.from(deduped.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function normalizeActivityLogs(logs = []) {
    return (Array.isArray(logs) ? logs : [])
        .filter((entry) => entry && typeof entry === "object" && entry.id)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, MAX_ACTIVITY_LOGS);
}

function inferGrantHistoryType(source = "", isRemove = false) {
    if (isRemove) return "clear";
    if (String(source || "").includes("manual_mark")) return "manual_mark";
    return "grant";
}

function normalizeHistoryEntry(entry = {}) {
    return {
        type: entry?.type || inferGrantHistoryType(entry?.source, entry?.active === false),
        at: entry?.at || entry?.grantedAt || new Date().toISOString(),
        amount: entry?.amount ?? null,
        txHash: entry?.txHash || "",
        source: entry?.source || "",
        confirmed: entry?.confirmed !== false,
        active: entry?.active !== false,
    };
}

function normalizeGrantRecord(record = null) {
    if (!record || typeof record !== "object") return null;
    const history = Array.isArray(record.history) && record.history.length > 0
        ? record.history.map((entry) => normalizeHistoryEntry(entry))
        : [normalizeHistoryEntry(record)];

    return {
        grantedAt: record.grantedAt || history[history.length - 1]?.at || "",
        amount: record.amount ?? null,
        txHash: record.txHash || "",
        source: record.source || "",
        confirmed: record.confirmed !== false,
        active: record.active !== false,
        history,
    };
}

function normalizeQuizKey(quizKey = "") {
    const [sourceAddress = "", quizId = ""] = String(quizKey || "").split(":");
    return `${sourceAddress.toLowerCase()}:${quizId}`;
}

function normalizeDeletedQuizzes(rawMap = {}) {
    const normalized = {};
    Object.entries(rawMap || {}).forEach(([quizKey, value]) => {
        const normalizedKey = normalizeQuizKey(quizKey);
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

function normalizePendingCreatedQuizzes(rawMap = {}) {
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

function writeJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
        writeJson(res, 200, { ok: true });
        return;
    }

    if ((req.url === "/healthz" || req.url === "/health") && req.method === "GET") {
        writeJson(res, 200, {
            ok: true,
            service: "live-signal-server",
            uptimeSec: Math.floor(process.uptime()),
            clients: clients.size,
            hasCurrentBoardSession: Boolean(currentBoardSession),
            hasCurrentReactionSession: Boolean(currentReactionSession),
        });
        return;
    }

    if (req.url === "/token-grants" && req.method === "GET") {
        writeJson(res, 200, { ok: true, ledger: tokenGrantLedger });
        return;
    }

    if (req.url === "/deleted-quizzes" && req.method === "GET") {
        writeJson(res, 200, { ok: true, deletedQuizzes });
        return;
    }

    if (req.url === "/created-quizzes" && req.method === "GET") {
        writeJson(res, 200, { ok: true, createdQuizzes: pendingCreatedQuizzes });
        return;
    }

    if (req.url === "/activity-logs" && req.method === "GET") {
        writeJson(res, 200, { ok: true, logs: activityLogs });
        return;
    }

    if (req.url === "/reward-payouts" && req.method === "GET") {
        writeJson(res, 200, { ok: true, entries: rewardPayoutEntries });
        return;
    }

    if (req.url === "/survey-grants" && req.method === "GET") {
        writeJson(res, 200, { ok: true, entries: surveyRewardEntries });
        return;
    }

    if (req.url === "/token-grants" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const address = String(body?.address || "").toLowerCase();
                const assetKey = String(body?.assetKey || "").trim();
                if (!address || !assetKey) {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }

                if (body?.remove) {
                    const currentRecord = normalizeGrantRecord(tokenGrantLedger[address]?.[assetKey]);
                    if (!currentRecord) {
                        writeJson(res, 200, { ok: true, ledger: tokenGrantLedger });
                        return;
                    }
                    const nextEntry = normalizeHistoryEntry({
                        type: "clear",
                        at: body?.payload?.grantedAt || new Date().toISOString(),
                        amount: body?.payload?.amount ?? currentRecord.amount ?? null,
                        txHash: "",
                        source: body?.payload?.source || "manual_clear",
                        confirmed: true,
                        active: false,
                    });
                    tokenGrantLedger[address] = {
                        ...(tokenGrantLedger[address] || {}),
                        [assetKey]: {
                            grantedAt: nextEntry.at,
                            amount: currentRecord.amount ?? null,
                            txHash: currentRecord.txHash || "",
                            source: nextEntry.source,
                            confirmed: true,
                            active: false,
                            history: [...(currentRecord.history || []), nextEntry],
                        },
                    };
                    persistState();
                    writeJson(res, 200, { ok: true, ledger: tokenGrantLedger });
                    return;
                }

                const currentRecord = normalizeGrantRecord(tokenGrantLedger[address]?.[assetKey]);
                const nextEntry = normalizeHistoryEntry({
                    type: inferGrantHistoryType(body?.payload?.source, false),
                    at: body?.payload?.grantedAt || new Date().toISOString(),
                    amount: body?.payload?.amount ?? null,
                    txHash: body?.payload?.txHash || "",
                    source: body?.payload?.source || "",
                    confirmed: body?.payload?.confirmed !== false,
                    active: true,
                });
                tokenGrantLedger[address] = {
                    ...(tokenGrantLedger[address] || {}),
                    [assetKey]: {
                        grantedAt: nextEntry.at,
                        amount: nextEntry.amount,
                        txHash: nextEntry.txHash || currentRecord?.txHash || "",
                        source: nextEntry.source,
                        confirmed: nextEntry.confirmed,
                        active: true,
                        history: [...(currentRecord?.history || []), nextEntry],
                    },
                };
                persistState();
                writeJson(res, 200, { ok: true, ledger: tokenGrantLedger });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    if (req.url === "/deleted-quizzes" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const quizKey = normalizeQuizKey(body?.quizKey || "");
                if (!quizKey || quizKey === ":") {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }
                if (body?.remove) {
                    deletedQuizzes = normalizeDeletedQuizzes(deletedQuizzes);
                    delete deletedQuizzes[quizKey];
                    persistState();
                    writeJson(res, 200, { ok: true, deletedQuizzes });
                    return;
                }
                deletedQuizzes = normalizeDeletedQuizzes(deletedQuizzes);
                deletedQuizzes[quizKey] = {
                    deletedAt: body?.payload?.deletedAt || new Date().toISOString(),
                    deletedBy: body?.payload?.deletedBy || "",
                    deletedByLabel: body?.payload?.deletedByLabel || "",
                    sourceAddress: String(body?.payload?.sourceAddress || quizKey.split(":")[0] || "").toLowerCase(),
                    quizId: body?.payload?.quizId ?? null,
                };
                persistState();
                writeJson(res, 200, { ok: true, deletedQuizzes });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    if (req.url === "/created-quizzes" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const quizKey = normalizeCreatedQuizKey(body?.quizKey || "");
                if (!quizKey || quizKey === ":") {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }
                if (body?.remove) {
                    pendingCreatedQuizzes = normalizePendingCreatedQuizzes(pendingCreatedQuizzes);
                    delete pendingCreatedQuizzes[quizKey];
                    persistState();
                    writeJson(res, 200, { ok: true, createdQuizzes: pendingCreatedQuizzes });
                    return;
                }
                pendingCreatedQuizzes = normalizePendingCreatedQuizzes(pendingCreatedQuizzes);
                pendingCreatedQuizzes[quizKey] = {
                    createdAt: body?.payload?.createdAt || new Date().toISOString(),
                    txHash: body?.payload?.txHash || "",
                    title: body?.payload?.title || "",
                    explanation: body?.payload?.explanation || "",
                    thumbnail_url: body?.payload?.thumbnail_url || "",
                    startTime: body?.payload?.startTime ?? 0,
                    deadline: body?.payload?.deadline ?? 0,
                    rewardWei: body?.payload?.rewardWei || "0",
                    respondentCount: body?.payload?.respondentCount ?? 0,
                    respondentLimit: body?.payload?.respondentLimit ?? 0,
                    status: body?.payload?.status ?? 0,
                    isPayment: body?.payload?.isPayment === true,
                    sourceAddress: String(body?.payload?.sourceAddress || quizKey.split(":")[0] || "").toLowerCase(),
                    quizId: body?.payload?.quizId ?? null,
                };
                persistState();
                writeJson(res, 200, { ok: true, createdQuizzes: pendingCreatedQuizzes });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    if (req.url === "/activity-logs" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const entry = body?.entry;
                if (!entry?.id) {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }
                const nextLogs = normalizeActivityLogs([entry, ...activityLogs]);
                const deduped = [];
                const seen = new Set();
                for (const item of nextLogs) {
                    if (seen.has(item.id)) continue;
                    seen.add(item.id);
                    deduped.push(item);
                }
                activityLogs = normalizeActivityLogs(deduped);
                persistState();
                writeJson(res, 200, { ok: true, logs: activityLogs });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    if (req.url === "/reward-payouts" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const entries = normalizeRewardPayoutEntries(body?.entries);
                if (!entries.length) {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }
                rewardPayoutEntries = normalizeRewardPayoutEntries([...(rewardPayoutEntries || []), ...entries]);
                persistState();
                writeJson(res, 200, { ok: true, entries: rewardPayoutEntries });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    if (req.url === "/survey-grants" && req.method === "POST") {
        readRequestBody(req)
            .then((body) => {
                const entries = normalizeSurveyRewardEntries(body?.entries);
                if (!entries.length) {
                    writeJson(res, 400, { ok: false, error: "invalid_payload" });
                    return;
                }
                surveyRewardEntries = normalizeSurveyRewardEntries([...(surveyRewardEntries || []), ...entries]);
                persistState();
                writeJson(res, 200, { ok: true, entries: surveyRewardEntries });
            })
            .catch(() => {
                writeJson(res, 400, { ok: false, error: "invalid_json" });
            });
        return;
    }

    writeJson(res, 200, { ok: true, service: "live-signal-server" });
});

const wss = new WebSocket.Server({ server });

let nextClientId = 1;
const clients = new Map();
let activeBroadcast = null;
let pinnedNotice = null;
let reactionSessionHistory = [];
let boardSessionHistory = [];
let deletedBoardMessagesBySession = {};

function createDefaultReactions() {
    return {
        understood: 0,
        repeat: 0,
        slow: 0,
        fast: 0,
    };
}

function createReactionSession(label = "") {
    return {
        id: `reaction_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(label || "").trim() || `授業 ${reactionSessionHistory.length + 1}`,
        startedAt: new Date().toISOString(),
        endedAt: "",
        clientReactions: new Map(),
        reactionEvents: [],
        messages: [],
    };
}

let currentReactionSession = createReactionSession("現在の授業");

function createBoardSession(label = "") {
    return {
        id: `board_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(label || "").trim() || `共有コメント ${boardSessionHistory.length + 1}`,
        startedAt: new Date().toISOString(),
        endedAt: "",
        messages: [],
    };
}

let currentBoardSession = createBoardSession("現在の授業");

function serializeReactionSessionForStorage(session) {
    if (!session) return null;
    return {
        ...session,
        clientReactions: Array.from((session.clientReactions || new Map()).entries()),
        reactionEvents: Array.isArray(session.reactionEvents) ? session.reactionEvents : [],
        messages: Array.isArray(session.messages) ? session.messages : [],
    };
}

function reviveReactionSession(session, fallbackLabel = "現在の授業") {
    if (!session) return createReactionSession(fallbackLabel);
    return {
        id: session.id || `reaction_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(session.label || "").trim() || fallbackLabel,
        startedAt: session.startedAt || new Date().toISOString(),
        endedAt: session.endedAt || "",
        clientReactions: new Map(Array.isArray(session.clientReactions) ? session.clientReactions : []),
        reactionEvents: Array.isArray(session.reactionEvents) ? session.reactionEvents : [],
        messages: Array.isArray(session.messages) ? session.messages : [],
    };
}

function serializeBoardSessionForStorage(session) {
    if (!session) return null;
    return {
        ...session,
        messages: Array.isArray(session.messages)
            ? session.messages.map((message) => serializeBoardMessageForStorage(message))
            : [],
    };
}

function serializeBoardMessageForStorage(message) {
    if (!message) return null;
    return {
        ...message,
        likedBy: Array.from(message.likedBy || []),
    };
}

function reviveBoardMessage(message) {
    if (!message) return null;
    return {
        ...message,
        likedBy: new Set(Array.isArray(message.likedBy) ? message.likedBy : []),
    };
}

function reviveBoardSession(session, fallbackLabel = "現在の授業") {
    if (!session) return createBoardSession(fallbackLabel);
    return {
        id: session.id || `board_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(session.label || "").trim() || fallbackLabel,
        startedAt: session.startedAt || new Date().toISOString(),
        endedAt: session.endedAt || "",
        messages: Array.isArray(session.messages)
            ? session.messages.map((message) => reviveBoardMessage(message))
            : [],
    };
}

function persistState() {
    try {
        const payload = {
            pinnedNotice,
            reactionSessionHistory: reactionSessionHistory.map((session) => serializeReactionSessionForStorage(session)),
            boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSessionForStorage(session)),
            currentReactionSession: serializeReactionSessionForStorage(currentReactionSession),
            currentBoardSession: serializeBoardSessionForStorage(currentBoardSession),
            tokenGrantLedger,
            rewardPayoutEntries,
            surveyRewardEntries,
            deletedQuizzes,
            pendingCreatedQuizzes,
            activityLogs,
            deletedBoardMessagesBySession: Object.fromEntries(
                Object.entries(deletedBoardMessagesBySession).map(([sessionId, entries]) => [
                    sessionId,
                    (Array.isArray(entries) ? entries : []).map((entry) => ({
                        ...entry,
                        message: serializeBoardMessageForStorage(entry.message),
                    })),
                ])
            ),
        };
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
        console.error("Failed to persist live board state", error);
    }
}

function loadPersistedState() {
    try {
        if (!fs.existsSync(STATE_FILE_PATH)) return;
        const raw = fs.readFileSync(STATE_FILE_PATH, "utf8");
        if (!raw) return;
        const payload = JSON.parse(raw);
        pinnedNotice = payload?.pinnedNotice || null;
        reactionSessionHistory = Array.isArray(payload?.reactionSessionHistory)
            ? payload.reactionSessionHistory.map((session) => reviveReactionSession(session, "過去の授業"))
            : [];
        boardSessionHistory = Array.isArray(payload?.boardSessionHistory)
            ? payload.boardSessionHistory.map((session) => reviveBoardSession(session, "過去の授業"))
            : [];
        currentReactionSession = reviveReactionSession(payload?.currentReactionSession, "現在の授業");
        currentBoardSession = reviveBoardSession(payload?.currentBoardSession, "現在の授業");
        tokenGrantLedger = payload?.tokenGrantLedger && typeof payload.tokenGrantLedger === "object" ? payload.tokenGrantLedger : {};
        rewardPayoutEntries = normalizeRewardPayoutEntries(payload?.rewardPayoutEntries);
        surveyRewardEntries = normalizeSurveyRewardEntries(payload?.surveyRewardEntries);
        deletedQuizzes = normalizeDeletedQuizzes(payload?.deletedQuizzes && typeof payload.deletedQuizzes === "object" ? payload.deletedQuizzes : {});
        pendingCreatedQuizzes = normalizePendingCreatedQuizzes(payload?.pendingCreatedQuizzes && typeof payload.pendingCreatedQuizzes === "object" ? payload.pendingCreatedQuizzes : {});
        activityLogs = normalizeActivityLogs(payload?.activityLogs);
        deletedBoardMessagesBySession = Object.fromEntries(
            Object.entries(payload?.deletedBoardMessagesBySession || {}).map(([sessionId, entries]) => [
                String(sessionId),
                (Array.isArray(entries) ? entries : [])
                    .map((entry) => ({
                        ...entry,
                        message: reviveBoardMessage(entry.message),
                    }))
                    .filter((entry) => entry.message),
            ])
        );
    } catch (error) {
        console.error("Failed to load persisted live board state", error);
    }
}

function safeSend(ws, payload) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcast(payload, excludeClientId = null) {
    for (const [clientId, client] of clients.entries()) {
        if (clientId === excludeClientId) continue;
        safeSend(client.ws, payload);
    }
}

function getBroadcastSnapshot() {
    if (!activeBroadcast) return null;
    return {
        broadcasterId: activeBroadcast.broadcasterId,
        broadcasterAddress: activeBroadcast.broadcasterAddress,
        broadcasterName: activeBroadcast.broadcasterName,
        broadcasterRole: activeBroadcast.broadcasterRole,
        outputType: activeBroadcast.outputType,
        startedAt: activeBroadcast.startedAt,
        viewerCount: activeBroadcast.viewerIds.size,
    };
}

function getDisplayName(client) {
    if (!client) return "viewer";
    if (client.displayName) return client.displayName;
    if (client.address) {
        return `${client.address.slice(0, 6)}...${client.address.slice(-4)}`;
    }
    return client.role === "staff" ? "teacher" : "guest";
}

function moderateMessage(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
        return { blocked: true, reason: "empty" };
    }
    if (BLOCKED_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return { blocked: true, reason: "unsafe" };
    }
    if (/(https?:\/\/|www\.)/i.test(normalized)) {
        return { blocked: true, reason: "link" };
    }
    return { blocked: false, reason: "" };
}

function serializeBoardMessage(message) {
    return {
        id: message.id,
        text: message.text,
        amount: message.amount,
        chatType: message.chatType,
        timestamp: message.timestamp,
        user: message.user,
        messageKind: message.messageKind,
        isQuestion: message.isQuestion,
        isAnonymous: message.isAnonymous,
        likeCount: message.likedBy.size,
        senderAddress: message.senderAddress || "",
    };
}

function getReactionTotals(source = currentReactionSession?.reactionEvents) {
    const totals = createDefaultReactions();
    if (Array.isArray(source)) {
        for (const event of source) {
            if (REACTION_KEYS.includes(event?.reaction)) {
                totals[event.reaction] += 1;
            }
        }
        return totals;
    }

    for (const reaction of (source || new Map()).values()) {
        if (REACTION_KEYS.includes(reaction)) {
            totals[reaction] += 1;
        }
    }
    return totals;
}

function buildReactionTimeline(events = []) {
    const buckets = new Map();
    for (const event of Array.isArray(events) ? events : []) {
        if (!REACTION_KEYS.includes(event?.reaction)) continue;
        const iso = String(event.at || "");
        const bucketKey = iso ? iso.slice(0, 16) : "";
        if (!bucketKey) continue;
        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, {
                time: bucketKey,
                understood: 0,
                repeat: 0,
                slow: 0,
                fast: 0,
                total: 0,
            });
        }
        const bucket = buckets.get(bucketKey);
        bucket[event.reaction] += 1;
        bucket.total += 1;
    }
    return Array.from(buckets.values()).sort((left, right) => String(left.time).localeCompare(String(right.time)));
}

function deleteReactionTimelineBucket(bucketTime = "") {
    const normalizedBucketTime = String(bucketTime || "").slice(0, 16);
    if (!normalizedBucketTime || !currentReactionSession) return false;

    const beforeCount = Array.isArray(currentReactionSession.reactionEvents)
        ? currentReactionSession.reactionEvents.length
        : 0;

    currentReactionSession.reactionEvents = (currentReactionSession.reactionEvents || []).filter(
        (event) => String(event?.at || "").slice(0, 16) !== normalizedBucketTime
    );

    const changed = currentReactionSession.reactionEvents.length !== beforeCount;
    if (changed) {
        persistState();
    }
    return changed;
}

function serializeReactionSession(session, clientId = "") {
    if (!session) return null;
    return {
        id: session.id,
        label: session.label,
        startedAt: session.startedAt,
        endedAt: session.endedAt || "",
        reactions: getReactionTotals(session.reactionEvents),
        currentReaction: clientId ? (session.clientReactions.get(clientId) || "") : "",
        totalReactionCount: Array.isArray(session.reactionEvents) ? session.reactionEvents.length : 0,
        recentReactionEvents: Array.isArray(session.reactionEvents) ? session.reactionEvents.slice(-12) : [],
        reactionTimeline: buildReactionTimeline(session.reactionEvents),
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    };
}

function serializeBoardSession(session) {
    if (!session) return null;
    return {
        id: session.id,
        label: session.label,
        startedAt: session.startedAt,
        endedAt: session.endedAt || "",
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    };
}

function archiveCurrentReactionSession() {
    if (!currentReactionSession) return;
    reactionSessionHistory.unshift({
        ...currentReactionSession,
        endedAt: new Date().toISOString(),
    });
    if (reactionSessionHistory.length > MAX_REACTION_HISTORY) {
        reactionSessionHistory.splice(MAX_REACTION_HISTORY);
    }
    persistState();
}

function archiveCurrentBoardSession() {
    if (!currentBoardSession) return;
    boardSessionHistory.unshift({
        ...currentBoardSession,
        endedAt: new Date().toISOString(),
    });
    persistState();
}

function getBoardState(clientId = "") {
    return {
        messages: (currentBoardSession?.messages || []).map(serializeBoardMessage),
        pinnedNotice,
        reactionSession: serializeReactionSession(currentReactionSession, clientId),
        reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
        boardSession: serializeBoardSession(currentBoardSession),
        boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
    };
}

function getSessionMessages(sessionId = "") {
    const normalizedId = String(sessionId || "");
    if (!normalizedId) return [];
    if (String(currentBoardSession?.id || "") === normalizedId) {
        return currentBoardSession?.messages || [];
    }
    const archivedSession = boardSessionHistory.find((session) => String(session.id) === normalizedId);
    return archivedSession?.messages || [];
}

function rememberDeletedBoardMessage(sessionId, message, index) {
    const normalizedSessionId = String(sessionId || "");
    if (!normalizedSessionId || !message) return;
    if (!deletedBoardMessagesBySession[normalizedSessionId]) {
        deletedBoardMessagesBySession[normalizedSessionId] = [];
    }
    deletedBoardMessagesBySession[normalizedSessionId].push({
        message,
        index: Number(index),
        deletedAt: new Date().toISOString(),
    });
    if (deletedBoardMessagesBySession[normalizedSessionId].length > 30) {
        deletedBoardMessagesBySession[normalizedSessionId].splice(0, deletedBoardMessagesBySession[normalizedSessionId].length - 30);
    }
}

function sendPresence(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    safeSend(client.ws, {
        type: "presence",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
        boardState: getBoardState(clientId),
    });
}

function notifyBroadcastUpdate() {
    broadcast({
        type: "broadcast-state",
        activeBroadcast: getBroadcastSnapshot(),
    });
}

function notifyPinnedNotice() {
    broadcast({
        type: "board-pinned-notice",
        notice: pinnedNotice,
    });
}

function notifyReactions(clientId = "") {
    if (clientId) {
        const client = clients.get(clientId);
        if (client) {
            safeSend(client.ws, {
                type: "board-reactions",
                reactionSession: serializeReactionSession(currentReactionSession, clientId),
                reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
            });
        }
    }

    broadcast({
        type: "board-reactions",
        reactionSession: serializeReactionSession(currentReactionSession),
        reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
    }, clientId || null);
}

function deleteReactionHistoryByIds(ids) {
    const targetIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
    if (targetIds.size === 0) return;
    reactionSessionHistory = reactionSessionHistory.filter((session) => !targetIds.has(String(session.id)));
    persistState();
}

function deleteBoardHistoryByIds(ids) {
    const targetIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
    if (targetIds.size === 0) return;
    boardSessionHistory = boardSessionHistory.filter((session) => !targetIds.has(String(session.id)));
    persistState();
}

function deleteBoardMessage(sessionId, messageId) {
    const normalizedSessionId = String(sessionId || "");
    const normalizedMessageId = String(messageId || "");
    if (!normalizedSessionId || !normalizedMessageId) return false;

    if (String(currentBoardSession?.id || "") === normalizedSessionId) {
        const targetIndex = currentBoardSession.messages.findIndex((item) => String(item.id) === normalizedMessageId);
        if (targetIndex === -1) return false;
        const [deletedMessage] = currentBoardSession.messages.splice(targetIndex, 1);
        rememberDeletedBoardMessage(normalizedSessionId, deletedMessage, targetIndex);
        persistState();
        return true;
    }

    const session = boardSessionHistory.find((item) => String(item.id) === normalizedSessionId);
    if (!session) return false;
    const targetIndex = session.messages.findIndex((item) => String(item.id) === normalizedMessageId);
    if (targetIndex === -1) return false;
    const [deletedMessage] = session.messages.splice(targetIndex, 1);
    rememberDeletedBoardMessage(normalizedSessionId, deletedMessage, targetIndex);
    persistState();
    return true;
}

function restoreBoardMessage(sessionId) {
    const normalizedSessionId = String(sessionId || "");
    const deletedEntries = deletedBoardMessagesBySession[normalizedSessionId];
    if (!normalizedSessionId || !Array.isArray(deletedEntries) || deletedEntries.length === 0) return null;

    const restoredEntry = deletedEntries.pop();
    if (deletedEntries.length === 0) {
        delete deletedBoardMessagesBySession[normalizedSessionId];
    }

    const targetMessages = String(currentBoardSession?.id || "") === normalizedSessionId
        ? currentBoardSession.messages
        : boardSessionHistory.find((item) => String(item.id) === normalizedSessionId)?.messages;

    if (!Array.isArray(targetMessages) || !restoredEntry?.message) return null;

    const insertIndex = Math.max(0, Math.min(Number(restoredEntry.index || 0), targetMessages.length));
    targetMessages.splice(insertIndex, 0, restoredEntry.message);
    persistState();
    return restoredEntry.message;
}

loadPersistedState();

function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    clients.delete(clientId);
    if (currentReactionSession?.clientReactions.has(clientId)) {
        currentReactionSession.clientReactions.delete(clientId);
        notifyReactions();
    }

    if (activeBroadcast?.broadcasterId === clientId) {
        broadcast({
            type: "broadcast-ended",
            reason: "broadcaster_disconnected",
        }, clientId);
        activeBroadcast = null;
        notifyBroadcastUpdate();
        return;
    }

    if (activeBroadcast?.viewerIds.has(clientId)) {
        activeBroadcast.viewerIds.delete(clientId);
        const broadcaster = clients.get(activeBroadcast.broadcasterId);
        if (broadcaster) {
            safeSend(broadcaster.ws, {
                type: "viewer-left",
                viewerId: clientId,
            });
        }
        notifyBroadcastUpdate();
    }
}

wss.on("connection", (ws) => {
    const clientId = String(nextClientId++);
    clients.set(clientId, {
        ws,
        role: "viewer",
        address: "",
        displayName: "",
        canBroadcast: false,
        lastHeartbeatAt: Date.now(),
    });

    safeSend(ws, {
        type: "welcome",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
        boardState: getBoardState(clientId),
    });

    ws.on("message", (raw) => {
        try {
            let message;

            try {
                message = JSON.parse(raw.toString());
            } catch (error) {
                safeSend(ws, {
                    type: "error",
                    code: "bad_json",
                });
                return;
            }

            const client = clients.get(clientId);
            if (!client) return;

            switch (message.type) {
        case "register":
            client.role = message.role || "viewer";
            client.address = message.address || "";
            client.displayName = message.displayName || "";
            client.canBroadcast = Boolean(message.canBroadcast);
            client.lastHeartbeatAt = Date.now();
            sendPresence(clientId);
            break;

        case "chat-message": {
            const moderation = moderateMessage(message.text);
            if (moderation.blocked) {
                safeSend(ws, {
                    type: "message-blocked",
                    reason: moderation.reason,
                });
                return;
            }

            const nextMessage = {
                id: message.id || `${Date.now()}_${clientId}`,
                text: message.text || "",
                amount: Number(message.amount || 0),
                chatType: message.chatType || "normal",
                timestamp: message.timestamp || new Date().toLocaleTimeString("ja-JP"),
                user: message.isAnonymous ? "匿名質問" : (message.user || client.displayName || getDisplayName(client)),
                messageKind: message.messageKind || (message.isQuestion ? "question" : "comment"),
                isQuestion: Boolean(message.isQuestion),
                isAnonymous: Boolean(message.isAnonymous),
                likedBy: new Set(),
                senderAddress: message.senderAddress || client.address || "",
            };

            currentBoardSession.messages.push(nextMessage);
            persistState();

            broadcast({
                type: "chat-message",
                message: serializeBoardMessage(nextMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;
        }

        case "board-question-like": {
            const target = currentBoardSession.messages.find((item) => item.id === message.messageId && item.isQuestion);
            if (!target) return;
            if (target.likedBy.has(clientId)) return;
            target.likedBy.add(clientId);
            broadcast({
                type: "board-message-updated",
                message: serializeBoardMessage(target),
            });
            client.lastHeartbeatAt = Date.now();
            break;
        }

        case "board-reaction":
            if (!REACTION_KEYS.includes(message.reaction)) return;
            currentReactionSession.clientReactions.set(clientId, message.reaction);
            currentReactionSession.reactionEvents.push({
                reaction: message.reaction,
                at: new Date().toISOString(),
                clientId,
                address: client.address || "",
                displayName: client.displayName || getDisplayName(client),
            });
            if (currentReactionSession.reactionEvents.length > 500) {
                currentReactionSession.reactionEvents.splice(0, currentReactionSession.reactionEvents.length - 500);
            }
            persistState();
            notifyReactions(clientId);
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-reset-reactions":
            if (client.role !== "staff") return;
            currentReactionSession.clientReactions.clear();
            currentReactionSession.reactionEvents = [];
            persistState();
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-start-reaction-session":
            if (client.role !== "staff") return;
            archiveCurrentReactionSession();
            currentReactionSession = createReactionSession(message.label || "");
            persistState();
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-start-chat-session":
            if (client.role !== "staff") return;
            archiveCurrentBoardSession();
            currentBoardSession = createBoardSession(message.label || "");
            persistState();
            broadcast({
                type: "board-session-updated",
                boardSession: serializeBoardSession(currentBoardSession),
                boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
                messages: [],
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-reaction-history":
            if (client.role !== "staff") return;
            deleteReactionHistoryByIds(message.sessionIds);
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-reaction-timeline-bucket":
            if (client.role !== "staff") return;
            if (!deleteReactionTimelineBucket(message.bucketTime)) return;
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-chat-history":
            if (client.role !== "staff") return;
            deleteBoardHistoryByIds(message.sessionIds);
            broadcast({
                type: "board-session-updated",
                boardSession: serializeBoardSession(currentBoardSession),
                boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-message":
            if (client.role !== "staff") return;
            if (!deleteBoardMessage(message.sessionId, message.messageId)) return;
            broadcast({
                type: "board-message-deleted",
                sessionId: String(message.sessionId || ""),
                messageId: String(message.messageId || ""),
            });
            broadcast({
                type: "board-session-messages",
                sessionId: String(message.sessionId || ""),
                messages: getSessionMessages(message.sessionId).map(serializeBoardMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-restore-message": {
            if (client.role !== "staff") return;
            const restoredMessage = restoreBoardMessage(message.sessionId);
            if (!restoredMessage) {
                safeSend(ws, {
                    type: "board-restore-failed",
                    sessionId: String(message.sessionId || ""),
                });
                return;
            }
            broadcast({
                type: "board-message-restored",
                sessionId: String(message.sessionId || ""),
                message: serializeBoardMessage(restoredMessage),
            });
            broadcast({
                type: "board-session-messages",
                sessionId: String(message.sessionId || ""),
                messages: getSessionMessages(message.sessionId).map(serializeBoardMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;
        }

        case "board-view-session":
            safeSend(ws, {
                type: "board-session-messages",
                sessionId: String(message.sessionId || ""),
                messages: getSessionMessages(message.sessionId).map(serializeBoardMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-pin-notice":
            if (client.role !== "staff") return;
            pinnedNotice = {
                id: `notice_${Date.now()}`,
                text: String(message.text || "").trim(),
                user: client.displayName || getDisplayName(client),
                timestamp: new Date().toLocaleTimeString("ja-JP"),
            };
            persistState();
            notifyPinnedNotice();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-clear-pinned-notice":
            if (client.role !== "staff") return;
            pinnedNotice = null;
            persistState();
            notifyPinnedNotice();
            client.lastHeartbeatAt = Date.now();
            break;

        case "start-broadcast":
            if (!client.canBroadcast) {
                safeSend(ws, {
                    type: "error",
                    code: "forbidden_broadcast",
                });
                return;
            }
            if (activeBroadcast && activeBroadcast.broadcasterId !== clientId) {
                safeSend(ws, {
                    type: "broadcast-rejected",
                    reason: "already_active",
                    activeBroadcast: getBroadcastSnapshot(),
                });
                return;
            }

            activeBroadcast = {
                broadcasterId: clientId,
                broadcasterAddress: client.address,
                broadcasterName: message.broadcasterName || client.displayName || getDisplayName(client),
                broadcasterRole: message.broadcasterRole || "Teacher / TA",
                outputType: message.outputType || "camera",
                startedAt: message.startedAt || new Date().toISOString(),
                viewerIds: new Set(),
            };
            notifyBroadcastUpdate();
            break;

        case "stop-broadcast":
            if (activeBroadcast?.broadcasterId !== clientId) return;
            broadcast({
                type: "broadcast-ended",
                reason: "stopped",
            }, clientId);
            activeBroadcast = null;
            notifyBroadcastUpdate();
            break;

        case "viewer-ready":
            if (!activeBroadcast) {
                safeSend(ws, {
                    type: "broadcast-ended",
                    reason: "no_active_broadcast",
                });
                return;
            }
            if (activeBroadcast.broadcasterId === clientId) return;
            activeBroadcast.viewerIds.add(clientId);
            client.lastHeartbeatAt = Date.now();
            {
                const broadcaster = clients.get(activeBroadcast.broadcasterId);
                if (broadcaster) {
                    safeSend(broadcaster.ws, {
                        type: "viewer-joined",
                        viewerId: clientId,
                    });
                }
            }
            notifyBroadcastUpdate();
            break;

        case "signal-offer":
        case "signal-answer":
        case "signal-ice": {
            const target = clients.get(message.targetId);
            if (!target) return;
            safeSend(target.ws, {
                ...message,
                fromId: clientId,
            });
            break;
        }

        case "heartbeat":
            client.lastHeartbeatAt = Date.now();
            safeSend(ws, {
                type: "heartbeat-ack",
                now: client.lastHeartbeatAt,
            });
            break;

        default:
            safeSend(ws, {
                type: "error",
                code: "unknown_message_type",
            });
        }
        } catch (error) {
            console.error("WebSocket message handling failed", error);
            safeSend(ws, {
                type: "error",
                code: "internal_error",
            });
        }
    });

    ws.on("close", () => {
        handleDisconnect(clientId);
    });

    ws.on("error", () => {
        handleDisconnect(clientId);
    });
});

server.listen(PORT, () => {
    console.log(`Live signal server listening on http://localhost:${PORT}`);
});

server.on("clientError", (error, socket) => {
    console.error("HTTP client error", error);
    try {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    } catch (endError) {
        console.error("Failed to end client error socket", endError);
    }
});

setInterval(() => {
    const now = Date.now();
    for (const [clientId, client] of clients.entries()) {
        if (now - (client.lastHeartbeatAt || 0) <= HEARTBEAT_TIMEOUT_MS) continue;
        try {
            client.ws.terminate();
        } catch (error) {
            handleDisconnect(clientId);
        }
    }
}, 30 * 1000);

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception in live signal server", error);
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection in live signal server", reason);
});
