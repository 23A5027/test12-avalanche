/**
 * Contracts_MetaMask - Main contract interaction class
 *
 * viem client initialization and shared utilities are imported from contractClients.js
 * This file contains the Contracts_MetaMask class with all blockchain interaction methods.
 */
/* global BigInt */
import { decodeEventLog, getAddress as checksumAddress, parseEther, parseUnits } from "viem";
import {
    ethereum,
    walletClient,
    publicClient,
    token_abi,
    quiz_abi,
    bootstrap_teacher_addresses,
    token_address,
    ttt_token_address,
    class_room_address,
    quiz_address,
    legacy_quiz_addresses,
    tokenContract as token,
    tttTokenContract as tttToken,
    quizContract as quiz,
    amoy,
    sliceByNumber,
    getEthereumProvider as resolveEthereumProvider,
    waitForEthereumProvider,
} from "./contractClients";
import { getRegisteredCorrectAnswer } from "../utils/quizCorrectAnswerStore";
import { getRewardPayoutEntries } from "../utils/rewardPayoutLedger";
import { MAX_TFT_TOTAL } from "../utils/quizRewardRate";

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function normalizeReadAccount(account) {
    return account ? checksumAddress(String(account).trim()) : undefined;
}

function getTokenHistoryExplanation(entry) {
    return String(entry?._explanation || entry?.[5] || "");
}

function getTokenHistoryValueTft(entry) {
    return Number(entry?._value || entry?.[4] || 0) / 10 ** 18;
}

function getTokenHistoryEpochTime(entry) {
    return Number(entry?.epoch_time || entry?.[3] || 0);
}

const SCORE_BASELINE_CUTOFF_EPOCH = Math.floor(new Date("2026-06-10T00:00:00+09:00").getTime() / 1000);
const SCORE_BASELINE_POINT_MAP = {
    "0x8f31faf8054308d3cd458e297e80bfb9afac1f66": 6,
    "0xf5ba28e82f86100f3fe1f6c7a1c7a4639b7ac544": 0,
    "0x7d5498fcc02833aea290e2b7be75c495ab0ccf33": 0,
    "0xe91a78314dd00479df71ef9699ea77cbda25bc77": 0,
    "0x646d8f6629eb6d278916e3fc70fff9b37c1c11b3": 8.1,
    "0x7c3a7423ba99f8137d29bd637c3eaf058592af7e": 0,
    "0xe94e5cd643bff55ed8cd75728d59af2d764cd003": 0,
    "0xde6ba04cdb73ae7ac8cec20ad5e505dabb82874d": 8.4,
    "0x9c061a40de42d669e5da1f97bbac6f59ac584752": 0,
    "0x79e62eb09b2685df35b5e686ce1b392aa05cc81e": 9,
    "0xc5ff43e2dc58ffec62a2b84cdea88f32ea695759": 9,
    "0x324bbe330ecf6907f7b8e0e2697a631e2b992168": 0,
    "0x7c72b112cbaa17c57459000629ec27c8840e7d15": 0,
    "0x5a9e3c52085f8d4427186e95ab2f05480569455a": 15,
    "0x819313e4f8af9c7f4bf33782e4306f0f8a5fa4ac": 0,
    "0x6e104be864b7bedf33ec5ea800a92fabf0e20f5a": 7.8,
    "0xe97f0eb6cf7d4ef903f319eabb2aedf0b3826763": 0,
    "0x33b5c15db5f9ceeccda8b86d81ca2f8aea38519a": 3,
    "0x54e95e44f13a0ebe0f0937b2f7b6b3b9c23a898b": 3.6,
    "0xad2b20f0948d26e2a267e238efcd92366cad60fe": 6,
    "0x1e1c6dc65a92bda0221fde42d02293b65b13626c": 12,
    "0x7aa5e01e4f3201a3e8116984ee8fea01b1351a8b": 12.6,
    "0x8ffbd5b07ce0713224bcea37e9e4e4032fc68434": 0,
    "0xc9f059d8533abe13a193823f7c1b3675caf7dab8": 0,
    "0xdb7f1b91fd875af16f87faa24767aa607589f54": 0,
    "0xae486db262da9115e19f0f500dcacb82c9c9033e": 0,
    "0x9cff512b24311d1e789d4a2d3590d8ab52c1ad84": 1.8,
    "0xd410062a453c259fad3b86e5394774286cf5cfbc": 5.7,
    "0x278caf0f55b161573f64713e89ffa75973f902b6": 0,
    "0xd18d00061cf9b8f05641b1733bf6624c89ed9c67": 0,
    "0x5068b9949ee089db6b0e756f2f7f4bdd82d5caba": 0,
    "0x6dd6ea3eff299c915a85178df409b0f6bf45ed9f": 1.2,
    "0xfd24524abc538d7378a4a33a9481b963fc0b4f80": 8.1,
    "0xdc2ab793df8b8292c235157edf2afac41313fb5d": 0,
    "0xecb60d87286cb5234c48807ccc24fd982bbb0ccf": 0,
    "0x4c1b3eda1e57561d07bc73c147dbe799cff55e3d": 15,
    "0xc7f0ae72c301c743aa141f1ee755dd4d544e6df8": 0,
    "0x79c965aa45ebc8cb15a5bbd2cd95207779e87879": 14.1,
    "0x8eb65d50ba7044cea8f85dd31ba6ee86448f7bf5": 10.5,
    "0x3c62d33460a96911cb79c5c57f755016425c4a9a": 3,
    "0x4e46b6218827450cb38a5c8db5ef1a649ed0e7dd": 0,
    "0xbf1ce52773942fbfcc9a6492f0c0974ce94927e7": 0,
    "0x1222e31b35c2265d8b9930257a1d13dfe98bddff": 0,
    "0x32abdc62c0d67d350bc6d6f873b4d52b07170b8b": 0,
    "0xe7e32cb6950e911b9af69b17bae1b4f6d1aef390": 0,
    "0xb14515c078927c175945d8fe79dbb3176d76bc8d": 0,
    "0x4d930dc3d8c904563de4b6a77283b80f82ab7e0a": 0,
    "0xbf80aea77d2a846844346992abb517b6470e840a": 0,
    "0x6b09b1afb8d61fda08563adb443aa7d033724900": 0,
    "0x9ae0de943d3380246ebe8d4e8746aefe95f44882": 1.8,
    "0xdc29c59c95a72c046268d33aa9d102775c8ceea3": 0,
    "0x54cb5dbd6ac52ff2b5fb4c9101f5eee8e615623c": 0,
    "0xc9f816447aed8e5c5488a64e73b07e21086081aa": 0,
    "0x6f352ae8085ab299d6ae437bfce5f50b7fac7f62": 11.1,
    "0x4b844b1aa1fdbe12487a23c7e8e2471277f40b30": 2.4,
    "0x60a0cf73e9a342fa7812c87ce8a0ca43fafaf8f3": 0,
    "0x84b251821f9fc80e8f20e35370509a6f6b7fde2e": 15,
    "0xbb26b5251b2676dc3cd5bea6f662df3f9135359b": 0,
    "0xb72a6e981aebb78a0b1b01ca601e8643aa9f5929": 3.9,
    "0x766056db0cf773fba1b850f80a1010eaa1f497aa": 5.4,
    "0x7ec903d568db73de25f56a12f794e489a2760e55": 11.1,
    "0x7ed69035c02fa51683fee57953fb4779854fac46": 0,
    "0x293eea4b71be40b6e89cd544c970b7a183149f37": 5.7,
    "0xbdee367ea57f1aee9749b3432130f7c5ecf452b6": 9,
    "0xb081058c787ef2a17cd11ec2e0ff2e5141b2399c": 3,
    "0x98bc827f1dc59897da26c1d76b0093e1e4739fda": 3,
    "0x0c45589b4105d69abfcb06254dc85fc80802517f": 0,
    "0xbb38bbfc3a0fa0228b876ec8dca1cc5e2b6f51aa": 0,
};
const SCORE_BASELINE_TFT_MAP = Object.fromEntries(
    Object.entries(SCORE_BASELINE_POINT_MAP).map(([address, point]) => [
        address,
        Math.round(Number(point || 0) * 50 * 1000) / 1000,
    ])
);

const CONTRACT_CACHE_SCOPE = [
    amoy.id,
    class_room_address,
    quiz_address,
    token_address,
    ttt_token_address,
].map((value) => String(value || "").toLowerCase()).join("_");
const SCORE_CACHE_KEY = `web3_quiz_reward_cache_v1_${CONTRACT_CACHE_SCOPE}`;
const STUDENT_LIST_CACHE_KEY = `web3_quiz_student_list_cache_v1_${CONTRACT_CACHE_SCOPE}`;
const RESULTS_CACHE_KEY = `web3_quiz_results_cache_v1_${CONTRACT_CACHE_SCOPE}`;
const QUIZ_INVENTORY_PERSIST_KEY = `web3_quiz_inventory_cache_v1_${CONTRACT_CACHE_SCOPE}`;
const QUIZ_SIMPLE_CACHE_KEY = "web3_quiz_simple_cache_v1";
const LAST_KNOWN_WALLET_ADDRESS_KEY = "web3_last_known_wallet_address_v1";
const STUDENT_LIST_CACHE_TTL_MS = 3 * 60 * 1000;
const RESULTS_CACHE_TTL_MS = 60 * 1000;
const HISTORY_LEN_CACHE_TTL_MS = 45 * 1000;
const READ_ACCOUNT_CACHE_TTL_MS = 8 * 1000;
const QUIZ_INVENTORY_CACHE_TTL_MS = 20 * 1000;
const QUIZ_INVENTORY_PERSIST_TTL_MS = 90 * 1000;
const QUIZ_SIMPLE_CACHE_TTL_MS = 45 * 1000;
const WALLET_CONNECTION_CACHE_TTL_MS = 10 * 1000;
const CHAIN_ID_CACHE_TTL_MS = 8 * 1000;
const AMOY_READY_CACHE_TTL_MS = 10 * 1000;
const MAX_PAYOUT_GAS_PER_TX = 900000n;
const MAX_PAYOUT_FEE_PER_TX_WEI = parseEther("0.05");
const MAX_PAYOUT_RECIPIENTS_PER_TX = 15;

let studentListCacheMemory = null;
let studentListCacheFetchedAt = 0;
let studentListCachePromise = null;
let resultsCacheMemory = null;
let resultsCacheFetchedAt = 0;
let resultsCachePromise = null;
const userHistoryLenCache = new Map();
let readAccountCacheValue = "";
let readAccountCacheFetchedAt = 0;
let readAccountCachePromise = null;
let quizInventoryCacheMemory = null;
let quizInventoryCacheFetchedAt = 0;
let quizInventoryCachePromise = null;
const quizSimpleCacheMemory = new Map();
let walletConnectionReadyUntil = 0;
let chainIdCacheValue = null;
let chainIdCacheFetchedAt = 0;
let amoyReadyUntil = 0;

function setReadAccountCacheValue(account = "") {
    readAccountCacheValue = account ? String(account) : "";
    readAccountCacheFetchedAt = Date.now();
    walletConnectionReadyUntil = readAccountCacheValue ? Date.now() + WALLET_CONNECTION_CACHE_TTL_MS : 0;
    if (typeof localStorage !== "undefined") {
        try {
            if (readAccountCacheValue) {
                localStorage.setItem(LAST_KNOWN_WALLET_ADDRESS_KEY, readAccountCacheValue);
            }
        } catch (error) {
        }
    }
}

function setChainIdCacheValue(chainId = null) {
    chainIdCacheValue = Number.isFinite(Number(chainId)) ? Number(chainId) : null;
    chainIdCacheFetchedAt = Date.now();
    amoyReadyUntil = chainIdCacheValue === amoy.id ? Date.now() + AMOY_READY_CACHE_TTL_MS : 0;
}

function getCachedChainId() {
    if (chainIdCacheValue == null) return null;
    if (Date.now() - chainIdCacheFetchedAt > CHAIN_ID_CACHE_TTL_MS) return null;
    return chainIdCacheValue;
}

function isProviderLimitError(error) {
    const message = String(error?.shortMessage || error?.message || "").toLowerCase();
    return message.includes("request exceeds defined limit")
        || message.includes("rate limit")
        || message.includes("too many requests")
        || message.includes("limit exceeded");
}

function readScoreCache() {
    if (typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(SCORE_CACHE_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

function writeScoreCache(nextCache) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(nextCache));
}

function readTimedCache(key) {
    if (typeof localStorage === "undefined") return null;
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function writeTimedCache(key, payload) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(payload));
}

function deleteTimedCache(key) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
}

function buildRewardLedgerQuizKey(sourceAddress = "", quizId = 0) {
    return `${String(sourceAddress || "").toLowerCase()}:${Number(quizId)}`;
}

function buildRewardLedgerSignature(entries = []) {
    return (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry?.confirmed !== false && String(entry?.resultState || "") === "correct")
        .map((entry) => `${buildRewardLedgerQuizKey(entry?.sourceAddress, entry?.quizId)}:${String(entry?.studentAddress || "").toLowerCase()}:${Number(entry?.rewardTft || 0)}:${String(entry?.txHash || "")}`)
        .sort()
        .join("|");
}

function buildQuizSimpleCacheKey(sourceAddress = "", quizId = 0, account = "") {
    return `${String(sourceAddress || "").toLowerCase()}:${Number(quizId)}:${String(account || "public").toLowerCase()}`;
}

function uniqueAddresses(addresses = []) {
    return Array.from(new Set((addresses || []).filter(Boolean)));
}

function readQuizSimpleCacheStore() {
    if (typeof localStorage === "undefined") return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(QUIZ_SIMPLE_CACHE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeQuizSimpleCacheStore(store) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(QUIZ_SIMPLE_CACHE_KEY, JSON.stringify(store || {}));
}

function getStoredQuizInventoryEntries() {
    const persistedCache = readTimedCache(QUIZ_INVENTORY_PERSIST_KEY);
    if (!Array.isArray(persistedCache?.value)) return [];
    return persistedCache.value;
}

async function retryReadContractBalance(readFn, attempts = 3) {
    let lastError = null;
    for (let index = 0; index < attempts; index += 1) {
        try {
            return await readFn();
        } catch (error) {
            lastError = error;
            if (index < attempts - 1) {
                await sleep(400 * (index + 1));
            }
        }
    }
    throw lastError;
}

async function runSettledInChunks(items, chunkSize, mapper) {
    const settled = [];
    const safeChunkSize = Math.max(1, Number(chunkSize || 1));
    for (let index = 0; index < items.length; index += safeChunkSize) {
        const chunk = items.slice(index, index + safeChunkSize);
        const chunkResults = await Promise.allSettled(chunk.map((item, chunkIndex) => mapper(item, index + chunkIndex)));
        settled.push(...chunkResults);
        // チャンク間にメインスレッドへ処理を返す（UI応答性確保）
        if (index + safeChunkSize < items.length) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    return settled;
}

const IS_TEACHER_NO_ARG_ABI = {
    type: "function",
    name: "_isTeacher",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
};
const IS_TEACHER_WITH_ADDRESS_ABI = {
    type: "function",
    name: "_isTeacher",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
};
const IS_STUDENT_NO_ARG_ABI = {
    type: "function",
    name: "_isStudent",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
};
const IS_STUDENT_WITH_ADDRESS_ABI = {
    type: "function",
    name: "_isStudent",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
};
const ADD_STUDENT_ABI = {
    type: "function",
    name: "add_student",
    stateMutability: "nonpayable",
    inputs: [{ name: "students_address", type: "address[]" }],
    outputs: [{ name: "res", type: "bool" }],
};
const ADD_TEACHER_ABI = {
    type: "function",
    name: "add_teacher",
    stateMutability: "nonpayable",
    inputs: [{ name: "teacher_address", type: "address" }],
    outputs: [{ name: "res", type: "bool" }],
};
const GET_STUDENT_ALL_ABI = {
    type: "function",
    name: "get_student_all",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "result", type: "address[]" }],
};
const GET_TEACHER_ALL_ABI = {
    type: "function",
    name: "get_teacher_all",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "result", type: "address[]" }],
};
const GET_USER_ROLE_WITH_ADDRESS_ABI = {
    type: "function",
    name: "get_user_role",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "role", type: "uint8" }],
};
const GET_USER_ROLE_NO_ARG_ABI = {
    type: "function",
    name: "get_user_role",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "role", type: "uint8" }],
};
const GET_USER_ROLE_LABEL_WITH_ADDRESS_ABI = {
    type: "function",
    name: "get_user_role_label",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "role_label", type: "string" }],
};
const IS_REGISTERED_WITH_ADDRESS_ABI = {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "registered", type: "bool" }],
};
const IS_REGISTERED_NO_ARG_ABI = {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "registered", type: "bool" }],
};
const GET_ROLE_SUMMARY_WITH_ADDRESS_ABI = {
    type: "function",
    name: "getRoleSummary",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
    ],
};
const GET_REGISTRATION_DETAILS_WITH_ADDRESS_ABI = {
    type: "function",
    name: "getRegistrationDetails",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
        { name: "added_by", type: "address" },
        { name: "added_at", type: "uint256" },
    ],
};
const GET_REGISTRATION_DETAILS_NO_ARG_ABI = {
    type: "function",
    name: "getRegistrationDetails",
    stateMutability: "view",
    inputs: [],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
        { name: "added_by", type: "address" },
        { name: "added_at", type: "uint256" },
    ],
};
const GET_QUIZ_STATISTICS_ABI = {
    type: "function",
    name: "get_quiz_statistics",
    stateMutability: "view",
    inputs: [{ name: "_quiz_id", type: "uint256" }],
    outputs: [
        { name: "respondent_count", type: "uint256" },
        { name: "respondent_limit", type: "uint256" },
        { name: "correct_count", type: "uint256" },
        { name: "incorrect_count", type: "uint256" },
        { name: "pending_count", type: "uint256" },
        { name: "lifecycle", type: "uint8" },
        { name: "is_payment", type: "bool" },
    ],
};
const GET_QUIZ_LIFECYCLE_LABEL_ABI = {
    type: "function",
    name: "get_quiz_lifecycle_label",
    stateMutability: "view",
    inputs: [{ name: "quiz_id", type: "uint256" }],
    outputs: [{ name: "lifecycle_label", type: "string" }],
};
const GET_REVIEW_REQUIRED_ABI = {
    type: "function",
    name: "get_review_required",
    stateMutability: "view",
    inputs: [{ name: "_quiz_id", type: "uint256" }, { name: "student", type: "address" }],
    outputs: [{ name: "required", type: "bool" }],
};
const GET_REVIEW_QUIZ_IDS_ABI = {
    type: "function",
    name: "get_review_quiz_ids",
    stateMutability: "view",
    inputs: [{ name: "student", type: "address" }],
    outputs: [{ name: "quiz_ids", type: "uint256[]" }],
};
const CREATE_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "create_attendance_session",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }, { name: "attendance_code", type: "string" }],
    outputs: [{ name: "session_id", type: "uint256" }],
};
const CLOSE_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "close_attendance_session",
    stateMutability: "nonpayable",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [{ name: "closed", type: "bool" }],
};
const MARK_ATTENDANCE_ABI = {
    type: "function",
    name: "mark_attendance",
    stateMutability: "nonpayable",
    inputs: [{ name: "session_id", type: "uint256" }, { name: "attendance_code", type: "string" }],
    outputs: [{ name: "marked", type: "bool" }],
};
const GET_ATTENDANCE_SESSION_COUNT_ABI = {
    type: "function",
    name: "get_attendance_session_count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
};
const GET_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "get_attendance_session",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [
        { name: "id", type: "uint256" },
        { name: "label", type: "string" },
        { name: "created_at", type: "uint256" },
        { name: "closed_at", type: "uint256" },
        { name: "is_active", type: "bool" },
        { name: "attendee_count", type: "uint256" },
    ],
};
const HAS_ATTENDED_ABI = {
    type: "function",
    name: "has_attended",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }, { name: "attendee", type: "address" }],
    outputs: [{ name: "attended", type: "bool" }],
};
const GET_ATTENDANCE_ATTENDEES_ABI = {
    type: "function",
    name: "get_attendance_attendees",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [{ name: "attendees", type: "address[]" }],
};
const RECORD_ANNOUNCEMENT_HASH_ABI = {
    type: "function",
    name: "record_announcement_hash",
    stateMutability: "nonpayable",
    inputs: [{ name: "content_hash", type: "bytes32" }, { name: "tag", type: "string" }],
    outputs: [{ name: "record_id", type: "uint256" }],
};
const RECORD_SUPERCHAT_ABI = {
    type: "function",
    name: "record_superchat",
    stateMutability: "nonpayable",
    inputs: [
        { name: "message_id", type: "string" },
        { name: "message_hash", type: "bytes32" },
        { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "record_id", type: "uint256" }],
};
const AWARD_BADGE_ABI = {
    type: "function",
    name: "award_badge",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }, { name: "badge_key", type: "bytes32" }],
    outputs: [{ name: "awarded", type: "bool" }],
};
const HAS_BADGE_ABI = {
    type: "function",
    name: "has_badge",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "badge_key", type: "bytes32" }],
    outputs: [{ name: "granted", type: "bool" }],
};
const GET_STUDENT_ANSWER_DETAIL_ABI = {
    type: "function",
    name: "get_student_answer_detail",
    stateMutability: "view",
    inputs: [
        { name: "quiz_id", type: "uint256" },
        { name: "student", type: "address" },
    ],
    outputs: [
        { name: "answer_text", type: "string" },
        { name: "state", type: "uint256" },
        { name: "answer_time", type: "uint256" },
        { name: "reward", type: "uint256" },
        { name: "result", type: "bool" },
        { name: "submitted", type: "bool" },
        { name: "attempt_count", type: "uint256" },
    ],
};
const LEGACY_GET_STUDENT_ANSWER_DETAIL_ABI = {
    type: "function",
    name: "get_student_answer_detail",
    stateMutability: "view",
    inputs: [
        { name: "quiz_id", type: "uint256" },
        { name: "student", type: "address" },
    ],
    outputs: [
        { name: "answer_text", type: "string" },
        { name: "state", type: "uint256" },
        { name: "answer_time", type: "uint256" },
        { name: "reward", type: "uint256" },
        { name: "result", type: "bool" },
        { name: "submitted", type: "bool" },
    ],
};
const GET_REVEALED_CORRECT_ANSWER_ABI = {
    type: "function",
    name: "get_revealed_correct_answer",
    stateMutability: "view",
    inputs: [{ name: "quiz_id", type: "uint256" }],
    outputs: [
        { name: "correct_answer", type: "string" },
        { name: "visible", type: "bool" },
    ],
};
const PAYMENT_OF_REWARD_MANUAL_ABI = {
    type: "function",
    name: "payment_of_reward_manual",
    stateMutability: "nonpayable",
    inputs: [
        { name: "quiz_id", type: "uint256" },
        { name: "confirm_answer", type: "string" },
        { name: "correct_students", type: "address[]" },
        { name: "incorrect_students", type: "address[]" },
        { name: "finalize_payment", type: "bool" },
    ],
    outputs: [{ name: "correct_count", type: "uint256" }],
};
const CREATE_QUIZ_EVENT_ABI = {
    type: "event",
    name: "Create_quiz",
    anonymous: false,
    inputs: [
        { indexed: true, name: "_sender", type: "address" },
        { indexed: true, name: "id", type: "uint256" },
    ],
};

const ROLE_CODE = {
    NONE: 0,
    STUDENT: 1,
    TEACHER: 2,
};

function normalizeRole(roleCode, roleLabel = "") {
    const numericRole = Number(roleCode);
    if (numericRole === ROLE_CODE.TEACHER || String(roleLabel).toLowerCase() === "teacher") {
        return { code: ROLE_CODE.TEACHER, key: "teacher", label: "教員" };
    }
    if (numericRole === ROLE_CODE.STUDENT || String(roleLabel).toLowerCase() === "student") {
        return { code: ROLE_CODE.STUDENT, key: "student", label: "学生" };
    }
    return { code: ROLE_CODE.NONE, key: "guest", label: "未登録" };
}

function isObjectLike(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toQuizAllDataArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        result.content,
        Number(result.answer_type),
        result.answer_data,
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
        Number(result.state),
    ];
}

function toQuizArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        result.content,
        result.answer_data,
        Number(result.create_time_epoch),
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
    ];
}

function toQuizSimpleArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
        Number(result.state),
        Boolean(result.is_payment),
    ];
}

function withQuizSourceMetadata(quizArray, sourceAddress) {
    const next = Array.isArray(quizArray) ? [...quizArray] : quizArray;
    if (Array.isArray(next)) {
        const sourceIndex = next.length <= 12 ? 12 : next.length;
        next[sourceIndex] = sourceAddress;
        next.sourceAddress = sourceAddress;
    }
    return next;
}

class Contracts_MetaMask {
    isMobileDevice() {
        if (typeof navigator === "undefined") return false;
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
    }

    isAppleMobileDevice() {
        if (typeof navigator === "undefined") return false;
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    }

    getQuizReadChunkSize() {
        if (this.isAppleMobileDevice()) return 2;
        if (this.isMobileDevice()) return 3;
        return 6;
    }

    async copyTextToClipboard(value) {
        if (!value) return false;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(String(value));
                return true;
            }
        } catch (error) {
            console.error("Failed to copy text with clipboard API", error);
        }

        try {
            const input = document.createElement("textarea");
            input.value = String(value);
            input.setAttribute("readonly", "readonly");
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.focus();
            input.select();
            const copied = document.execCommand("copy");
            document.body.removeChild(input);
            return copied;
        } catch (error) {
            console.error("Failed to copy text with execCommand", error);
            return false;
        }
    }

    async providerRequestWithRetry(provider, payload, attempts = 3, baseDelayMs = 500) {
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return await provider.request(payload);
            } catch (error) {
                lastError = error;
                if (!isProviderLimitError(error) || attempt >= attempts - 1) {
                    throw error;
                }
                await sleep(baseDelayMs * (attempt + 1));
            }
        }
        throw lastError;
    }

    parseRpcNonce(value) {
        if (typeof value === "number") return value;
        if (typeof value === "bigint") return Number(value);
        if (typeof value === "string" && /^0x/i.test(value)) {
            return Number.parseInt(value, 16);
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    async getProviderNonce(provider, account, blockTag = "pending") {
        const rawNonce = await this.providerRequestWithRetry(provider, {
            method: "eth_getTransactionCount",
            params: [account, blockTag],
        }, 3, 300);
        const nonce = this.parseRpcNonce(rawNonce);
        if (!Number.isInteger(nonce) || nonce < 0) {
            throw new Error(`${blockTag}_nonce_unavailable`);
        }
        return nonce;
    }

    async getPendingNonce(provider, account) {
        return await this.getProviderNonce(provider, account, "pending");
    }

    rememberWriteNonce(account, nonce) {
        if (!this.lastWriteNonceByAccount) {
            this.lastWriteNonceByAccount = {};
        }
        this.lastWriteNonceByAccount[this.normalizeAddress(account)] = nonce;
    }

    getLastWriteNonce(account) {
        const nonce = this.lastWriteNonceByAccount?.[this.normalizeAddress(account)];
        return Number.isInteger(nonce) ? nonce : null;
    }

    rememberConfirmedNextNonce(account, nonce) {
        if (!Number.isInteger(nonce) || nonce < 0) return;
        if (!this.confirmedNextNonceByAccount) {
            this.confirmedNextNonceByAccount = {};
        }
        const key = this.normalizeAddress(account);
        const current = this.confirmedNextNonceByAccount[key];
        this.confirmedNextNonceByAccount[key] = Number.isInteger(current)
            ? Math.max(current, nonce)
            : nonce;
    }

    getConfirmedNextNonce(account) {
        const nonce = this.confirmedNextNonceByAccount?.[this.normalizeAddress(account)];
        return Number.isInteger(nonce) ? nonce : null;
    }

    async waitForPendingNonceAdvance(provider, account, usedNonce, attempts = 10, baseDelayMs = 500) {
        if (!Number.isInteger(usedNonce) || usedNonce < 0) return true;
        const expectedNextNonce = usedNonce + 1;
        let pendingNonce = null;
        let latestNonce = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            pendingNonce = await this.getPendingNonce(provider, account);
            latestNonce = await this.getProviderNonce(provider, account, "latest");
            if (pendingNonce >= expectedNextNonce || latestNonce >= expectedNextNonce) {
                this.rememberConfirmedNextNonce(account, expectedNextNonce);
                return true;
            }
            await sleep(baseDelayMs * (attempt + 1));
        }
        throw new Error(`pending_nonce_not_advanced:${usedNonce}:${expectedNextNonce}:${pendingNonce}:${latestNonce}`);
    }

    async waitForLastWriteNonceAdvance(account, attempts = 10, baseDelayMs = 500) {
        const provider = await this.getEthereumProviderReady();
        if (!provider) {
            throw new Error("ethereum_not_found");
        }
        const usedNonce = this.getLastWriteNonce(account);
        return await this.waitForPendingNonceAdvance(provider, account, usedNonce, attempts, baseDelayMs);
    }

    async ensureWalletWriteReady(provider, fallbackAccount = "") {
        const hasFreshCachedAccount = Boolean(readAccountCacheValue) && Date.now() < walletConnectionReadyUntil;
        if (hasFreshCachedAccount && !this.isMobileDevice()) {
            return readAccountCacheValue;
        }

        const accounts = await this.providerRequestWithRetry(provider, { method: "eth_requestAccounts" }, 2, 700);
        const nextAccount = Array.isArray(accounts) && accounts[0]
            ? String(accounts[0])
            : String(fallbackAccount || "");
        if (nextAccount) {
            setReadAccountCacheValue(nextAccount);
        }
        if (this.isMobileDevice()) {
            await sleep(250);
        }
        return nextAccount;
    }

    getAccessControlAddresses() {
        return [class_room_address].filter(
            (address, index, list) => Boolean(address) && list.indexOf(address) === index
        );
    }

    getAccessControlAddress() {
        return this.getAccessControlAddresses()[0] || class_room_address;
    }

    normalizeQuizAddress(address = "") {
        return this.normalizeAddress(address || quiz_address);
    }

    resolveQuizAddress(address = "") {
        const normalized = this.normalizeQuizAddress(address);
        const allQuizAddresses = [quiz_address, ...(legacy_quiz_addresses || [])].filter(Boolean);
        return allQuizAddresses.find((item) => this.normalizeAddress(item) === normalized) || quiz_address;
    }

    getQuizReadAddresses() {
        return [quiz_address, ...(legacy_quiz_addresses || [])].filter(
            (address, index, list) => Boolean(address) && list.findIndex((item) => this.normalizeAddress(item) === this.normalizeAddress(address)) === index
        );
    }

    async getQuizInventory(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && Array.isArray(quizInventoryCacheMemory) && now - quizInventoryCacheFetchedAt < QUIZ_INVENTORY_CACHE_TTL_MS) {
            return quizInventoryCacheMemory;
        }

        const persistedCache = readTimedCache(QUIZ_INVENTORY_PERSIST_KEY);
        const persistedEntries = Array.isArray(persistedCache?.value) ? persistedCache.value : [];
        if (
            !forceRefresh
            && persistedEntries.length > 0
            && now - Number(persistedCache?.fetchedAt || 0) < QUIZ_INVENTORY_PERSIST_TTL_MS
        ) {
            quizInventoryCacheMemory = persistedEntries;
            quizInventoryCacheFetchedAt = Number(persistedCache.fetchedAt || now);
            return quizInventoryCacheMemory;
        }

        if (!forceRefresh && quizInventoryCachePromise) {
            return quizInventoryCachePromise;
        }

        const addresses = this.getQuizReadAddresses();
        quizInventoryCachePromise = (async () => {
            const lengths = await Promise.allSettled(
                addresses.map(async (address) => ({
                    address,
                    length: Number(await this.get_quiz_lenght(address)),
                }))
            );

            const inventory = [];
            lengths
                .filter((result) => result.status === "fulfilled")
                .map((result) => result.value)
                .forEach(({ address, length }) => {
                    for (let id = length - 1; id >= 0; id -= 1) {
                        inventory.push({ id, address });
                    }
                });

            if (inventory.length === 0) {
                const fallbackInventory = Array.isArray(quizInventoryCacheMemory) && quizInventoryCacheMemory.length > 0
                    ? quizInventoryCacheMemory
                    : persistedEntries;
                if (fallbackInventory.length > 0) {
                    quizInventoryCacheMemory = fallbackInventory;
                    quizInventoryCacheFetchedAt = Date.now();
                    return fallbackInventory;
                }
            }

            quizInventoryCacheMemory = inventory;
            quizInventoryCacheFetchedAt = Date.now();
            writeTimedCache(QUIZ_INVENTORY_PERSIST_KEY, {
                value: inventory,
                fetchedAt: quizInventoryCacheFetchedAt,
            });
            return inventory;
        })();

        try {
            return await quizInventoryCachePromise;
        } finally {
            quizInventoryCachePromise = null;
        }
    }

    getQuizWindowFromInventory(inventory, start, end) {
        const total = Array.isArray(inventory) ? inventory.length : 0;
        const safeStart = Math.max(0, Math.min(total, Number(start || 0)));
        const safeEnd = Math.max(0, Math.min(total, Number(end || 0)));
        return inventory.slice(total - safeStart, total - safeEnd);
    }

    async readAccessControlContract({ account, abi, functionName, args = [], preferTruthy = false, acceptResult } = {}) {
        const addresses = this.getAccessControlAddresses();
        let lastError = null;

        for (const address of addresses) {
            try {
                const result = await publicClient.readContract({
                    account: normalizeReadAccount(account),
                    address,
                    abi,
                    functionName,
                    args,
                });

                if (typeof acceptResult === "function") {
                    if (acceptResult(result, address)) return result;
                    continue;
                }

                if (!preferTruthy || result === true) {
                    return result;
                }
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError) {
            throw lastError;
        }
        throw new Error(`access_control_call_failed:${functionName}`);
    }

    async readAccessControlAddressList({ account, abi, functionName, args = [] } = {}) {
        const addresses = this.getAccessControlAddresses();
        const merged = [];
        let lastError = null;

        for (const address of addresses) {
            try {
                const result = await publicClient.readContract({
                    account: normalizeReadAccount(account),
                    address,
                    abi,
                    functionName,
                    args,
                });

                if (!Array.isArray(result)) {
                    continue;
                }

                result.forEach((item) => {
                    const normalizedItem = this.normalizeAddress(item);
                    if (!normalizedItem) return;
                    if (!merged.some((current) => this.normalizeAddress(current) === normalizedItem)) {
                        merged.push(item);
                    }
                });
            } catch (error) {
                lastError = error;
            }
        }

        if (merged.length > 0) {
            return merged;
        }

        if (lastError) {
            throw lastError;
        }

        return [];
    }

    normalizeAddress(address) {
        return String(address || "").toLowerCase();
    }

    isBootstrapTeacherAddress(address) {
        const normalizedTarget = this.normalizeAddress(address);
        if (!normalizedTarget) return false;
        return (bootstrap_teacher_addresses || []).some(
            (teacherAddress) => this.normalizeAddress(teacherAddress) === normalizedTarget
        );
    }

    formatShortAddress(address) {
        const normalized = String(address || "");
        if (normalized.length < 10) return normalized;
        return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
    }

    getEthereumProvider() {
        return resolveEthereumProvider() || ethereum || null;
    }

    get_last_known_address() {
        if (readAccountCacheValue) return String(readAccountCacheValue);
        if (typeof localStorage === "undefined") return "";
        try {
            return String(localStorage.getItem(LAST_KNOWN_WALLET_ADDRESS_KEY) || "");
        } catch (error) {
            return "";
        }
    }

    async getEthereumProviderReady() {
        return await waitForEthereumProvider(2500);
    }

    async getEthereumProviderForRead() {
        return this.getEthereumProvider() || await waitForEthereumProvider(350);
    }

    get_read_account_nonblocking() {
        return readAccountCacheValue ? String(readAccountCacheValue) : "";
    }

    async get_read_account_cached(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && readAccountCacheValue && now - readAccountCacheFetchedAt < READ_ACCOUNT_CACHE_TTL_MS) {
            return readAccountCacheValue;
        }

        if (!forceRefresh && readAccountCachePromise) {
            return readAccountCachePromise;
        }

        readAccountCachePromise = (async () => {
            const fallbackAccount = this.get_last_known_address();
            try {
                const provider = await this.getEthereumProviderForRead();
                if (!provider) {
                    setReadAccountCacheValue(fallbackAccount);
                    return fallbackAccount;
                }

                const accounts = await this.providerRequestWithRetry(provider, { method: "eth_accounts" }, 2, 300);
                const nextAccount = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : String(fallbackAccount || "");
                setReadAccountCacheValue(nextAccount);
                return nextAccount;
            } catch (error) {
                console.log(error);
                setReadAccountCacheValue(fallbackAccount);
                return fallbackAccount;
            } finally {
                readAccountCachePromise = null;
            }
        })();

        return readAccountCachePromise;
    }

    invalidateQuizInventoryCache() {
        quizInventoryCacheMemory = null;
        quizInventoryCacheFetchedAt = 0;
        quizInventoryCachePromise = null;
        deleteTimedCache(QUIZ_INVENTORY_PERSIST_KEY);
    }

    getQuizSimpleCacheEntry(cacheKey) {
        const now = Date.now();
        const memoryEntry = quizSimpleCacheMemory.get(cacheKey);
        if (memoryEntry && now - Number(memoryEntry.fetchedAt || 0) < QUIZ_SIMPLE_CACHE_TTL_MS) {
            return memoryEntry.value;
        }

        const persistedStore = readQuizSimpleCacheStore();
        const persistedEntry = persistedStore?.[cacheKey];
        if (persistedEntry && now - Number(persistedEntry.fetchedAt || 0) < QUIZ_SIMPLE_CACHE_TTL_MS) {
            quizSimpleCacheMemory.set(cacheKey, persistedEntry);
            return persistedEntry.value;
        }

        return null;
    }

    setQuizSimpleCacheEntry(sourceAddress, quizId, account, value) {
        const cacheKey = buildQuizSimpleCacheKey(sourceAddress, quizId, account);
        const payload = {
            value: Array.isArray(value) ? [...value] : value,
            fetchedAt: Date.now(),
        };
        quizSimpleCacheMemory.set(cacheKey, payload);
        const persistedStore = readQuizSimpleCacheStore();
        persistedStore[cacheKey] = payload;
        writeQuizSimpleCacheStore(persistedStore);
    }

    invalidateQuizSimpleCache(sourceAddress = "", quizId = null) {
        const normalizedSource = String(sourceAddress || "").toLowerCase();
        const normalizedId = quizId == null ? null : Number(quizId);
        const shouldDelete = (cacheKey) => {
            const [cachedSource = "", cachedId = ""] = String(cacheKey || "").split(":");
            if (normalizedSource && cachedSource !== normalizedSource) return false;
            if (normalizedId != null && Number(cachedId) !== normalizedId) return false;
            return true;
        };

        Array.from(quizSimpleCacheMemory.keys()).forEach((cacheKey) => {
            if (shouldDelete(cacheKey)) {
                quizSimpleCacheMemory.delete(cacheKey);
            }
        });

        const persistedStore = readQuizSimpleCacheStore();
        Object.keys(persistedStore).forEach((cacheKey) => {
            if (shouldDelete(cacheKey)) {
                delete persistedStore[cacheKey];
            }
        });
        writeQuizSimpleCacheStore(persistedStore);
    }

    async writeContractDirect({ account, address, abi, functionName, args = [], gasOverride = null }) {
        const provider = await this.getEthereumProviderReady();
        if (!provider || !walletClient) {
            throw new Error("ethereum_not_found");
        }

        const writeAccount = await this.ensureWalletWriteReady(provider, account);
        if (!writeAccount) {
            throw new Error("wallet_not_connected");
        }

        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const writeConfig = {
                    account: writeAccount,
                    address,
                    abi,
                    functionName,
                    args,
                    chain: amoy,
                };

                const gasFloor = gasOverride && BigInt(gasOverride) > 0n ? BigInt(gasOverride) : 0n;
                try {
                    const estimatedGas = await publicClient.estimateContractGas(writeConfig);
                    if (estimatedGas && estimatedGas > 0n) {
                        const isRewardPayoutCall = ["payment_of_reward", "payment_of_reward_manual"].includes(String(functionName || ""));
                        const multiplierNumerator = isRewardPayoutCall
                            ? (this.isAppleMobileDevice() ? 18n : 16n)
                            : (this.isAppleMobileDevice() ? 14n : 12n);
                        const bufferedGas = (estimatedGas * multiplierNumerator + 9n) / 10n;
                        writeConfig.gas = gasFloor > bufferedGas ? gasFloor : bufferedGas;
                    } else if (gasFloor > 0n) {
                        writeConfig.gas = gasFloor;
                    }
                } catch (gasError) {
                    console.log(gasError);
                    if (gasFloor > 0n) {
                        writeConfig.gas = gasFloor;
                    }
                }

                // Fee estimation override has been removed to rely on MetaMask's default.

                const pendingNonce = await this.getPendingNonce(provider, writeAccount);
                let latestNonce = null;
                try {
                    latestNonce = await this.getProviderNonce(provider, writeAccount, "latest");
                } catch (nonceError) {
                    console.log(nonceError);
                }
                const confirmedNextNonce = this.getConfirmedNextNonce(writeAccount);
                const nonceCandidates = [
                    pendingNonce,
                    latestNonce,
                    confirmedNextNonce,
                ].filter((nonce) => Number.isInteger(nonce) && nonce >= 0);
                const writeNonce = Math.max(...nonceCandidates);
                writeConfig.nonce = writeNonce;
                this.rememberWriteNonce(writeAccount, writeNonce);

                return await walletClient.writeContract(writeConfig);
            } catch (error) {
                lastError = error;
                if (!isProviderLimitError(error) || attempt >= 2) {
                    throw error;
                }
                await sleep(700 * (attempt + 1));
            }
        }

        throw lastError || new Error("write_contract_failed");
    }

    async add_watch_asset(address, symbol, decimals = 18) {
        const provider = await this.getEthereumProviderReady();
        if (!provider || !address) return false;
        try {
            await this.ensure_amoy_network();
            const added = await this.providerRequestWithRetry(provider, {
                method: "wallet_watchAsset",
                params: {
                    type: "ERC20",
                    options: {
                        address,
                        symbol,
                        decimals,
                    },
                },
            }, 2, 600);
            return { added: Boolean(added), fallback: null, address, symbol, decimals };
        } catch (error) {
            console.error("Failed to add watch asset", error);
            const copied = await this.copyTextToClipboard(address);
            const unsupported =
                error?.code === -32601
                || /wallet_watchasset|unsupported|not support|not implemented/i.test(String(error?.message || ""));

            if (this.isMobileDevice() || unsupported) {
                return {
                    added: false,
                    fallback: "manual",
                    copied,
                    address,
                    symbol,
                    decimals,
                };
            }

            throw error;
        }
    }

    getAmoyRpcCandidates() {
        return Array.from(new Set([
            "https://api.avax-test.network/ext/bc/C/rpc",
            ...(amoy.rpcUrls?.default?.http || []),
        ].filter(Boolean)));
    }

    getAmoyAddChainParams(preferredRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc") {
        const orderedRpcUrls = Array.from(new Set([
            preferredRpcUrl,
            ...this.getAmoyRpcCandidates(),
        ].filter(Boolean)));
        return {
            chainId: `0x${amoy.id.toString(16)}`,
            chainName: amoy.name,
            nativeCurrency: amoy.nativeCurrency,
            rpcUrls: orderedRpcUrls,
            blockExplorerUrls: amoy.blockExplorers?.default?.url ? [amoy.blockExplorers.default.url] : [],
        };
    }

    shouldRefreshAmoyRpc(error) {
        const message = String(error?.message || "").toLowerCase();
        return message.includes("rpc")
            || message.includes("network connection")
            || message.includes("could not fetch chain id")
            || message.includes("failed to fetch")
            || message.includes("internal json-rpc error")
            || message.includes("avalanche-fujiに接続できません")
            || message.includes("rpcを更新");
    }

    async read_chain_id_with_provider(provider) {
        if (!provider) return null;
        try {
            const chainIdRaw = await this.providerRequestWithRetry(provider, { method: "eth_chainId" }, 3, 350);
            if (chainIdRaw == null || chainIdRaw === "") return null;
            if (typeof chainIdRaw === "string" && /^0x/i.test(chainIdRaw)) {
                const parsedHex = Number.parseInt(chainIdRaw, 16);
                const nextChainId = Number.isFinite(parsedHex) ? parsedHex : null;
                setChainIdCacheValue(nextChainId);
                return nextChainId;
            }
            const parsedNumber = Number(chainIdRaw);
            const nextChainId = Number.isFinite(parsedNumber) ? parsedNumber : null;
            setChainIdCacheValue(nextChainId);
            return nextChainId;
        } catch (error) {
            console.error("Failed to read chain id with provider", error);
            return null;
        }
    }

    async get_chain_id() {
        const provider = await this.getEthereumProviderForRead();
        return await this.read_chain_id_with_provider(provider);
    }

    async request_wallet_access() {
        const provider = await this.getEthereumProviderReady();
        if (!provider) return [];
        try {
            const accounts = await this.providerRequestWithRetry(provider, { method: "eth_requestAccounts" }, 2, 700);
            const nextAccount = Array.isArray(accounts) && accounts[0] ? accounts[0] : "";
            setReadAccountCacheValue(nextAccount);
            return accounts;
        } catch (error) {
            console.error("Failed to request wallet access", error);
            throw error;
        }
    }

    async waitForReceiptWithRetry(hash, attempts = 4) {
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return await publicClient.waitForTransactionReceipt({
                    hash,
                    pollingInterval: 1200,
                    timeout: 35000 + attempt * 15000,
                    retryCount: 2,
                });
            } catch (error) {
                lastError = error;
                if (attempt < attempts - 1) {
                    await sleep(1500 * (attempt + 1));
                }
            }
        }
        throw lastError;
    }

    async get_transaction_receipt_status(hash) {
        const normalizedHash = String(hash || "").trim();
        if (!normalizedHash) return "";
        try {
            if (typeof publicClient.getTransactionReceipt === "function") {
                const receipt = await publicClient.getTransactionReceipt({ hash: normalizedHash });
                return String(receipt?.status || "");
            }
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: normalizedHash,
                pollingInterval: 800,
                timeout: 4000,
                retryCount: 0,
            });
            return String(receipt?.status || "");
        } catch (error) {
            console.log(error);
            return "";
        }
    }

    async verify_answer_submission(account, id, answer, sourceAddress = "") {
        try {
            const detail = await this.get_student_answer_detail(account, id, sourceAddress);
            const normalizedAnswer = String(answer || "").trim();
            const normalizedSavedAnswer = String(detail?.answerText || "").trim();
            const answerTime = Number(detail?.answerTime || 0);
            const submittedRecently = answerTime > 0 && Math.abs(Math.floor(Date.now() / 1000) - answerTime) <= 300;
            if (detail?.submitted && (normalizedSavedAnswer === normalizedAnswer || submittedRecently)) {
                return true;
            }
        } catch (error) {
            console.log(error);
        }
        return false;
    }

    async ensure_wallet_connected() {
        if (readAccountCacheValue && Date.now() < walletConnectionReadyUntil) {
            return [readAccountCacheValue];
        }

        const provider = await this.getEthereumProviderReady();
        if (!provider) {
            return [];
        }

        try {
            const existingAccounts = await this.providerRequestWithRetry(provider, { method: "eth_accounts" }, 2, 350);
            if (Array.isArray(existingAccounts) && existingAccounts.length > 0) {
                setReadAccountCacheValue(existingAccounts[0] || "");
                return existingAccounts;
            }
        } catch (error) {
            console.error("Failed to read existing wallet accounts", error);
        }

        try {
            const requestedAccounts = await this.request_wallet_access();
            if (Array.isArray(requestedAccounts) && requestedAccounts.length > 0) {
                setReadAccountCacheValue(requestedAccounts[0] || "");
                return requestedAccounts;
            }
        } catch (error) {
            throw error;
        }

        for (let attempt = 0; attempt < 4; attempt += 1) {
            await sleep(350 * (attempt + 1));
            const address = await this.get_read_account_cached(true);
            if (address) {
                setReadAccountCacheValue(address);
                return [address];
            }
        }

        return [];
    }

    async getConnectedWriteAccount() {
        let account = await this.get_read_account_cached();
        if (account) {
            setReadAccountCacheValue(account);
            return account;
        }

        const connectedAccounts = await this.ensure_wallet_connected();
        account = Array.isArray(connectedAccounts) && connectedAccounts[0]
            ? String(connectedAccounts[0])
            : "";
        if (account) {
            setReadAccountCacheValue(account);
        }
        return account;
    }

    async wait_for_amoy_confirmation(provider, attempts = 8, delayMs = 600) {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const chainId = await this.read_chain_id_with_provider(provider);
            if (chainId === amoy.id) {
                return chainId;
            }
            await sleep(delayMs);
        }
        return null;
    }
    async add_token_wallet() {
        if (!this.getEthereumProvider()) return;
        try {
            const tokenSymbol = await this.get_token_symbol();
            await this.add_watch_asset(token_address, tokenSymbol || "TOKEN", 18);
        } catch (error) {
            console.error("Failed to add token to wallet", error);
        }
    }

    async add_ttt_token_wallet() {
        if (!ttt_token_address) {
            throw new Error("ttt_token_address_missing");
        }
        return this.add_watch_asset(ttt_token_address, "TTT", 18);
    }

    async get_token_symbol() {
        try {
            if (this.getEthereumProvider()) {
                return await token.read.symbol();
            }
        } catch (err) {
            console.log(err);
        }
        return "TOKEN";
    }

    async change_network() {
        const provider = await this.getEthereumProviderReady();
        if (!provider) return false;
        try {
            await this.providerRequestWithRetry(provider, {
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${amoy.id.toString(16)}` }],
            }, 2, 700);
            return true;
        } catch (e) {
            //userがrejectした場合
            console.log(e);
            throw e;
        }
    }
    async add_network() {
        const provider = await this.getEthereumProviderReady();
        if (!provider) return false;
        let lastError = null;
        for (const rpcUrl of this.getAmoyRpcCandidates()) {
            try {
                await this.providerRequestWithRetry(provider, {
                    method: "wallet_addEthereumChain",
                    params: [this.getAmoyAddChainParams(rpcUrl)],
                }, 2, 800);
                return true;
            } catch (e) {
                lastError = e;
                console.log(e);
                if (e?.code === 4001) {
                    throw e;
                }
            }
        }
        throw lastError || new Error("avalanche-fuji_network_add_failed");
    }

    async ensure_amoy_network() {
        const provider = await this.getEthereumProviderReady();
        if (!provider) return false;

        await this.ensure_wallet_connected();

        if (Date.now() < amoyReadyUntil) {
            return true;
        }

        const currentChainId = getCachedChainId() ?? await this.read_chain_id_with_provider(provider);
        if (currentChainId === amoy.id) {
            amoyReadyUntil = Date.now() + AMOY_READY_CACHE_TTL_MS;
            return true;
        }

        try {
            const changed = await this.change_network();
            if (changed) {
                amoyReadyUntil = Date.now() + AMOY_READY_CACHE_TTL_MS;
            }
            return changed;
        } catch (error) {
            if (error?.code === 4902 || String(error?.message || "").includes("4902") || this.shouldRefreshAmoyRpc(error)) {
                const recheckedChainId = await this.read_chain_id_with_provider(provider);
                if (recheckedChainId === amoy.id) {
                    amoyReadyUntil = Date.now() + AMOY_READY_CACHE_TTL_MS;
                    return true;
                }
                await this.add_network();
                const afterAddConfirmation = await this.wait_for_amoy_confirmation(provider, 6, 700);
                if (afterAddConfirmation === amoy.id) {
                    amoyReadyUntil = Date.now() + AMOY_READY_CACHE_TTL_MS;
                    return true;
                }
                await this.change_network();
                const confirmed = (await this.wait_for_amoy_confirmation(provider, 6, 700)) === amoy.id;
                if (confirmed) {
                    amoyReadyUntil = Date.now() + AMOY_READY_CACHE_TTL_MS;
                }
                return confirmed;
            }
            if (error?.code === 4001) {
                return false;
            }
            throw error;
        }
    }

    async add_or_switch_amoy_network() {
        const provider = await this.getEthereumProviderReady();
        if (!provider) {
            throw new Error("metamask_not_found");
        }

        await this.ensure_wallet_connected();

        let currentChainId = await this.read_chain_id_with_provider(provider);
        if (currentChainId == null) {
            await sleep(400);
            currentChainId = await this.read_chain_id_with_provider(provider);
        }
        if (currentChainId === amoy.id) {
            return { changed: false, chainId: currentChainId };
        }

        try {
            await this.change_network();
        } catch (error) {
            if (error?.code === 4001) {
                throw error;
            }

            const shouldAddNetwork =
                error?.code === 4902
                || String(error?.message || "").includes("4902")
                || String(error?.message || "").toLowerCase().includes("unrecognized chain")
                || this.shouldRefreshAmoyRpc(error);

            if (!shouldAddNetwork) {
                throw error;
            }

            const recheckedChainId = await this.read_chain_id_with_provider(provider);
            if (recheckedChainId === amoy.id) {
                return { changed: false, chainId: recheckedChainId };
            }

            await this.add_network();
            const chainIdAfterAdd = await this.wait_for_amoy_confirmation(provider, 6, 700);
            if (chainIdAfterAdd !== amoy.id) {
                await this.change_network();
            }
        }

        const nextChainId = await this.wait_for_amoy_confirmation(provider, 8, 700);
        if (nextChainId !== amoy.id) {
            throw new Error("avalanche-fuji_network_switch_failed");
        }

        return { changed: true, chainId: nextChainId };
    }

    async get_token_balance(address) {
        try {
            const normalizedAddress = checksumAddress(String(address || "").trim());
            const balance = await retryReadContractBalance(
                () => publicClient.readContract({
                    address: token_address,
                    abi: token_abi,
                    functionName: "balanceOf",
                    args: [normalizedAddress],
                }),
                4
            );
            return Number(balance) / 10 ** 18;
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async get_ttt_balance(address) {
        try {
            if (!ttt_token_address) return 0;
            const normalizedAddress = checksumAddress(String(address || "").trim());
            const balance = await retryReadContractBalance(
                () => publicClient.readContract({
                    address: ttt_token_address,
                    abi: token_abi,
                    functionName: "balanceOf",
                    args: [normalizedAddress],
                }),
                4
            );
            return Number(balance) / 10 ** 18;
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async get_pol_balance(address) {
        try {
            const normalizedAddress = checksumAddress(String(address || "").trim());
            const balance = await retryReadContractBalance(
                () => publicClient.getBalance({
                    address: normalizedAddress,
                }),
                4
            );
            return Number(balance) / 10 ** 18;
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async readTokenAllowance(ownerAddress, spenderAddress, contractAddress = token_address) {
        try {
            return await publicClient.readContract({
                account: normalizeReadAccount(ownerAddress),
                address: contractAddress,
                abi: token_abi,
                functionName: "allowance",
                args: [
                    checksumAddress(String(ownerAddress || "").trim()),
                    checksumAddress(String(spenderAddress || "").trim()),
                ],
            });
        } catch (error) {
            console.log(error);
            return 0n;
        }
    }

    async get_address() {
        try {
            const account = await this.get_read_account_cached();
            if (account) return account;
        } catch (err) {
            console.log(err);
            return "";
        }
        return "";
    }

    async get_token_history(address, start, end) {
        try {
            const account = await this.get_address();
            const normalizedAccount = normalizeReadAccount(account);
            const indexes = [];

            if (start <= end) {
                for (let i = start; i < end; i += 1) {
                    indexes.push(i);
                }
            } else {
                for (let i = start - 1; i >= end; i -= 1) {
                    indexes.push(i);
                }
            }

            const settled = await Promise.allSettled(
                indexes.map((historyIndex) => publicClient.readContract({
                    account: normalizedAccount,
                    address: token_address,
                    abi: token_abi,
                    functionName: "get_user_history",
                    args: [address, historyIndex],
                }))
            );

            return settled
                .filter((entry) => entry.status === "fulfilled")
                .map((entry) => entry.value);
        } catch (err) {
            console.log(err);
        }
        return [];
    }

    async get_quiz_reward_tft(address) {
        try {
            const cacheKey = this.normalizeAddress(address);
            const hasManualBaseline = Object.prototype.hasOwnProperty.call(SCORE_BASELINE_TFT_MAP, cacheKey);
            const baselineScore = Number(SCORE_BASELINE_TFT_MAP[cacheKey] || 0);
            if (hasManualBaseline) {
                return Math.min(Number(baselineScore || 0), Number(MAX_TFT_TOTAL || 750));
            }
            const scoreCache = readScoreCache();
            const historyLength = await this.get_user_history_len(address);
            const cached = scoreCache[cacheKey];
            const payoutEntries = getRewardPayoutEntries({ studentAddress: address })
                .filter((entry) => entry.confirmed !== false && String(entry.resultState || "") === "correct");
            const payoutLedgerSignature = payoutEntries
                .map((entry) => `${buildRewardLedgerQuizKey(entry.sourceAddress, entry.quizId)}:${Number(entry.rewardTft || 0)}:${String(entry.txHash || "")}`)
                .sort()
                .join("|");
            if (
                cached
                && String(cached.payoutLedgerSignature || "") === payoutLedgerSignature
                && Number(cached.historyLength || 0) === Number(historyLength || 0)
            ) {
                return Number(cached.score || 0);
            }

            let score = 0;
            const countedQuizKeys = new Set();
            try {
                const inventory = await this.getQuizInventory(true);
                const settled = await runSettledInChunks(
                    Array.isArray(inventory) ? inventory : [],
                    5,
                    async (quiz) => {
                        const quizId = Number(quiz?.id || 0);
                        const sourceAddress = quiz?.address || "";
                        const detail = await this.get_student_answer_detail(address, quizId, sourceAddress);
                        return {
                            quizKey: buildRewardLedgerQuizKey(sourceAddress, quizId),
                            rewardTft: Number(detail?.reward || 0) / 10 ** 18,
                        };
                    }
                );
                score += settled.reduce((sum, item) => {
                    const rewardTft = Number(item?.rewardTft || 0);
                    if (rewardTft > 0) {
                        countedQuizKeys.add(String(item.quizKey || ""));
                        return sum + rewardTft;
                    }
                    return sum;
                }, 0);
            } catch (quizRewardError) {
                console.log(quizRewardError);
            }

            const payoutLedgerScore = payoutEntries.reduce((sum, entry) => {
                const quizKey = buildRewardLedgerQuizKey(entry.sourceAddress, entry.quizId);
                if (countedQuizKeys.has(quizKey)) {
                    return sum;
                }
                countedQuizKeys.add(quizKey);
                return sum + Number(entry.rewardTft || 0);
            }, 0);
            score += payoutLedgerScore;

            if (historyLength && historyLength > 0) {
                const history = await this.get_token_history(address, historyLength, 0);
                const tokenHistoryScore = (Array.isArray(history) ? history : []).reduce((sum, entry) => {
                    const explanation = getTokenHistoryExplanation(entry).toLowerCase();
                    if (!explanation.includes("correct answer")) {
                        return sum;
                    }
                    return sum + getTokenHistoryValueTft(entry);
                }, 0);
                score = Math.max(Number(score || 0), Number(tokenHistoryScore || 0));
            }

            score = Math.min(Number(score || 0), Number(MAX_TFT_TOTAL || 750));

            scoreCache[cacheKey] = {
                historyLength: Number(historyLength || 0),
                score: Number(score || 0),
                payoutLedgerSignature,
                updatedAt: new Date().toISOString(),
            };
            writeScoreCache(scoreCache);
            return Number(score || 0);
        } catch (error) {
            console.log(error);
            return 0;
        }
    }

    async get_user_history_len(address) {
        try {
            const normalizedAddress = this.normalizeAddress(address);
            const cachedHistory = userHistoryLenCache.get(normalizedAddress);
            if (cachedHistory && Date.now() - Number(cachedHistory.fetchedAt || 0) < HISTORY_LEN_CACHE_TTL_MS) {
                return Number(cachedHistory.value || 0);
            }
            const account = await this.get_address();
            const res = await publicClient.readContract({
                account: account || undefined,
                address: token_address,
                abi: token_abi,
                functionName: "get_user_history_len",
                args: [address],
            });
            const historyLength = Number(res || 0);
            userHistoryLenCache.set(normalizedAddress, {
                value: historyLength,
                fetchedAt: Date.now(),
            });
            return historyLength;
        } catch (error) {
            console.log(error);
            return 0;
        }
    }

    //ユーザーのデータを取得する
    async get_user_data(address) {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                const sources = this.getQuizReadAddresses();
                for (const source of sources) {
                    try {
                        const res = await publicClient.readContract({
                            account: account || undefined,
                            address: source,
                            abi: quiz_abi,
                            functionName: "get_user",
                            args: [address],
                        });
                        const normalized = [res[0], res[1], Number(res[2]), res[3]];
                        if (normalized[0] || normalized[1] || Number(normalized[2]) > 0 || normalized[3]) {
                            return normalized;
                        }
                    } catch (innerError) {
                        console.log(innerError);
                    }
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return ["", "", 0, false];
    }

    async approve(account, amount, spenderAddress = quiz_address) {
        try {
            if (ethereum) {
                console.log(amount);
                try {
                    return await this.writeContractDirect({
                        account,
                        address: token_address,
                        abi: token_abi,
                        functionName: "approve",
                        args: [this.resolveQuizAddress(spenderAddress), amount],
                    });
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async investment_to_quiz(id, amount, answer, isNotPayingOut, numOfStudent, isNotAddingReward, students, sourceAddress = "") {
        console.log([id, amount, isNotPayingOut, numOfStudent, isNotAddingReward]);
        let res = null;
        let res2 = null;
        let hash = null;
        let hash2 = null;
        let payoutReceipts = [];
        let payoutChunks = [];
        let payoutHashes = [];
        let is_not_paying_out = null;
        let is_not_adding_reward = null;
        const rewardText = String(amount ?? 0).trim() || "0";
        const rewardWei = parseUnits(rewardText, 18);
        const normalizedStudentCount = Number(numOfStudent || 0);

        if (isNotPayingOut === "false") {
            is_not_paying_out = false;
        } else {
            is_not_paying_out = true;
        }
        if (isNotAddingReward === "false") {
            is_not_adding_reward = false;
        } else {
            is_not_adding_reward = true;
        }

        try {
            if (ethereum) {
                let account = await this.getConnectedWriteAccount();
                const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
                if (!account) {
                    throw new Error("wallet_not_connected");
                }
                let approval = await this.readTokenAllowance(account, targetQuizAddress);
                const requiredAmount = rewardWei > 0n && normalizedStudentCount > 0
                    ? rewardWei * BigInt(normalizedStudentCount)
                    : 0n;
                console.log(String(approval || 0n));
                console.log(String(requiredAmount));

                if (requiredAmount > 0n && normalizedStudentCount > 0) {
                    if (approval < requiredAmount) {
                        hash = await this.approve(account, requiredAmount, targetQuizAddress);
                        if (hash) {
                            res = await this.waitForReceiptWithRetry(hash);
                        }
                    }

                    hash = await this._investment_to_quiz(account, id, rewardWei, normalizedStudentCount, targetQuizAddress);
                    if (hash) {
                        res = await this.waitForReceiptWithRetry(hash);
                    }
                }

                if (is_not_paying_out === false) {
                    const isPayment = await this.get_is_payment(id, targetQuizAddress).catch(() => false);
                    if (isPayment) {
                        throw new Error("quiz_reward_already_finalized");
                    }
                    payoutChunks = await this.buildAutoRewardChunks(account, id, answer, students, targetQuizAddress);
                    for (let i = 0; i < payoutChunks.length; i += 1) {
                        const chunk = payoutChunks[i];
                        hash2 = await this._payment_of_reward_manual(
                            account,
                            id,
                            String(answer || ""),
                            chunk?.correctStudents || [],
                            chunk?.incorrectStudents || [],
                            i === payoutChunks.length - 1,
                            targetQuizAddress
                        );
                        if (hash2) {
                            res2 = await this.waitForReceiptWithRetry(hash2);
                            payoutHashes.push(hash2);
                            payoutReceipts.push(res2);
                        }
                    }
                    if (is_not_adding_reward === false) {
                        let reward = (await this.get_quiz_simple(id, targetQuizAddress))[7];
                        console.log(reward);
                        approval = await this.readTokenAllowance(account, targetQuizAddress);
                        console.log(approval);
                        if (BigInt(approval || 0n) < BigInt(reward || 0)) {
                            hash = await this.approve(account, reward, targetQuizAddress);
                            if (hash) {
                                res = await this.waitForReceiptWithRetry(hash);
                            }
                        }
                        hash = await this._adding_reward(account, id, reward, targetQuizAddress);
                        if (hash) {
                            res = await this.waitForReceiptWithRetry(hash);
                        }
                    }
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
        this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
        return { res, res2, hash, hash2, payoutReceipts, payoutHashes, payoutChunks };
    }

    async _investment_to_quiz(account, id, amount, numOfStudent, sourceAddress = "") {
        console.log([account, id, amount, numOfStudent])
        try {
            if (ethereum) {
                try {
                    return await this.writeContractDirect({
                        account,
                        address: this.resolveQuizAddress(sourceAddress),
                        abi: quiz_abi,
                        functionName: "investment_to_quiz",
                        args: [id, amount.toString(), numOfStudent],
                    });
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async add_quiz_reward_delta(id, deltaRewardTft, respondentLimit, setShow, sourceAddress = "") {
        if (setShow) setShow(true);
        try {
            const provider = await this.getEthereumProviderReady();
            if (!provider) {
                throw new Error("ethereum_not_found");
            }
            const onAmoy = await this.ensure_amoy_network();
            if (!onAmoy) {
                throw new Error("avalanche-fuji_network_unavailable");
            }

            const account = await this.getConnectedWriteAccount();
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            const studentLimit = Number(respondentLimit || 0);
            if (!Number.isFinite(studentLimit) || studentLimit <= 0) {
                throw new Error("invalid_respondent_limit");
            }

            const rewardText = String(deltaRewardTft || "0").trim();
            const rewardDeltaWei = parseUnits(rewardText, 18);
            if (rewardDeltaWei <= 0n) {
                return { res: null, hash: null, approvalHash: null, requiredAmount: 0n };
            }

            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            const requiredAmount = rewardDeltaWei * BigInt(studentLimit);
            let approvalHash = null;
            let approvalReceipt = null;
            const approval = await this.readTokenAllowance(account, targetQuizAddress);

            if (approval < requiredAmount) {
                approvalHash = await this.approve(account, requiredAmount, targetQuizAddress);
                if (!approvalHash) {
                    throw new Error("approve_rejected");
                }
                approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
                if (approvalReceipt?.status !== "success") {
                    throw new Error("approve_failed");
                }
            }

            const hash = await this._investment_to_quiz(account, id, rewardDeltaWei, studentLimit, targetQuizAddress);
            if (!hash) {
                throw new Error("reward_update_rejected");
            }

            const res = await publicClient.waitForTransactionReceipt({ hash });
            if (res?.status !== "success") {
                throw new Error("reward_update_failed");
            }

            this.invalidateQuizSimpleCache(targetQuizAddress, id);

            return { res, hash, approvalHash, approvalReceipt, requiredAmount };
        } catch (err) {
            console.log(err);
            throw err;
        } finally {
            if (setShow) setShow(false);
        }
    }

    async reduce_quiz_reward(id, newRewardTft, setShow, sourceAddress = "") {
        if (setShow) setShow(true);
        try {
            const provider = await this.getEthereumProviderReady();
            if (!provider) {
                throw new Error("ethereum_not_found");
            }
            const onAmoy = await this.ensure_amoy_network();
            if (!onAmoy) {
                throw new Error("avalanche-fuji_network_unavailable");
            }

            const account = await this.getConnectedWriteAccount();
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            const rewardText = String(newRewardTft || "0").trim();
            const newRewardWei = parseUnits(rewardText, 18);
            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            const hash = await this._reduce_quiz_reward(account, id, newRewardWei, targetQuizAddress);
            if (!hash) {
                throw new Error("reward_reduce_rejected");
            }

            const res = await publicClient.waitForTransactionReceipt({ hash });
            if (res?.status !== "success") {
                throw new Error("reward_reduce_failed");
            }
            this.invalidateQuizSimpleCache(targetQuizAddress, id);
            return { res, hash };
        } catch (err) {
            console.log(err);
            throw err;
        } finally {
            if (setShow) setShow(false);
        }
    }

    async _reduce_quiz_reward(account, id, newRewardWei, sourceAddress = "") {
        try {
            if (!ethereum) {
                throw new Error("ethereum_not_found");
            }
            return await this.writeContractDirect({
                account,
                address: this.resolveQuizAddress(sourceAddress),
                abi: quiz_abi,
                functionName: "reduce_quiz_reward",
                args: [id, newRewardWei.toString()],
            });
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async get_quiz_reward_burn_amount(id, newRewardTft, sourceAddress = "") {
        try {
            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            const newRewardWei = parseUnits(String(newRewardTft || "0").trim(), 18);
            const result = targetQuizAddress === quiz_address
                ? await quiz.read.get_quiz_reward_burn_amount({ args: [id, newRewardWei.toString()] })
                : await publicClient.readContract({
                    address: targetQuizAddress,
                    abi: quiz_abi,
                    functionName: "get_quiz_reward_burn_amount",
                    args: [id, newRewardWei.toString()],
                });
            return Number(result || 0) / 10 ** 18;
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    async _payment_of_reward(account, id, answer, students, sourceAddress = "") {
        console.log([account, id, answer, students]);
        try {
            if (ethereum) {
                const recipientCount = Math.max(1, Array.isArray(students) ? students.length : 1);
                const gasOverride = 100000n + (BigInt(recipientCount) * 60000n);
                return await this.writeContractDirect({
                    account,
                    address: this.resolveQuizAddress(sourceAddress),
                    abi: quiz_abi,
                    functionName: "payment_of_reward",
                    args: [id, answer, students],
                    gasOverride,
                });
            } else {
                throw new Error("ethereum_not_found");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async _payment_of_reward_manual(account, id, confirmAnswer, correctStudents, incorrectStudents, finalizePayment, sourceAddress = "") {
        try {
            if (ethereum) {
                const recipientCount = Math.max(
                    1,
                    (Array.isArray(correctStudents) ? correctStudents.length : 0)
                    + (Array.isArray(incorrectStudents) ? incorrectStudents.length : 0)
                );
                const gasOverride = 150000n + (BigInt(recipientCount) * 60000n);
                return await this.writeContractDirect({
                    account,
                    address: this.resolveQuizAddress(sourceAddress),
                    abi: [PAYMENT_OF_REWARD_MANUAL_ABI],
                    functionName: "payment_of_reward_manual",
                    args: [id, String(confirmAnswer || ""), correctStudents, incorrectStudents, Boolean(finalizePayment)],
                    gasOverride,
                });
            } else {
                throw new Error("ethereum_not_found");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async estimateWriteCost(writeConfig) {
        const gas = await publicClient.estimateContractGas(writeConfig);
        const fees = await publicClient.estimateFeesPerGas({ chain: amoy });
        const maxFeePerGas = BigInt(fees?.maxFeePerGas || 0n);
        return {
            gas,
            maxFeePerGas,
            totalFeeWei: gas * maxFeePerGas,
        };
    }

    async buildAutoRewardChunks(account, quizId, answer, students, sourceAddress = "") {
        const normalizedStudents = uniqueAddresses(students);
        const quizEntries = await Promise.all(
            normalizedStudents.map(async (studentAddress) => {
                const detail = await this.get_student_answer_detail(studentAddress, quizId, sourceAddress).catch(() => null);
                const answerText = String(detail?.answerText || "");
                return {
                    address: studentAddress,
                    correct: answerText === String(answer || ""),
                };
            })
        );

        const correctStudents = quizEntries.filter((entry) => entry.correct).map((entry) => entry.address);
        const incorrectStudents = quizEntries.filter((entry) => !entry.correct).map((entry) => entry.address);

        return await this.buildManualRewardChunks(
            account,
            quizId,
            answer,
            correctStudents,
            incorrectStudents,
            sourceAddress
        );
    }

    async buildManualRewardChunks(account, quizId, confirmAnswer, correctStudents, incorrectStudents, sourceAddress = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        const normalizedCorrectStudents = uniqueAddresses(correctStudents);
        const normalizedIncorrectStudents = uniqueAddresses(incorrectStudents)
            .filter((address) => !normalizedCorrectStudents.includes(address));
        const combinedEntries = [
            ...normalizedCorrectStudents.map((address) => ({ address, correct: true })),
            ...normalizedIncorrectStudents.map((address) => ({ address, correct: false })),
        ];

        const splitEntries = async (entryChunk) => {
            if (entryChunk.length === 0) return [];

            const correctChunk = entryChunk.filter((entry) => entry.correct).map((entry) => entry.address);
            const incorrectChunk = entryChunk.filter((entry) => !entry.correct).map((entry) => entry.address);

            try {
                const estimate = await this.estimateWriteCost({
                    account,
                    address: targetQuizAddress,
                    abi: [PAYMENT_OF_REWARD_MANUAL_ABI],
                    functionName: "payment_of_reward_manual",
                    args: [quizId, String(confirmAnswer || ""), correctChunk, incorrectChunk, false],
                    chain: amoy,
                });
                if (estimate.gas <= MAX_PAYOUT_GAS_PER_TX && estimate.totalFeeWei <= MAX_PAYOUT_FEE_PER_TX_WEI) {
                    return [entryChunk];
                }
            } catch (error) {
                console.log("manual reward chunk estimate fallback", error);
            }

            if (entryChunk.length === 1) {
                return [entryChunk];
            }

            const middle = Math.ceil(entryChunk.length / 2);
            const left = await splitEntries(entryChunk.slice(0, middle));
            const right = await splitEntries(entryChunk.slice(middle));
            return [...left, ...right];
        };

        const seededChunks = sliceByNumber(combinedEntries, MAX_PAYOUT_RECIPIENTS_PER_TX);
        const rawChunks = [];
        for (const seededChunk of seededChunks) {
            const splitChunk = await splitEntries(seededChunk);
            rawChunks.push(...splitChunk);
        }
        return rawChunks.map((entries) => ({
            correctStudents: entries.filter((entry) => entry.correct).map((entry) => entry.address),
            incorrectStudents: entries.filter((entry) => !entry.correct).map((entry) => entry.address),
        }));
    }

    async _adding_reward(account, id, reward, sourceAddress = "") {
        console.log([account, id, reward]);
        try {
            if (ethereum) {
                try {
                    return await this.writeContractDirect({
                        account,
                        address: this.resolveQuizAddress(sourceAddress),
                        abi: quiz_abi,
                        functionName: "adding_reward",
                        args: [id],
                    });
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async settle_quiz_rewards_manually(id, amount, confirmAnswer, correctStudents, incorrectStudents, isNotAddingReward, sourceAddress = "") {
        let res = null;
        let payoutReceipts = [];
        let payoutChunks = [];
        let hash = null;
        const normalizedCorrectStudents = uniqueAddresses(correctStudents);
        const normalizedIncorrectStudents = uniqueAddresses(incorrectStudents)
            .filter((address) => !normalizedCorrectStudents.includes(address));
        const rewardText = String(amount ?? 0).trim() || "0";
        const rewardPerStudent = parseUnits(rewardText, 18);

        try {
            if (!ethereum) {
                console.log("Ethereum object does not exist");
                return { res, payoutReceipts, hash, payoutChunks };
            }

            const account = await this.getConnectedWriteAccount();
            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            if (rewardPerStudent > 0n && normalizedCorrectStudents.length > 0) {
                let approval = await this.readTokenAllowance(account, targetQuizAddress);
                const requiredAmount = rewardPerStudent * BigInt(normalizedCorrectStudents.length);

                if (approval < requiredAmount) {
                    hash = await this.approve(account, requiredAmount, targetQuizAddress);
                    if (hash) {
                        res = await this.waitForReceiptWithRetry(hash);
                    }
                }

                hash = await this._investment_to_quiz(account, id, rewardPerStudent, normalizedCorrectStudents.length, targetQuizAddress);
                if (hash) {
                    res = await this.waitForReceiptWithRetry(hash);
                }
            }

            if (normalizedCorrectStudents.length > 0 || normalizedIncorrectStudents.length > 0) {
                const isPayment = await this.get_is_payment(id, targetQuizAddress).catch(() => false);

                if (isPayment) {
                    throw new Error("quiz_reward_already_finalized");
                }

                payoutChunks = await this.buildManualRewardChunks(
                    account,
                    id,
                    confirmAnswer,
                    normalizedCorrectStudents,
                    normalizedIncorrectStudents,
                    targetQuizAddress
                );

                for (let index = 0; index < payoutChunks.length; index += 1) {
                    const { correctStudents: correctChunk, incorrectStudents: incorrectChunk } = payoutChunks[index];
                    const payoutHash = await this._payment_of_reward_manual(
                        account,
                        id,
                        confirmAnswer,
                        correctChunk,
                        incorrectChunk,
                        index === payoutChunks.length - 1,
                        targetQuizAddress
                    );
                    if (payoutHash) {
                        payoutReceipts.push(await this.waitForReceiptWithRetry(payoutHash));
                    }
                }
            }

            if (isNotAddingReward === "false") {
                let reward = (await this.get_quiz_simple(id, targetQuizAddress))[7];
                let approval = await this.readTokenAllowance(account, targetQuizAddress);
                if (BigInt(approval || 0n) < BigInt(reward || 0)) {
                    hash = await this.approve(account, reward, targetQuizAddress);
                    if (hash) {
                        res = await this.waitForReceiptWithRetry(hash);
                    }
                }
                hash = await this._adding_reward(account, id, reward, targetQuizAddress);
                if (hash) {
                    res = await this.waitForReceiptWithRetry(hash);
                }
            }
        } catch (err) {
            console.log(err);
            throw err;
        }

        this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
        return { res, payoutReceipts, hash, payoutChunks };
    }

    async settle_quiz_rewards_auto_existing(id, answer, students, sourceAddress = "") {
        const normalizedStudents = uniqueAddresses(students);
        const payoutReceipts = [];
        const payoutHashes = [];
        let payoutChunks = [];

        try {
            if (!ethereum) {
                console.log("Ethereum object does not exist");
                return { payoutReceipts, payoutHashes };
            }

            if (normalizedStudents.length === 0) {
                return { payoutReceipts, payoutHashes };
            }

            const account = await this.getConnectedWriteAccount();
            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            const isPayment = await this.get_is_payment(id, targetQuizAddress).catch(() => false);

            if (isPayment) {
                throw new Error("quiz_reward_already_finalized");
            }

            payoutChunks = await this.buildAutoRewardChunks(account, id, answer, normalizedStudents, targetQuizAddress);
            for (let index = 0; index < payoutChunks.length; index += 1) {
                const { correctStudents, incorrectStudents } = payoutChunks[index];
                const payoutHash = await this._payment_of_reward_manual(
                    account,
                    id,
                    String(answer || ""),
                    correctStudents,
                    incorrectStudents,
                    index === payoutChunks.length - 1,
                    targetQuizAddress
                );
                if (!payoutHash) continue;
                payoutHashes.push(payoutHash);
                payoutReceipts.push(await this.waitForReceiptWithRetry(payoutHash));
            }
        } catch (error) {
            console.log(error);
            throw error;
        }

        this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
        return { payoutReceipts, payoutHashes, payoutChunks };
    }

    async create_quiz(title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, correct_limit, setShow) {
        setShow(true);
        let res = null;
        let hash = null;
        const respondentLimit = Number(correct_limit || 0);
        const rewardWei = parseUnits(String(reward || 0), 18);
        let previousLength = 0;
        try {
            const provider = await this.getEthereumProviderReady();
            if (!provider) {
                throw new Error("ethereum_not_found");
            }

            let account = await this.get_address();
            if (!account) {
                throw new Error("wallet_not_connected");
            }
            if (respondentLimit <= 0) {
                throw new Error("student_count_unavailable");
            }

            previousLength = Number(await this.get_quiz_lenght(quiz_address));
            this.invalidateQuizInventoryCache();
            const requiredAmount = rewardWei * BigInt(respondentLimit);
            const approval = await this.readTokenAllowance(account, quiz_address);

            if (approval < requiredAmount) {
                hash = await this.approve(account, requiredAmount);
                if (!hash) {
                    throw new Error("approve_rejected");
                }
                res = await publicClient.waitForTransactionReceipt({ hash });
            }

            hash = await this._create_quiz(account, title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, rewardWei, respondentLimit);
            if (!hash) {
                throw new Error("create_quiz_rejected");
            }
            const createNonce = this.getLastWriteNonce(account);
            res = await publicClient.waitForTransactionReceipt({ hash });
            await this.waitForPendingNonceAdvance(provider, account, createNonce);
        } catch (err) {
            console.log(err);
            throw err;
        } finally {
            setShow(false);
        }
        let createdQuizId = this.extractCreatedQuizIdFromReceipt(res, quiz_address);
        if (createdQuizId == null) {
            createdQuizId = await this.findCreatedQuizIdAfterCreate({
                previousLength,
                title,
                explanation,
                thumbnail_url,
                reply_startline,
                reply_deadline,
                rewardWei,
                respondentLimit,
            });
        }
        if (createdQuizId != null) {
            this.invalidateQuizSimpleCache(quiz_address, createdQuizId);
        }
        return { receipt: res, hash, createdQuizId };
    }

    async findCreatedQuizIdAfterCreate({
        previousLength = 0,
        title = "",
        explanation = "",
        thumbnail_url = "",
        reply_startline = "",
        reply_deadline = "",
        rewardWei = 0n,
        respondentLimit = 0,
    } = {}) {
        const startEpoch = Math.floor(new Date(reply_startline).getTime() / 1000);
        const deadlineEpoch = Math.floor(new Date(reply_deadline).getTime() / 1000);
        const expectedReward = String(rewardWei || 0n);
        const expectedRespondentLimit = Number(respondentLimit || 0);
        const attempts = 8;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            let latestLength = 0;
            try {
                latestLength = Number(await this.get_quiz_lenght(quiz_address));
            } catch (error) {
                latestLength = 0;
            }

            if (latestLength > 0) {
                const scanWindow = Math.max(6, latestLength - Math.max(0, previousLength) + 4);
                const startId = Math.max(0, latestLength - scanWindow);
                const ids = [];

                for (let id = latestLength - 1; id >= startId; id -= 1) {
                    ids.push(id);
                }

                const settled = await Promise.allSettled(
                    ids.map((id) => this.get_quiz_simple(id, quiz_address))
                );

                for (const result of settled) {
                    if (result.status !== "fulfilled") continue;
                    const quiz = result.value;
                    if (!Array.isArray(quiz)) continue;

                    const isMatch =
                        String(quiz?.[2] || "") === String(title || "")
                        && String(quiz?.[3] || "") === String(explanation || "")
                        && String(quiz?.[4] || "") === String(thumbnail_url || "")
                        && Number(quiz?.[5] || 0) === startEpoch
                        && Number(quiz?.[6] || 0) === deadlineEpoch
                        && String(quiz?.[7] || 0) === expectedReward
                        && Number(quiz?.[9] || 0) === expectedRespondentLimit;

                    if (isMatch) {
                        return Number(quiz?.[0]);
                    }
                }

                if (latestLength > previousLength && latestLength - previousLength === 1) {
                    return latestLength - 1;
                }
            }

            await sleep(700 * (attempt + 1));
        }

        return null;
    }

    extractCreatedQuizIdFromReceipt(receipt, sourceAddress = quiz_address) {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        const normalizedTarget = this.normalizeAddress(targetQuizAddress);
        const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];

        for (const log of logs) {
            if (this.normalizeAddress(log?.address) !== normalizedTarget) continue;
            try {
                const decoded = decodeEventLog({
                    abi: [CREATE_QUIZ_EVENT_ABI],
                    data: log.data,
                    topics: log.topics,
                });
                if (decoded?.eventName !== "Create_quiz") continue;
                const rawId = decoded?.args?.id ?? decoded?.args?.[1];
                if (rawId == null) continue;
                return Number(rawId);
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    async _create_quiz(account, title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, correct_limit) {
        const dateStartObj = new Date(reply_startline);
        const dateEndObj = new Date(reply_deadline);

        // Date オブジェクトをエポック秒に変換する
        const epochStartSeconds = Math.floor(dateStartObj.getTime() / 1000);
        const epochEndSeconds = Math.floor(dateEndObj.getTime() / 1000);
        try {
            if (ethereum) {
                return await this.writeContractDirect({
                    account,
                    address: quiz_address,
                    abi: quiz_abi,
                    functionName: "create_quiz",
                    args: [title, explanation, thumbnail_url, content, answer_type, answer_data.toString(), correct, epochStartSeconds, epochEndSeconds, reward, correct_limit],
                });
            } else {
                throw new Error("ethereum_not_found");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async edit_quiz(id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline, setShow, sourceAddress = "") {
        setShow(true);
        let res = null;
        try {
            const provider = await this.getEthereumProviderReady();
            if (!provider) {
                throw new Error("ethereum_not_found");
            }
            const onAmoy = await this.ensure_amoy_network();
            if (!onAmoy) {
                throw new Error("avalanche-fuji_network_unavailable");
            }

            const account = await this.getConnectedWriteAccount();
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            const hash = await this._edit_quiz(
                account,
                id,
                owner,
                title,
                explanation,
                thumbnail_url,
                content,
                reply_startline,
                reply_deadline,
                sourceAddress
            );
            if (!hash) {
                throw new Error("edit_quiz_rejected");
            }

            res = await publicClient.waitForTransactionReceipt({ hash });
            this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
            return res;
        } catch (err) {
            console.log(err);
            throw err;
        } finally {
            setShow(false);
        }
    }

    async _edit_quiz(account, id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline, sourceAddress = "") {
        const dateStartObj = new Date(reply_startline);
        const dateEndObj = new Date(reply_deadline);

        // Date オブジェクトをエポック秒に変換する
        const epochStartSeconds = Math.floor(dateStartObj.getTime() / 1000);
        const epochEndSeconds = Math.floor(dateEndObj.getTime() / 1000);
        const provider = await this.getEthereumProviderReady();
        if (!provider) {
            throw new Error("ethereum_not_found");
        }

        return await this.writeContractDirect({
            account,
            address: this.resolveQuizAddress(sourceAddress),
            abi: quiz_abi,
            functionName: "edit_quiz",
            args: [id, owner, title, explanation, thumbnail_url, content, epochStartSeconds, epochEndSeconds],
        });
    }

    async create_answer(id, answer, setShow, setContent, sourceAddress = "", benchmarkCallbacks = {}) {
        console.log(id, answer);
        const emitBenchmarkEvent = (eventName, payload) => {
            try {
                benchmarkCallbacks?.[eventName]?.(payload);
            } catch (callbackError) {
                console.warn("Answer benchmark callback failed", callbackError);
            }
        };

        try {
            const provider = await this.getEthereumProviderReady();
            if (!provider) {
                throw new Error("ethereum_not_found");
            }
            const onAmoy = await this.ensure_amoy_network();
            if (!onAmoy) {
                throw new Error("avalanche-fuji_network_unavailable");
            }

            const account = await this.getConnectedWriteAccount();
            if (!account) {
                throw new Error("wallet_not_connected");
            }

            setShow(true);
            setContent("書き込み中...");
            let hash = await this._save_answer(account, id, answer, sourceAddress);
            emitBenchmarkEvent("onTransactionHash", { hash, account, quizId: id, sourceAddress });

            if (hash) {
                try {
                    let res = await this.waitForReceiptWithRetry(hash);
                    emitBenchmarkEvent("onTransactionReceipt", { hash, receipt: res, account, quizId: id, sourceAddress });
                    console.log(res);
                    localStorage.setItem(`quiz_${this.normalizeQuizAddress(sourceAddress)}_${id}_answer`, answer);
                    this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
                    return { ...res, hash, transactionHash: res?.transactionHash || hash };
                } catch (receiptError) {
                    emitBenchmarkEvent("onTransactionReceiptError", { hash, error: receiptError, account, quizId: id, sourceAddress });
                    const verified = await this.verify_answer_submission(account, id, answer, sourceAddress);
                    if (verified) {
                        localStorage.setItem(`quiz_${this.normalizeQuizAddress(sourceAddress)}_${id}_answer`, answer);
                        this.invalidateQuizSimpleCache(this.resolveQuizAddress(sourceAddress), id);
                        return { status: "verified_after_receipt_timeout", hash, transactionHash: hash };
                    }
                    throw receiptError;
                }
            }

            setShow(false);
            throw new Error("Transaction was rejected or failed");
        } catch (err) {
            console.log(err);
            setShow(false);
            throw err; // 呼び出し元でキャッチできるように再スロー
        }
    }

    async _save_answer(account, id, answer, sourceAddress = "") {
        return await this.writeContractDirect({
            account,
            address: this.resolveQuizAddress(sourceAddress),
            abi: quiz_abi,
            functionName: "save_answer",
            args: [id, answer.toString()],
        });
    }

    async _post_answer(account, id, answer, sourceAddress = "") {
        try {
            return await this.writeContractDirect({
                account,
                address: this.resolveQuizAddress(sourceAddress),
                abi: quiz_abi,
                functionName: "post_answer",
                args: [id, answer.toString()],
            });
        } catch (e) {
            console.log(e);
        }
    }

    async get_quiz_all_data(id, sourceAddress = "", accountOverride = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        const [quizData, answerType, simpleData] = await Promise.all([
            this.get_quiz(id, sourceAddress, accountOverride),
            publicClient.readContract({
                address: targetQuizAddress,
                abi: quiz_abi,
                functionName: "get_quiz_answer_type",
                args: [id],
            }),
            this.get_quiz_simple(id, sourceAddress, accountOverride),
        ]);
        return [
            Number(quizData?.[0] || id),
            quizData?.[1] || "",
            quizData?.[2] || "",
            quizData?.[3] || "",
            quizData?.[4] || "",
            quizData?.[5] || "",
            Number(answerType || 0),
            quizData?.[6] || "",
            Number(quizData?.[8] || 0),
            Number(quizData?.[9] || 0),
            Number(quizData?.[10] || 0),
            Number(simpleData?.[8] || 0),
            Number(simpleData?.[9] || 0),
            Number(simpleData?.[10] || 0),
        ];
    }

    async get_quiz(id, sourceAddress = "", accountOverride = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        const account = normalizeReadAccount(accountOverride || await this.get_read_account_cached());
        const [answer_typr, res, res2, registeredCorrectAnswer] = await Promise.all([
            publicClient.readContract({ account, address: targetQuizAddress, abi: quiz_abi, functionName: "get_quiz_answer_type", args: [id] }),
            publicClient.readContract({ account, address: targetQuizAddress, abi: quiz_abi, functionName: "get_quiz", args: [id] }),
            this.get_confirm_answer(id, targetQuizAddress),
            this.get_revealed_correct_answer(id, targetQuizAddress),
        ]);
        const normalizedQuiz = toQuizArray(res);
        return withQuizSourceMetadata([...normalizedQuiz, answer_typr, registeredCorrectAnswer, res2[1]], targetQuizAddress);
    }

    async get_quiz_with_source(id, preferredSourceAddress = "") {
        const preferred = preferredSourceAddress ? this.resolveQuizAddress(preferredSourceAddress) : "";
        const sources = [
            preferred,
            ...this.getQuizReadAddresses(),
        ].filter((address, index, list) => Boolean(address) && list.findIndex((item) => this.normalizeAddress(item) === this.normalizeAddress(address)) === index);

        let lastError = null;
        for (const source of sources) {
            try {
                let quizData;
                let simpleQuizData;
                try {
                    [quizData, simpleQuizData] = await Promise.all([
                        this.get_quiz(id, source),
                        this.get_quiz_simple(id, source),
                    ]);
                } catch (firstErr) {
                    [quizData, simpleQuizData] = await Promise.all([
                        this.get_quiz_all_data(id, source),
                        this.get_quiz_simple(id, source),
                    ]);
                }
                if (quizData?.[2] || simpleQuizData?.[2]) {
                    return { quizData, simpleQuizData, sourceAddress: source };
                }
            } catch (error) {
                lastError = error;
                console.log(error);
            }
        }

        throw lastError || new Error("quiz_not_found");
    }

    async get_quiz_simple(id, sourceAddress = "", accountOverride = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        const account = normalizeReadAccount(accountOverride || await this.get_read_account_cached());
        const cacheKey = buildQuizSimpleCacheKey(targetQuizAddress, id, account || "public");
        const cachedQuiz = this.getQuizSimpleCacheEntry(cacheKey);
        if (cachedQuiz) {
            return withQuizSourceMetadata(cachedQuiz, targetQuizAddress);
        }

        try {
            const readQuizSimple = async (readAccount) => await publicClient.readContract({
                account: readAccount,
                address: targetQuizAddress,
                abi: quiz_abi,
                functionName: "get_quiz_simple",
                args: [id],
            });

            let result;
            try {
                result = await readQuizSimple(account);
            } catch (firstError) {
                if (!account) throw firstError;
                // アカウントなしでリトライ
                try {
                    result = await readQuizSimple(undefined);
                } catch (retryError) {
                    // 短い遅延後にもう一度リトライ（RPC一時的制限対応）
                    await sleep(500);
                    result = await readQuizSimple(undefined);
                }
            }
            const normalized = toQuizSimpleArray(result);
            // バリデーション強化: ownerもチェック
            const hasOwner = Boolean(String(normalized?.[1] || "").trim());
            const hasTitle = Boolean(String(normalized?.[2] || "").trim());
            const hasTimeData = Number(normalized?.[5] || 0) !== 0 || Number(normalized?.[6] || 0) !== 0;
            const hasReward = Number(normalized?.[7] || 0) !== 0;
            if (
                !hasOwner
                && !hasTitle
                && !hasTimeData
                && !hasReward
            ) {
                throw new Error("quiz_simple_empty_payload");
            }
            this.setQuizSimpleCacheEntry(targetQuizAddress, id, account || "public", normalized);
            return withQuizSourceMetadata(normalized, targetQuizAddress);
        } catch (error) {
            console.log(error);
            if (cachedQuiz) {
                return withQuizSourceMetadata(cachedQuiz, targetQuizAddress);
            }
            throw error;
        }
    }

    async get_is_payment(id, sourceAddress = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        return await publicClient.readContract({
            address: targetQuizAddress,
            abi: quiz_abi,
            functionName: "get_is_payment",
            args: [id],
        });
    }

    async get_confirm_answer(id, sourceAddress = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        return await publicClient.readContract({
            address: targetQuizAddress,
            abi: quiz_abi,
            functionName: "get_confirm_answer",
            args: [id],
        });
    }

    async get_revealed_correct_answer(id, sourceAddress = "") {
        const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
        try {
            const result = await publicClient.readContract({
                address: targetQuizAddress,
                abi: [GET_REVEALED_CORRECT_ANSWER_ABI],
                functionName: "get_revealed_correct_answer",
                args: [Number(id)],
            });
            const answer = String(result?.[0] || "");
            const visible = Boolean(result?.[1]);
            if (visible && answer) {
                return answer;
            }
        } catch (error) {
            console.log(error);
        }

        try {
            const [confirmAnswer, isPayment] = await this.get_confirm_answer(id, targetQuizAddress);
            if (isPayment && confirmAnswer) {
                return String(confirmAnswer);
            }
        } catch (error) {
            console.log(error);
        }

        return getRegisteredCorrectAnswer(id, targetQuizAddress);
    }

    async get_quiz_all_data_list(start, end) {
        const inventory = await this.getQuizInventory();
        const refs = this.getQuizWindowFromInventory(inventory, start, end);
        const account = this.get_read_account_nonblocking();

        const settled = await Promise.allSettled(refs.map((ref) => this.get_quiz_all_data(ref.id, ref.address, account)));

        return settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => toQuizAllDataArray(result.value));
    }

    //startからendまでのクイズを取得

    async get_quiz_list(start, end, options = {}) {
        const inventory = await this.getQuizInventory();
        const refs = this.getQuizWindowFromInventory(inventory, start, end);
        const account = options?.preferCachedAccountOnly
            ? this.get_read_account_nonblocking()
            : await this.get_read_account_cached();
        const settled = await runSettledInChunks(
            refs,
            this.getQuizReadChunkSize(),
            (ref) => this.get_quiz_simple(ref.id, ref.address, account)
        );

        return settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);
    }

    async get_all_quiz_simple_list() {
        const inventory = await this.getQuizInventory();
        const account = this.get_read_account_nonblocking();
        const settled = await runSettledInChunks(
            inventory,
            this.getQuizReadChunkSize(),
            (ref) => this.get_quiz_simple(ref.id, ref.address, account)
        );

        return settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);
    }

    async get_quiz_lenght(sourceAddress = "") {
        try {
            const targetQuizAddress = sourceAddress ? this.resolveQuizAddress(sourceAddress) : "";
            if (targetQuizAddress) {
                try {
                    return await publicClient.readContract({
                        address: targetQuizAddress,
                        abi: quiz_abi,
                        functionName: "get_quiz_length",
                        args: [],
                    });
                } catch (error) {
                    console.log(error);
                    return 0;
                }
            }

            const lengths = await Promise.allSettled(
                this.getQuizReadAddresses().map(async (address) => Number(await this.get_quiz_lenght(address)))
            );
            const totalLength = lengths.reduce((sum, result) => {
                if (result.status !== "fulfilled") return sum;
                return sum + Number(result.value || 0);
            }, 0);
            if (totalLength > 0) {
                return totalLength;
            }

            const fallbackInventory = Array.isArray(quizInventoryCacheMemory) && quizInventoryCacheMemory.length > 0
                ? quizInventoryCacheMemory
                : getStoredQuizInventoryEntries();
            return Array.isArray(fallbackInventory) ? fallbackInventory.length : 0;
        } catch (error) {
            console.log(error);
            const fallbackInventory = Array.isArray(quizInventoryCacheMemory) && quizInventoryCacheMemory.length > 0
                ? quizInventoryCacheMemory
                : getStoredQuizInventoryEntries();
            return Array.isArray(fallbackInventory) ? fallbackInventory.length : 0;
        }
    }

    async get_num_of_students() {
        try {
            const students = await this.get_student_list();
            return Array.isArray(students) ? students.length : 0;
        } catch (fallbackError) {
            console.log(fallbackError);
            return 0;
        }
    }

    async add_student(address) {
        console.log(address);
        try {
            if (ethereum) {
                try {
                    const normalizedAddresses = this.normalizeAddressList(address);
                    if (normalizedAddresses.length === 0) {
                        throw new Error("有効な学生アドレスがありません。");
                    }
                    const [students, teachers] = await Promise.all([
                        this.get_student_list(),
                        this.get_teachers(),
                    ]);
                    const registered = new Set([
                        ...(Array.isArray(students) ? students : []),
                        ...(Array.isArray(teachers) ? teachers : []),
                    ].map((item) => this.normalizeAddress(item)));
                    const targets = normalizedAddresses.filter((item) => !registered.has(this.normalizeAddress(item)));
                    if (targets.length === 0) {
                        throw new Error("指定したアドレスはすでに学生または教員として登録済みです。");
                    }
                    let account = await this.get_address();
                    return await this.writeContractDirect({
                        account,
                        address: class_room_address,
                        abi: [ADD_STUDENT_ABI],
                        functionName: "add_student",
                        args: [targets],
                    });
                } catch (e) {
                    console.log(e);
                    throw e;
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async add_teacher(address) {
        try {
            if (ethereum) {
                try {
                    const normalizedAddress = checksumAddress(String(address || "").trim());
                    const [students, teachers] = await Promise.all([
                        this.get_student_list(),
                        this.get_teachers(),
                    ]);
                    const registered = new Set([
                        ...(Array.isArray(students) ? students : []),
                        ...(Array.isArray(teachers) ? teachers : []),
                    ].map((item) => this.normalizeAddress(item)));
                    if (registered.has(this.normalizeAddress(normalizedAddress))) {
                        throw new Error("指定したアドレスはすでに学生または教員として登録済みです。");
                    }
                    let account = await this.get_address();
                    return await this.writeContractDirect({
                        account,
                        address: class_room_address,
                        abi: [ADD_TEACHER_ABI],
                        functionName: "add_teacher",
                        args: [normalizedAddress],
                    });
                } catch (e) {
                    console.log(e);
                    throw e;
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async get_teachers() {
        try {
            let account = await this.get_address();
            const teachers = await this.readAccessControlAddressList({
                account,
                abi: [GET_TEACHER_ALL_ABI],
                functionName: "get_teacher_all",
                args: [],
            });
            const normalizedTeachers = Array.isArray(teachers) ? [...teachers] : [];
            for (const teacherAddress of bootstrap_teacher_addresses || []) {
                if (!normalizedTeachers.some((item) => this.normalizeAddress(item) === this.normalizeAddress(teacherAddress))) {
                    normalizedTeachers.push(teacherAddress);
                }
            }
            return normalizedTeachers;
        } catch (err) {
            console.log(err);
        }
        return [...(bootstrap_teacher_addresses || [])];
    }

    async get_results() {
        const now = Date.now();
        const rewardLedgerSignature = buildRewardLedgerSignature(getRewardPayoutEntries());
        const combinedLedgerSignature = rewardLedgerSignature;
        if (
            Array.isArray(resultsCacheMemory)
            && now - resultsCacheFetchedAt < RESULTS_CACHE_TTL_MS
            && String(resultsCacheMemory?.__rewardLedgerSignature || "") === combinedLedgerSignature
        ) {
            return resultsCacheMemory;
        }

        const persistedCache = readTimedCache(RESULTS_CACHE_KEY);
        if (
            Array.isArray(persistedCache?.value)
            && now - Number(persistedCache?.fetchedAt || 0) < RESULTS_CACHE_TTL_MS
            && String(persistedCache?.rewardLedgerSignature || "") === combinedLedgerSignature
        ) {
            resultsCacheMemory = persistedCache.value;
            resultsCacheFetchedAt = Number(persistedCache.fetchedAt || now);
            resultsCacheMemory.__rewardLedgerSignature = combinedLedgerSignature;
            return resultsCacheMemory;
        }

        if (resultsCachePromise) {
            return resultsCachePromise;
        }

        resultsCachePromise = (async () => {
            try {
                const students = await this.get_student_list();
                const rows = await Promise.all(
                    (Array.isArray(students) ? students : []).map(async (student) => {
                        const score = await this.get_quiz_reward_tft(student);
                        return {
                            student,
                            result: Number(score || 0),
                        };
                    })
                );
                rows.__rewardLedgerSignature = combinedLedgerSignature;
                resultsCacheMemory = rows;
                resultsCacheFetchedAt = Date.now();
                writeTimedCache(RESULTS_CACHE_KEY, {
                    value: rows,
                    fetchedAt: resultsCacheFetchedAt,
                    rewardLedgerSignature: combinedLedgerSignature,
                });
                return rows;
            } catch (fallbackError) {
                console.log(fallbackError);
                return Array.isArray(resultsCacheMemory) ? resultsCacheMemory : [];
            } finally {
                resultsCachePromise = null;
            }
        })();

        return resultsCachePromise;
    }

    async isTeacher() {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                if (!account) return false;
                if (this.isBootstrapTeacherAddress(account)) return true;

                try {
                    if (!IS_TEACHER_NO_ARG_ABI) throw new Error("is_teacher_no_arg_abi_missing");
                    const directResult = await this.readAccessControlContract({
                        account,
                        abi: [IS_TEACHER_NO_ARG_ABI],
                        functionName: "_isTeacher",
                        args: [],
                        preferTruthy: true,
                    });
                    if (typeof directResult === "boolean") return directResult;
                } catch (directError) {
                    console.log(directError);
                }

                try {
                    if (!IS_TEACHER_WITH_ADDRESS_ABI) throw new Error("is_teacher_with_address_abi_missing");
                    const overloadResult = await this.readAccessControlContract({
                        account,
                        abi: [IS_TEACHER_WITH_ADDRESS_ABI],
                        functionName: "_isTeacher",
                        args: [account],
                        preferTruthy: true,
                    });
                    if (typeof overloadResult === "boolean") return overloadResult;
                } catch (overloadError) {
                    console.log(overloadError);
                }

                try {
                    const teachers = await this.get_teachers();
                    return Array.isArray(teachers)
                        ? teachers.some((teacher) => this.normalizeAddress(teacher) === this.normalizeAddress(account))
                        : false;
                } catch (listError) {
                    console.log(listError);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return false;
    }

    async isStudent(address = "") {
        try {
            if (this.getEthereumProvider()) {
                const account = await this.get_address();
                const targetAddress = address || account;
                if (!targetAddress) return null;

                try {
                    if (!IS_STUDENT_WITH_ADDRESS_ABI) throw new Error("is_student_with_address_abi_missing");
                    return await this.readAccessControlContract({
                        account,
                        abi: [IS_STUDENT_WITH_ADDRESS_ABI],
                        functionName: "_isStudent",
                        args: [targetAddress],
                        preferTruthy: true,
                    });
                } catch (overloadError) {
                    try {
                        if (!IS_STUDENT_NO_ARG_ABI) throw new Error("is_student_no_arg_abi_missing");
                        return await this.readAccessControlContract({
                            account,
                            abi: [IS_STUDENT_NO_ARG_ABI],
                            functionName: "_isStudent",
                            args: [],
                            preferTruthy: true,
                        });
                    } catch (fallbackError) {
                        return null;
                    }
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return null;
    }

    async getUserRole(address = "") {
        try {
            if (this.getEthereumProvider()) {
                const account = await this.get_address();
                const targetAddress = address || account;
                if (!targetAddress) {
                    return normalizeRole(ROLE_CODE.NONE);
                }
                if (this.isBootstrapTeacherAddress(targetAddress)) {
                    return normalizeRole(ROLE_CODE.TEACHER);
                }

                try {
                    const roleCode = await this.readAccessControlContract({
                        account,
                        abi: [GET_USER_ROLE_WITH_ADDRESS_ABI],
                        functionName: "get_user_role",
                        args: [targetAddress],
                        acceptResult: (result) => Number(result) > 0,
                    });

                    let roleLabel = "";
                    try {
                        roleLabel = await this.readAccessControlContract({
                            account,
                            abi: [GET_USER_ROLE_LABEL_WITH_ADDRESS_ABI],
                            functionName: "get_user_role_label",
                            args: [targetAddress],
                            acceptResult: (result) => typeof result === "string" && result !== "none",
                        });
                    } catch (labelError) {
                        console.log(labelError);
                    }

                    return normalizeRole(roleCode, roleLabel);
                } catch (withAddressError) {
                    try {
                        if (targetAddress !== account) {
                            throw withAddressError;
                        }
                        const roleCode = await this.readAccessControlContract({
                            account,
                            abi: [GET_USER_ROLE_NO_ARG_ABI],
                            functionName: "get_user_role",
                            args: [],
                            acceptResult: (result) => Number(result) > 0,
                        });
                        return normalizeRole(roleCode);
                    } catch (noArgError) {
                        const [teacher, student] = await Promise.all([
                            this.isTeacher().catch(() => false),
                            this.isStudent(targetAddress).catch(() => null),
                        ]);

                        if (teacher) return normalizeRole(ROLE_CODE.TEACHER);
                        if (student === true) return normalizeRole(ROLE_CODE.STUDENT);
                        if (targetAddress !== account) {
                            try {
                                const teachers = await this.get_teachers();
                                if (Array.isArray(teachers) && teachers.some((item) => this.normalizeAddress(item) === this.normalizeAddress(targetAddress))) {
                                    return normalizeRole(ROLE_CODE.TEACHER);
                                }
                            } catch (teacherListError) {
                                console.log(teacherListError);
                            }

                            try {
                                const students = await this.get_student_list();
                                if (Array.isArray(students) && students.some((item) => this.normalizeAddress(item) === this.normalizeAddress(targetAddress))) {
                                    return normalizeRole(ROLE_CODE.STUDENT);
                                }
                            } catch (studentListError) {
                                console.log(studentListError);
                            }
                        }
                        if (student === null && targetAddress) return normalizeRole(ROLE_CODE.NONE);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }

        return normalizeRole(ROLE_CODE.NONE);
    }

    async isRegistered(address = "") {
        try {
            if (!this.getEthereumProvider()) return false;
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;
            if (this.isBootstrapTeacherAddress(targetAddress)) return true;

            try {
                return await this.readAccessControlContract({
                    account,
                    abi: [IS_REGISTERED_WITH_ADDRESS_ABI],
                    functionName: "isRegistered",
                    args: [targetAddress],
                    preferTruthy: true,
                });
            } catch (withAddressError) {
                if (targetAddress !== account) {
                    const role = await this.getUserRole(targetAddress);
                    return role.key !== "guest";
                }

                try {
                    return await this.readAccessControlContract({
                        account,
                        abi: [IS_REGISTERED_NO_ARG_ABI],
                        functionName: "isRegistered",
                        args: [],
                        preferTruthy: true,
                    });
                } catch (noArgError) {
                    const role = await this.getUserRole(targetAddress);
                    return role.key !== "guest";
                }
            }
        } catch (error) {
            console.log(error);
        }

        return false;
    }

    async getRoleSummary(address = "") {
        const fallbackRole = await this.getUserRole(address);
        try {
            if (!this.getEthereumProvider()) {
                return {
                    registered: fallbackRole.key !== "guest",
                    isTeacher: fallbackRole.key === "teacher",
                    isStudent: fallbackRole.key === "student",
                    role: fallbackRole.code,
                    roleKey: fallbackRole.key,
                    roleLabel: fallbackRole.label,
                };
            }

            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) {
                return {
                    registered: false,
                    isTeacher: false,
                    isStudent: false,
                    role: ROLE_CODE.NONE,
                    roleKey: "guest",
                    roleLabel: "未登録",
                };
            }
            if (this.isBootstrapTeacherAddress(targetAddress)) {
                return {
                    registered: true,
                    isTeacher: true,
                    isStudent: false,
                    role: ROLE_CODE.TEACHER,
                    roleKey: "teacher",
                    roleLabel: "教員",
                };
            }

            const result = await this.readAccessControlContract({
                account,
                abi: [GET_ROLE_SUMMARY_WITH_ADDRESS_ABI],
                functionName: "getRoleSummary",
                args: [targetAddress],
                acceptResult: (result) => Boolean(result?.[0]) || Boolean(result?.[1]) || Boolean(result?.[2]) || Number(result?.[3] || 0) > 0,
            });

            return {
                registered: Boolean(result?.[0]),
                isTeacher: Boolean(result?.[1]),
                isStudent: Boolean(result?.[2]),
                role: Number(result?.[3] ?? fallbackRole.code),
                roleKey: normalizeRole(result?.[3], result?.[4]).key,
                roleLabel: normalizeRole(result?.[3], result?.[4]).label,
            };
        } catch (error) {
            return {
                registered: fallbackRole.key !== "guest",
                isTeacher: fallbackRole.key === "teacher",
                isStudent: fallbackRole.key === "student",
                role: fallbackRole.code,
                roleKey: fallbackRole.key,
                roleLabel: fallbackRole.label,
            };
        }
    }

    async getRegistrationDetails(address = "") {
        const fallbackRole = await this.getUserRole(address);
        try {
            if (!this.getEthereumProvider()) {
                return {
                    registered: fallbackRole.key !== "guest",
                    isTeacher: fallbackRole.key === "teacher",
                    isStudent: fallbackRole.key === "student",
                    role: fallbackRole.code,
                    roleKey: fallbackRole.key,
                    roleLabel: fallbackRole.label,
                    addedBy: "",
                    addedAt: 0,
                };
            }

            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) {
                return {
                    registered: false,
                    isTeacher: false,
                    isStudent: false,
                    role: ROLE_CODE.NONE,
                    roleKey: "guest",
                    roleLabel: "未登録",
                    addedBy: "",
                    addedAt: 0,
                };
            }
            if (this.isBootstrapTeacherAddress(targetAddress)) {
                return {
                    registered: true,
                    isTeacher: true,
                    isStudent: false,
                    role: ROLE_CODE.TEACHER,
                    roleKey: "teacher",
                    roleLabel: "教員",
                    addedBy: targetAddress,
                    addedAt: 0,
                };
            }

            let result;
            try {
                result = await this.readAccessControlContract({
                    account,
                    abi: [GET_REGISTRATION_DETAILS_WITH_ADDRESS_ABI],
                    functionName: "getRegistrationDetails",
                    args: [targetAddress],
                    acceptResult: (nextResult) => Boolean(nextResult?.[0]) || Boolean(nextResult?.[1]) || Boolean(nextResult?.[2]) || Number(nextResult?.[3] || 0) > 0,
                });
            } catch (withAddressError) {
                if (targetAddress !== account) {
                    throw withAddressError;
                }
                result = await this.readAccessControlContract({
                    account,
                    abi: [GET_REGISTRATION_DETAILS_NO_ARG_ABI],
                    functionName: "getRegistrationDetails",
                    args: [],
                    acceptResult: (nextResult) => Boolean(nextResult?.[0]) || Boolean(nextResult?.[1]) || Boolean(nextResult?.[2]) || Number(nextResult?.[3] || 0) > 0,
                });
            }

            const normalized = normalizeRole(result?.[3], result?.[4]);
            return {
                registered: Boolean(result?.[0]),
                isTeacher: Boolean(result?.[1]),
                isStudent: Boolean(result?.[2]),
                role: Number(result?.[3] ?? normalized.code),
                roleKey: normalized.key,
                roleLabel: normalized.label,
                addedBy: String(result?.[5] || ""),
                addedAt: Number(result?.[6] || 0),
            };
        } catch (error) {
            console.log(error);
            return {
                registered: fallbackRole.key !== "guest",
                isTeacher: fallbackRole.key === "teacher",
                isStudent: fallbackRole.key === "student",
                role: fallbackRole.code,
                roleKey: fallbackRole.key,
                roleLabel: fallbackRole.label,
                addedBy: "",
                addedAt: 0,
            };
        }
    }

    async getQuizStatistics(id) {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_QUIZ_STATISTICS_ABI],
                functionName: "get_quiz_statistics",
                args: [Number(id)],
            });

            return {
                respondentCount: Number(result?.[0] || 0),
                respondentLimit: Number(result?.[1] || 0),
                correctCount: Number(result?.[2] || 0),
                incorrectCount: Number(result?.[3] || 0),
                pendingCount: Number(result?.[4] || 0),
                lifecycle: Number(result?.[5] || 0),
                isPayment: Boolean(result?.[6]),
            };
        } catch (error) {
            console.log(error);
            try {
                const simple = await this.get_quiz_simple(id);
                return {
                    respondentCount: Number(simple?.[8] || 0),
                    respondentLimit: Number(simple?.[9] || 0),
                    correctCount: 0,
                    incorrectCount: 0,
                    pendingCount: 0,
                    lifecycle: 0,
                    isPayment: Boolean(simple?.[11]),
                };
            } catch (fallbackError) {
                console.log(fallbackError);
                return null;
            }
        }
    }

    async getQuizLifecycleLabel(id) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [GET_QUIZ_LIFECYCLE_LABEL_ABI],
                functionName: "get_quiz_lifecycle_label",
                args: [Number(id)],
            });
        } catch (error) {
            console.log(error);
            try {
                const simple = await this.get_quiz_simple(id);
                const endAt = Number(simple?.[6] || 0);
                if (endAt && endAt < Math.floor(Date.now() / 1000)) return "closed";
                return "published";
            } catch (fallbackError) {
                console.log(fallbackError);
                return "";
            }
        }
    }

    async getReviewRequired(quizId, address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;

            return await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [GET_REVIEW_REQUIRED_ABI],
                functionName: "get_review_required",
                args: [Number(quizId), targetAddress],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async getReviewQuizIds(address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return [];

            const result = await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [GET_REVIEW_QUIZ_IDS_ABI],
                functionName: "get_review_quiz_ids",
                args: [targetAddress],
            });

            return Array.isArray(result) ? result.map((item) => Number(item)) : [];
        } catch (error) {
            console.log(error);
            return [];
        }
    }

    async createAttendanceSession(label, attendanceCode) {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [CREATE_ATTENDANCE_SESSION_ABI],
                functionName: "create_attendance_session",
                args: [String(label || ""), String(attendanceCode || "")],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async closeAttendanceSession(sessionId) {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [CLOSE_ATTENDANCE_SESSION_ABI],
                functionName: "close_attendance_session",
                args: [Number(sessionId)],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async markAttendance(sessionId, attendanceCode) {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [MARK_ATTENDANCE_ABI],
                functionName: "mark_attendance",
                args: [Number(sessionId), String(attendanceCode || "")],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async getAttendanceSessionCount() {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_SESSION_COUNT_ABI],
                functionName: "get_attendance_session_count",
                args: [],
            });
            return Number(result || 0);
        } catch (error) {
            console.log(error);
            return 0;
        }
    }

    async getAttendanceSession(sessionId) {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_SESSION_ABI],
                functionName: "get_attendance_session",
                args: [Number(sessionId)],
            });
            return {
                id: Number(result?.[0] || 0),
                label: String(result?.[1] || ""),
                createdAt: Number(result?.[2] || 0),
                closedAt: Number(result?.[3] || 0),
                isActive: Boolean(result?.[4]),
                attendeeCount: Number(result?.[5] || 0),
            };
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async hasAttended(sessionId, address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;
            return await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [HAS_ATTENDED_ABI],
                functionName: "has_attended",
                args: [Number(sessionId), targetAddress],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async getAttendanceAttendees(sessionId) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_ATTENDEES_ABI],
                functionName: "get_attendance_attendees",
                args: [Number(sessionId)],
            });
        } catch (error) {
            console.log(error);
            return [];
        }
    }

    async recordAnnouncementHash(contentHash, tag = "") {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [RECORD_ANNOUNCEMENT_HASH_ABI],
                functionName: "record_announcement_hash",
                args: [contentHash, String(tag || "")],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async recordSuperchatOnChain(messageId, messageHash, amount) {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [RECORD_SUPERCHAT_ABI],
                functionName: "record_superchat",
                args: [String(messageId || ""), messageHash, BigInt(amount)],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async awardBadge(user, badgeKey) {
        try {
            const account = await this.get_address();
            return await this.writeContractDirect({
                account,
                address: quiz_address,
                abi: [AWARD_BADGE_ABI],
                functionName: "award_badge",
                args: [user, badgeKey],
            });
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async hasBadge(user, badgeKey) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [HAS_BADGE_ABI],
                functionName: "has_badge",
                args: [user, badgeKey],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async get_only_student_results() {
        try {
            let results = await this.get_results();
            let scores = (Array.isArray(results) ? results : []).map((item) => Number(item?.result || 0));
            scores.sort((a, b) => b - a);
            return scores;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async get_rank(result) {
        try {
            let results = await this.get_results();
            const sortedScores = (Array.isArray(results) ? results : [])
                .map((item) => Number(item?.result || 0))
                .sort((a, b) => b - a);
            for (let i = 0; i < sortedScores.length; i++) {
                if (Number(result) === Number(sortedScores[i])) return i + 1;
            }
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async get_respondentCount_and_respondentLimit(id, sourceAddress = "") {
        try {
            const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
            if (targetQuizAddress === quiz_address) {
                return await quiz.read.get_respondentCount_and_respondentLimit({ args: [id] });
            }
            return await publicClient.readContract({
                address: targetQuizAddress,
                abi: quiz_abi,
                functionName: "get_respondentCount_and_respondentLimit",
                args: [id],
            });
        } catch (error) {
            console.log(error);
            const simple = await this.get_quiz_simple(id, sourceAddress);
            return [Number(simple?.[8] || 0), Number(simple?.[9] || 0)];
        }
    }
    //ここから変更
    async get_student_answer_hash(student, id, sourceAddress = "") {
        try {
            if (ethereum) {
                let account = await this.get_read_account_cached();
                const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
                let res = targetQuizAddress === quiz_address
                    ? await quiz.read.get_student_answer_hash({ account, args: [student, id] })
                    : await publicClient.readContract({
                        account,
                        address: targetQuizAddress,
                        abi: quiz_abi,
                        functionName: "get_student_answer_hash",
                        args: [student, id],
                    });
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_student_answer_detail(student, id, sourceAddress = "") {
        try {
            if (ethereum) {
                let account = await this.get_read_account_cached();
                const targetQuizAddress = this.resolveQuizAddress(sourceAddress);
                let result = null;
                try {
                    result = await publicClient.readContract({
                        account,
                        address: targetQuizAddress,
                        abi: [GET_STUDENT_ANSWER_DETAIL_ABI],
                        functionName: "get_student_answer_detail",
                        args: [Number(id), student],
                    });
                } catch (extendedError) {
                    result = await publicClient.readContract({
                        account,
                        address: targetQuizAddress,
                        abi: [LEGACY_GET_STUDENT_ANSWER_DETAIL_ABI],
                        functionName: "get_student_answer_detail",
                        args: [Number(id), student],
                    });
                }

                return {
                    answerText: String(result?.[0] || ""),
                    state: Number(result?.[1] || 0),
                    answerTime: Number(result?.[2] || 0),
                    reward: Number(result?.[3] || 0),
                    result: Boolean(result?.[4]),
                    submitted: Boolean(result?.[5]),
                    attemptCount: Number(result?.[6] || 0),
                };
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
            try {
                const answerHash = await this.get_student_answer_hash(student, id, sourceAddress);
                return {
                    answerText: answerHash ? `hash: ${String(answerHash).slice(0, 18)}...` : "",
                    state: 0,
                    answerTime: 0,
                    reward: 0,
                    result: false,
                    submitted: Boolean(answerHash && String(answerHash) !== "0x0000000000000000000000000000000000000000000000000000000000000000"),
                    attemptCount: 0,
                };
            } catch (fallbackError) {
                console.log(fallbackError);
            }
        }
        return {
            answerText: "",
            state: 0,
            answerTime: 0,
            reward: 0,
            result: false,
            submitted: false,
            attemptCount: 0,
        };
    }


    async get_student_list() {
        const now = Date.now();
        if (Array.isArray(studentListCacheMemory) && now - studentListCacheFetchedAt < STUDENT_LIST_CACHE_TTL_MS) {
            return studentListCacheMemory;
        }

        const persistedCache = readTimedCache(STUDENT_LIST_CACHE_KEY);
        if (
            Array.isArray(persistedCache?.value)
            && now - Number(persistedCache?.fetchedAt || 0) < STUDENT_LIST_CACHE_TTL_MS
        ) {
            studentListCacheMemory = persistedCache.value;
            studentListCacheFetchedAt = Number(persistedCache.fetchedAt || now);
            return studentListCacheMemory;
        }

        if (studentListCachePromise) {
            return studentListCachePromise;
        }

        studentListCachePromise = (async () => {
            try {
                let account = await this.get_address();
                let res = await this.readAccessControlAddressList({
                    account,
                    abi: [GET_STUDENT_ALL_ABI],
                    functionName: "get_student_all",
                    args: [],
                });
                const normalizedStudents = Array.isArray(res) ? res : [];
                studentListCacheMemory = normalizedStudents;
                studentListCacheFetchedAt = Date.now();
                writeTimedCache(STUDENT_LIST_CACHE_KEY, {
                    value: normalizedStudents,
                    fetchedAt: studentListCacheFetchedAt,
                });
                return normalizedStudents;
            } catch (err) {
                console.log(err);
                return Array.isArray(studentListCacheMemory) ? studentListCacheMemory : [];
            } finally {
                studentListCachePromise = null;
            }
        })();

        return studentListCachePromise;
    }

    async get_students_answer_hash_list(students, id, sourceAddress = "") {
        try {
            if (ethereum) {
                let res = {};
                console.log(students[1]);
                for (let i = 0; i < students.length; i++) {
                    res[students[i]] = await this.get_student_answer_hash(students[i], id, sourceAddress);
                }
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
        }
    }
    //ここまで変更

    async get_data_for_survey_users() {
        try {
            const rows = await this.get_results();
            return (Array.isArray(rows) ? rows : []).map((item) => ({
                user: item?.student || "",
                create_quiz_count: 0,
                result: Number(item?.result || 0),
                answer_count: 0,
            }));
        } catch (fallbackError) {
            console.log(fallbackError);
            return [];
        }
    }
    async get_data_for_survey_quizs() {
        try {
            const quizList = await this.get_all_quiz_simple_list();
            return (Array.isArray(quizList) ? quizList : []).map((quizData) => ({
                reward: BigInt(Number(quizData?.[7] || 0)),
                respondent_count: Number(quizData?.[8] || 0),
            }));
        } catch (fallbackError) {
            console.log(fallbackError);
            return [];
        }
    }

    async resolveSuperchatRecipient(recipientAddress = "") {
        const account = await this.get_address();
        const requestedRecipient = String(recipientAddress || "").trim();

        if (requestedRecipient) {
            const checksummedRecipient = checksumAddress(requestedRecipient);
            return {
                address: checksummedRecipient,
                label: `指定先 ${this.formatShortAddress(checksummedRecipient)}`,
                isDefault: false,
            };
        }

        const teachers = (await this.get_teachers())
            .map((item) => {
                try {
                    return checksumAddress(item);
                } catch (error) {
                    return "";
                }
            })
            .filter(Boolean);

        if (teachers.length === 0) {
            throw new Error("superchat_recipient_not_found");
        }

        const normalizedSelf = this.normalizeAddress(account);
        const preferredTeacher = teachers.find((item) => this.normalizeAddress(item) !== normalizedSelf) || teachers[0];

        return {
            address: preferredTeacher,
            label: "教員側",
            isDefault: true,
        };
    }

    // スーパーチャット送金用関数
    async send_superchat(amount, recipientAddress = "") {
        try {
            if (ethereum) {
                let account = await this.get_address();
                const balance = await tttToken.read.balanceOf({ args: [account] });
                const amountInWei = BigInt(Math.floor(amount)) * 10n**18n;
                if (balance < amountInWei) {
                    throw new Error("insufficient_ttt_balance");
                }
                const recipient = await this.resolveSuperchatRecipient(recipientAddress);

                const hash = await this.writeContractDirect({
                    account,
                    address: ttt_token_address,
                    abi: token_abi,
                    functionName: "transfer",
                    args: [recipient.address, amountInWei],
                });

                console.log("Superchat Tx Hash:", hash);
                await publicClient.waitForTransactionReceipt({ hash });
                return recipient;
            } else {
                console.log("Ethereum object does not exist");
                return false;
            }
        } catch (err) {
            console.error("Superchat transaction failed:", err);
            throw err;
        }
    }

    normalizeAddressList(addresses = []) {
        const uniqueAddresses = [];
        addresses.forEach((item) => {
            try {
                const normalized = checksumAddress(String(item || "").trim());
                if (!uniqueAddresses.some((current) => this.normalizeAddress(current) === this.normalizeAddress(normalized))) {
                    uniqueAddresses.push(normalized);
                }
            } catch (error) {
            }
        });
        return uniqueAddresses;
    }

    async transferNativePol(recipientAddress, amountPol) {
        const provider = this.getEthereumProvider();
        if (!provider || !walletClient) {
            throw new Error("ethereum_not_found");
        }

        const account = await this.get_address();
        const recipient = checksumAddress(String(recipientAddress || "").trim());
        const value = parseEther(String(amountPol || 0));
        if (value <= 0n) {
            return null;
        }

        const hash = await walletClient.sendTransaction({
            account,
            to: recipient,
            value,
            chain: amoy,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return {
            hash,
            recipient,
            amount: Number(amountPol || 0),
            asset: "AVAX",
            confirmed: receipt?.status === "success",
            receipt,
        };
    }

    async transferErc20Token(tokenContractAddress, recipientAddress, amount, symbol = "TOKEN", decimals = 18) {
        const provider = this.getEthereumProvider();
        if (!provider || !walletClient) {
            throw new Error("ethereum_not_found");
        }

        const account = await this.get_address();
        const recipient = checksumAddress(String(recipientAddress || "").trim());
        const value = parseUnits(String(amount || 0), decimals);
        if (value <= 0n) {
            return null;
        }

        const hash = await this.writeContractDirect({
            account,
            address: tokenContractAddress,
            abi: token_abi,
            functionName: "transfer",
            args: [recipient, value],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return {
            hash,
            symbol,
            amount,
            recipient,
            asset: symbol,
            confirmed: receipt?.status === "success",
            receipt,
        };
    }

    async grantStudentStarterTokens(addresses, amounts = {}) {
        const recipients = this.normalizeAddressList(addresses);
        if (recipients.length === 0) {
            throw new Error("recipient_not_found");
        }

        const polAmount = Number(amounts.pol || 0);
        const tftAmount = Number(amounts.tft || 0);
        const tttAmount = Number(amounts.ttt || 0);
        const results = [];

        for (const recipient of recipients) {
            if (polAmount > 0) {
                try {
                    const transferResult = await this.transferNativePol(recipient, polAmount);
                    results.push(transferResult || {
                        recipient,
                        amount: polAmount,
                        asset: "AVAX",
                        confirmed: false,
                    });
                } catch (error) {
                    results.push({
                        recipient,
                        amount: polAmount,
                        asset: "AVAX",
                        confirmed: false,
                        error: error?.message || "transfer_failed",
                    });
                }
            }

            if (tftAmount > 0) {
                try {
                    const transferResult = await this.transferErc20Token(token_address, recipient, tftAmount, "TFT");
                    results.push(transferResult || {
                        recipient,
                        amount: tftAmount,
                        asset: "TFT",
                        confirmed: false,
                    });
                } catch (error) {
                    results.push({
                        recipient,
                        amount: tftAmount,
                        asset: "TFT",
                        confirmed: false,
                        error: error?.message || "transfer_failed",
                    });
                }
            }

            if (tttAmount > 0) {
                try {
                    const transferResult = await this.transferErc20Token(ttt_token_address, recipient, tttAmount, "TTT");
                    results.push(transferResult || {
                        recipient,
                        amount: tttAmount,
                        asset: "TTT",
                        confirmed: false,
                    });
                } catch (error) {
                    results.push({
                        recipient,
                        amount: tttAmount,
                        asset: "TTT",
                        confirmed: false,
                        error: error?.message || "transfer_failed",
                    });
                }
            }
        }

        return results;
    }
}

export { Contracts_MetaMask };
