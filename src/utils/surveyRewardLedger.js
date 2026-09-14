import { fetchLiveSignalJson } from "./liveSignalApi";

const STORAGE_KEY = "web3_quiz_survey_reward_ledger_v1";
const PENDING_TTL_MS = 10 * 60 * 1000;

function normalizeAddress(address) {
    return String(address || "").trim().toLowerCase();
}

function normalizeCampaignLabel(label = "") {
    return String(label || "").trim();
}

function normalizeCampaignKey(label = "") {
    return normalizeCampaignLabel(label)
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^\p{L}\p{N}_-]/gu, "")
        .replace(/^_+|_+$/g, "");
}

function normalizeSurveyRewardEntry(entry = {}) {
    const address = normalizeAddress(entry?.address);
    const campaignLabel = normalizeCampaignLabel(entry?.campaignLabel);
    const campaignKey = normalizeCampaignKey(entry?.campaignKey || campaignLabel);
    const createdAt = entry?.createdAt || entry?.grantedAt || new Date().toISOString();
    const type = String(entry?.type || (entry?.confirmed === false ? "pending" : "grant"));
    const txHash = String(entry?.txHash || "");
    const id = String(entry?.id || `${campaignKey}:${address}:${txHash || createdAt}:${type}`);

    return {
        id,
        address,
        campaignKey,
        campaignLabel,
        amount: Number(entry?.amount || 0),
        txHash,
        createdAt,
        type,
        confirmed: entry?.confirmed !== false,
        actorAddress: normalizeAddress(entry?.actorAddress),
        source: String(entry?.source || ""),
        studentName: String(entry?.studentName || ""),
        studentId: String(entry?.studentId || ""),
    };
}

function normalizeSurveyRewardEntries(entries = []) {
    const deduped = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const normalized = normalizeSurveyRewardEntry(entry);
        if (!normalized.address || !normalized.campaignKey || !normalized.id) return;
        deduped.set(normalized.id, normalized);
    });
    return Array.from(deduped.values()).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}

function readSurveyRewardLedger() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return normalizeSurveyRewardEntries(JSON.parse(raw));
    } catch (error) {
        console.error("Failed to read survey reward ledger", error);
        return [];
    }
}

function writeSurveyRewardLedger(entries = []) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSurveyRewardEntries(entries)));
}

function mergeSurveyRewardEntries(baseEntries = [], nextEntries = []) {
    return normalizeSurveyRewardEntries([...(Array.isArray(baseEntries) ? baseEntries : []), ...(Array.isArray(nextEntries) ? nextEntries : [])]);
}

function buildSurveyRewardStatusMap(entries = []) {
    const statusMap = new Map();
    const sortedEntries = [...normalizeSurveyRewardEntries(entries)].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));

    sortedEntries.forEach((entry) => {
        const key = `${entry.campaignKey}:${entry.address}`;
        const current = statusMap.get(key) || {
            address: entry.address,
            campaignKey: entry.campaignKey,
            campaignLabel: entry.campaignLabel,
            history: [],
            latestEntry: null,
        };
        current.history.push(entry);
        current.latestEntry = entry;
        current.campaignLabel = entry.campaignLabel || current.campaignLabel;
        statusMap.set(key, current);
    });

    return statusMap;
}

function getSurveyRewardStatus(address, campaignKey, entries = null) {
    const statusMap = buildSurveyRewardStatusMap(entries || readSurveyRewardLedger());
    return statusMap.get(`${normalizeCampaignKey(campaignKey)}:${normalizeAddress(address)}`) || null;
}

function isSurveyRewardPending(status) {
    if (!status?.latestEntry || status.latestEntry.type !== "pending") return false;
    const timestamp = new Date(status.latestEntry.createdAt || 0).getTime();
    if (!Number.isFinite(timestamp)) return false;
    return (Date.now() - timestamp) <= PENDING_TTL_MS;
}

function hasSurveyRewardBeenGranted(address, campaignKey, entries = null) {
    const status = getSurveyRewardStatus(address, campaignKey, entries);
    return Boolean(status?.latestEntry && status.latestEntry.type === "grant" && status.latestEntry.confirmed !== false);
}

function hasSurveyRewardReserved(address, campaignKey, entries = null) {
    const status = getSurveyRewardStatus(address, campaignKey, entries);
    return Boolean(hasSurveyRewardBeenGranted(address, campaignKey, entries) || isSurveyRewardPending(status));
}

async function syncSurveyRewardLedgerFromServer() {
    const localEntries = readSurveyRewardLedger();
    const response = await fetchLiveSignalJson("/survey-grants", { method: "GET" });
    const serverEntries = Array.isArray(response?.entries) ? response.entries : [];
    const mergedEntries = mergeSurveyRewardEntries(localEntries, serverEntries);
    writeSurveyRewardLedger(mergedEntries);
    return mergedEntries;
}

async function persistSurveyRewardEntriesToServer(entries = []) {
    const payloadEntries = normalizeSurveyRewardEntries(entries);
    const response = await fetchLiveSignalJson("/survey-grants", {
        method: "POST",
        body: JSON.stringify({ entries: payloadEntries }),
    });
    const serverEntries = Array.isArray(response?.entries) ? response.entries : [];
    const mergedEntries = mergeSurveyRewardEntries(readSurveyRewardLedger(), serverEntries);
    writeSurveyRewardLedger(mergedEntries);
    return mergedEntries;
}

function getSurveyRewardEntries() {
    return readSurveyRewardLedger();
}

export {
    buildSurveyRewardStatusMap,
    getSurveyRewardEntries,
    getSurveyRewardStatus,
    hasSurveyRewardBeenGranted,
    hasSurveyRewardReserved,
    isSurveyRewardPending,
    mergeSurveyRewardEntries,
    normalizeCampaignKey,
    normalizeSurveyRewardEntries,
    persistSurveyRewardEntriesToServer,
    readSurveyRewardLedger,
    syncSurveyRewardLedgerFromServer,
};
