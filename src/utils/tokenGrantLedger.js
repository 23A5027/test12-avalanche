import { fetchLiveSignalJson } from "./liveSignalApi";
import { token_address, ttt_token_address } from "../contract/config";

const TOKEN_GRANT_SCOPE = [token_address, ttt_token_address]
    .map((value) => String(value || "").toLowerCase())
    .join("_");
const STORAGE_KEY = `web3_quiz_token_grant_ledger_v1_${TOKEN_GRANT_SCOPE}`;
const PENDING_GRANT_TTL_MS = 10 * 60 * 1000;

const TOKEN_GRANT_KEYS = {
    POL: "answer_pol",
    TFT: "answer_thanks_tft",
    TTT: "board_ttt",
};

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function inferHistoryType(record = {}) {
    const source = String(record?.source || "");
    if (source.includes("clear_manual_mark")) return "clear";
    if (source.includes("manual_mark")) return "manual_mark";
    return "grant";
}

function normalizeHistoryEntry(entry = {}) {
    return {
        type: entry?.type || inferHistoryType(entry),
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

function getRecordTimestamp(record) {
    if (!record?.grantedAt) return 0;
    const timestamp = new Date(record.grantedAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeLedger(rawLedger = {}) {
    const nextLedger = {};
    Object.entries(rawLedger || {}).forEach(([address, status]) => {
        const normalizedAddress = normalizeAddress(address);
        const normalizedStatus = {};
        Object.values(TOKEN_GRANT_KEYS).forEach((assetKey) => {
            const normalizedRecord = normalizeGrantRecord(status?.[assetKey]);
            if (normalizedRecord) {
                normalizedStatus[assetKey] = normalizedRecord;
            }
        });
        if (Object.keys(normalizedStatus).length > 0) {
            nextLedger[normalizedAddress] = normalizedStatus;
        }
    });
    return nextLedger;
}

function readGrantLedger() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return normalizeLedger(parsed);
    } catch (error) {
        console.error("Failed to read token grant ledger", error);
        return {};
    }
}

function writeGrantLedger(nextLedger) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLedger(nextLedger)));
}

function getAddressGrantStatus(address) {
    const ledger = readGrantLedger();
    return ledger[normalizeAddress(address)] || {};
}

function mergeGrantRecord(currentRecord, nextRecord) {
    const current = normalizeGrantRecord(currentRecord);
    const next = normalizeGrantRecord(nextRecord);
    if (!current) return next;
    if (!next) return current;

    const historyMap = new Map();
    [...(current.history || []), ...(next.history || [])].forEach((entry) => {
        const normalizedEntry = normalizeHistoryEntry(entry);
        const key = [
            normalizedEntry.type,
            normalizedEntry.at,
            normalizedEntry.txHash,
            normalizedEntry.amount,
            normalizedEntry.source,
            normalizedEntry.active,
        ].join("|");
        historyMap.set(key, normalizedEntry);
    });

    const history = Array.from(historyMap.values()).sort((left, right) => String(left.at).localeCompare(String(right.at)));
    const latestEntry = history[history.length - 1] || normalizeHistoryEntry({});
    const latestConfirmedTx = [...history].reverse().find((entry) => entry.txHash);

    return {
        grantedAt: latestEntry.at || next.grantedAt || current.grantedAt || "",
        amount: latestEntry.amount ?? next.amount ?? current.amount ?? null,
        txHash: latestEntry.txHash || latestConfirmedTx?.txHash || next.txHash || current.txHash || "",
        source: latestEntry.source || next.source || current.source || "",
        confirmed: latestEntry.confirmed !== false,
        active: latestEntry.active !== false,
        history,
    };
}

function mergeGrantLedger(baseLedger = {}, nextLedger = {}) {
    const base = normalizeLedger(baseLedger);
    const next = normalizeLedger(nextLedger);
    const merged = { ...base };

    Object.entries(next).forEach(([address, status]) => {
        const normalizedAddress = normalizeAddress(address);
        const currentStatus = merged[normalizedAddress] || {};
        const nextStatus = status && typeof status === "object" ? status : {};
        const mergedStatus = {};

        Object.values(TOKEN_GRANT_KEYS).forEach((assetKey) => {
            const mergedRecord = mergeGrantRecord(currentStatus[assetKey], nextStatus[assetKey]);
            if (mergedRecord) {
                mergedStatus[assetKey] = mergedRecord;
            }
        });

        if (Object.keys(mergedStatus).length > 0) {
            merged[normalizedAddress] = mergedStatus;
        }
    });

    return normalizeLedger(merged);
}

async function syncGrantLedgerFromServer() {
    const localLedger = readGrantLedger();
    const response = await fetchLiveSignalJson("/token-grants", { method: "GET" });
    const serverLedger = response?.ledger && typeof response.ledger === "object" ? response.ledger : {};
    const ledger = mergeGrantLedger(localLedger, serverLedger);
    writeGrantLedger(ledger);
    return ledger;
}

async function persistGrantRecordToServer(address, assetKey, payload = {}) {
    const response = await fetchLiveSignalJson("/token-grants", {
        method: "POST",
        body: JSON.stringify({
            address: normalizeAddress(address),
            assetKey,
            payload,
        }),
    });
    const serverLedger = response?.ledger && typeof response.ledger === "object" ? response.ledger : {};
    const ledger = mergeGrantLedger(readGrantLedger(), serverLedger);
    writeGrantLedger(ledger);
    return ledger;
}

async function removeGrantRecordFromServer(address, assetKey, payload = {}) {
    const response = await fetchLiveSignalJson("/token-grants", {
        method: "POST",
        body: JSON.stringify({
            address: normalizeAddress(address),
            assetKey,
            remove: true,
            payload,
        }),
    });
    const serverLedger = response?.ledger && typeof response.ledger === "object" ? response.ledger : {};
    const ledger = mergeGrantLedger(readGrantLedger(), serverLedger);
    writeGrantLedger(ledger);
    return ledger;
}

function isGrantActive(record) {
    return Boolean(record?.active !== false && record?.confirmed !== false && record?.grantedAt);
}

function isGrantPending(record) {
    if (!record || record?.active === false || record?.confirmed !== false || !record?.grantedAt) {
        return false;
    }
    const grantedAt = getRecordTimestamp(record);
    if (!grantedAt) return false;
    return (Date.now() - grantedAt) <= PENDING_GRANT_TTL_MS;
}

function isGrantReserved(record) {
    return Boolean(isGrantActive(record) || isGrantPending(record));
}

function hasGrantedToken(address, assetKey) {
    const status = getAddressGrantStatus(address);
    return isGrantReserved(status?.[assetKey]);
}

function markGrantedToken(address, assetKey, payload = {}) {
    const ledger = readGrantLedger();
    const normalizedAddress = normalizeAddress(address);
    const current = ledger[normalizedAddress] || {};
    const currentRecord = normalizeGrantRecord(current[assetKey]);
    const history = [...(currentRecord?.history || [])];
    const nextEntry = normalizeHistoryEntry({
        type: inferHistoryType(payload),
        at: payload.grantedAt || new Date().toISOString(),
        amount: payload.amount ?? null,
        txHash: payload.txHash || "",
        source: payload.source || "",
        confirmed: payload.confirmed !== false,
        active: true,
    });
    history.push(nextEntry);

    ledger[normalizedAddress] = {
        ...current,
        [assetKey]: {
            grantedAt: nextEntry.at,
            amount: nextEntry.amount,
            txHash: nextEntry.txHash || currentRecord?.txHash || "",
            source: nextEntry.source,
            confirmed: nextEntry.confirmed,
            active: true,
            history,
        },
    };

    writeGrantLedger(ledger);
    return ledger[normalizedAddress];
}

function clearGrantedToken(address, assetKey, payload = {}) {
    const ledger = readGrantLedger();
    const normalizedAddress = normalizeAddress(address);
    const current = ledger[normalizedAddress];
    const currentRecord = normalizeGrantRecord(current?.[assetKey]);
    if (!currentRecord) return ledger;

    const history = [...(currentRecord.history || [])];
    const nextEntry = normalizeHistoryEntry({
        type: "clear",
        at: payload.grantedAt || new Date().toISOString(),
        amount: payload.amount ?? currentRecord.amount ?? null,
        txHash: "",
        source: payload.source || "manual_clear",
        confirmed: true,
        active: false,
    });
    history.push(nextEntry);

    ledger[normalizedAddress] = {
        ...current,
        [assetKey]: {
            grantedAt: nextEntry.at,
            amount: currentRecord.amount ?? null,
            txHash: currentRecord.txHash || "",
            source: nextEntry.source,
            confirmed: true,
            active: false,
            history,
        },
    };

    writeGrantLedger(ledger);
    return ledger;
}

function getGrantLedgerEntries() {
    const ledger = readGrantLedger();
    return Object.entries(ledger).map(([address, status]) => ({
        address,
        status: status || {},
    }));
}

export {
    TOKEN_GRANT_KEYS,
    readGrantLedger,
    getAddressGrantStatus,
    hasGrantedToken,
    isGrantActive,
    isGrantReserved,
    markGrantedToken,
    clearGrantedToken,
    getGrantLedgerEntries,
    syncGrantLedgerFromServer,
    persistGrantRecordToServer,
    removeGrantRecordFromServer,
    mergeGrantLedger,
    normalizeGrantRecord,
};
