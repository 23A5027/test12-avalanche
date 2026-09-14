import { fetchLiveSignalJson } from "./liveSignalApi";

const STORAGE_KEY = "web3_quiz_activity_logs_v3";
const SHARED_STORAGE_KEY = "web3_quiz_activity_logs_shared_v1";
const DRAFT_PREFIX = "web3_quiz_draft_";
const SESSION_KEY = "web3_quiz_session_id";
const ACTOR_KEY = "web3_quiz_actor";
const MAX_LOGS = 10000;

const ACTION_TYPES = {
    APP_SESSION_STARTED: "app_session_started",
    ROUTE_VIEWED: "route_viewed",
    ROUTE_FALLBACK_SHOWN: "route_fallback_shown",
    ROUTE_RENDER_FAILED: "route_render_failed",

    LOGIN_PAGE_VIEWED: "login_page_viewed",
    LOGIN_ATTEMPT: "login_attempt",
    LOGIN_SUCCESS: "login_success",
    LOGIN_FAILURE: "login_failure",
    WALLET_PROVIDER_MISSING: "wallet_provider_missing",

    QUIZ_PAGE_VIEWED: "quiz_page_viewed",
    QUIZ_LOAD_STARTED: "quiz_load_started",
    QUIZ_LOAD_SUCCESS: "quiz_load_success",
    QUIZ_LOAD_FAILURE: "quiz_load_failure",
    QUIZ_RETRY_CLICKED: "quiz_retry_clicked",
    QUIZ_STATUS_DETECTED: "quiz_status_detected",
    QUIZ_CORRECT_REVEALED: "quiz_correct_revealed",

    ANSWER_INPUT_STARTED: "answer_input_started",
    ANSWER_OPTION_SELECTED: "answer_option_selected",
    ANSWER_TEXT_CHANGED: "answer_text_changed",
    ANSWER_PATTERN_VALIDATION: "answer_pattern_validation",
    ANSWER_DRAFT_RESTORED: "answer_draft_restored",
    ANSWER_DRAFT_SAVED: "answer_draft_saved",
    ANSWER_DRAFT_CLEARED: "answer_draft_cleared",
    ANSWER_SUBMIT_CLICKED: "answer_submit_clicked",
    ANSWER_SUBMITTED: "answer_submitted",
    ANSWER_SUBMIT_FAILED: "answer_submit_failed",
    ANSWER_BLOCKED_BEFORE_START: "answer_blocked_before_start",
    ANSWER_PRACTICE_SUBMITTED: "answer_practice_submitted",
    ANSWER_PRACTICE_CORRECT: "answer_practice_correct",
    ANSWER_PRACTICE_INCORRECT: "answer_practice_incorrect",

    LIVE_PAGE_VIEWED: "live_page_viewed",
    LIVE_AUTH_CHECK_STARTED: "live_auth_check_started",
    LIVE_AUTH_CHECK: "live_auth_check",
    LIVE_DUMMY_MESSAGE_EMITTED: "live_dummy_message_emitted",
    LIVE_DUMMY_TOGGLE_CHANGED: "live_dummy_toggle_changed",
    LIVE_CHAT_VISIBILITY_CHANGED: "live_chat_visibility_changed",
    LIVE_CAMERA_TOGGLE_CLICKED: "live_camera_toggle_clicked",
    LIVE_CAMERA_STARTED: "live_camera_started",
    LIVE_CAMERA_STOPPED: "live_camera_stopped",
    LIVE_CAMERA_FAILED: "live_camera_failed",
    LIVE_PINNED_SUPERCHAT_CHANGED: "live_pinned_superchat_changed",

    LIVE_CHAT_INPUT_CHANGED: "live_chat_input_changed",
    LIVE_CHAT_DRAFT_SAVED: "live_chat_draft_saved",
    LIVE_CHAT_DRAFT_CLEARED: "live_chat_draft_cleared",
    LIVE_MODAL_OPENED: "live_modal_opened",
    LIVE_MODAL_CLOSED: "live_modal_closed",
    LIVE_MESSAGE_BLOCKED: "live_message_blocked",
    LIVE_MESSAGE_SENT: "live_message_sent",
    LIVE_SUPERCHAT_SENT: "live_superchat_sent",
    LIVE_ANNOUNCEMENT_PUBLISHED: "live_announcement_published",
    LIVE_QUESTION_LIKED: "live_question_liked",
    LIVE_REACTION_SESSION_STARTED: "live_reaction_session_started",
    LIVE_REACTION_RESET: "live_reaction_reset",

    PERFORMANCE_SAMPLE: "performance_sample",
    EXPORT_ANALYTICS: "export_analytics",
    EXPORT_GRADES: "export_grades",
    ADMIN_ADD_STUDENT: "admin_add_student",
    ADMIN_ADD_TEACHER: "admin_add_teacher",
    ADMIN_CREATE_QUIZ: "admin_create_quiz",
    ADMIN_GRANT_TOKENS: "admin_grant_tokens",
    ADMIN_EDIT_QUIZ: "admin_edit_quiz",
    ADMIN_TA_HELPER_VIEWED: "admin_ta_helper_viewed",
};

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
    try {
        const existing = sessionStorage.getItem(SESSION_KEY);
        if (existing) return existing;
        const created = createId();
        sessionStorage.setItem(SESSION_KEY, created);
        return created;
    } catch (error) {
        return createId();
    }
}

function setActor(actor) {
    try {
        if (!actor) return;
        localStorage.setItem(ACTOR_KEY, actor);
    } catch (error) {
    }
}

function getActor() {
    try {
        return localStorage.getItem(ACTOR_KEY) || "";
    } catch (error) {
        return "";
    }
}

function createBaseContext() {
    const locationRef = typeof window !== "undefined" ? window.location : null;
    const navigatorRef = typeof navigator !== "undefined" ? navigator : null;
    const sessionId = getSessionId();
    const actor = getActor() || `guest:${sessionId.slice(-8)}`;
    return {
        sessionId,
        route: locationRef ? `${locationRef.pathname}${locationRef.hash || ""}` : "",
        url: locationRef ? locationRef.href : "",
        referrer: typeof document !== "undefined" ? document.referrer || "" : "",
        online: navigatorRef ? navigatorRef.onLine : true,
        userAgent: navigatorRef ? navigatorRef.userAgent : "",
        viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
        viewportHeight: typeof window !== "undefined" ? window.innerHeight : null,
        language: navigatorRef ? navigatorRef.language : "",
        timezone: "Asia/Tokyo",
        actor,
    };
}

function getStoredLogs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read activity logs", error);
        return [];
    }
}

function normalizeLogList(logs) {
    return (Array.isArray(logs) ? logs : [])
        .filter((entry) => entry && typeof entry === "object" && entry.id)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, MAX_LOGS);
}

function saveStoredLogs(logs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

function getSharedStoredLogs() {
    try {
        const raw = localStorage.getItem(SHARED_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return normalizeLogList(parsed);
    } catch (error) {
        console.error("Failed to read shared activity logs", error);
        return [];
    }
}

function saveSharedStoredLogs(logs) {
    try {
        localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(normalizeLogList(logs)));
    } catch (error) {
        console.error("Failed to write shared activity logs", error);
    }
}

function mergeActivityLogs(primaryLogs = [], secondaryLogs = []) {
    const merged = new Map();
    [...normalizeLogList(primaryLogs), ...normalizeLogList(secondaryLogs)].forEach((entry) => {
        if (!entry?.id || merged.has(entry.id)) return;
        merged.set(entry.id, entry);
    });
    return normalizeLogList([...merged.values()]);
}

async function persistActivityLogToServer(entry) {
    if (!entry?.id || typeof window === "undefined" || typeof fetch !== "function") return;
    try {
        const response = await fetchLiveSignalJson("/activity-logs", {
            method: "POST",
            body: JSON.stringify({ entry }),
        });
        if (Array.isArray(response?.logs)) {
            saveSharedStoredLogs(response.logs);
            window.dispatchEvent(new CustomEvent("activity-logs-shared-updated"));
        }
    } catch (error) {
        console.error("Failed to sync activity log to server", error);
    }
}

function appendActivityLog(action, payload = {}) {
    try {
        const logs = getStoredLogs();
        const entry = {
            id: createId(),
            action,
            createdAt: new Date().toISOString(),
            ...createBaseContext(),
            ...payload,
        };
        logs.unshift(entry);
        saveStoredLogs(logs.slice(0, MAX_LOGS));
        persistActivityLogToServer(entry);
        return entry;
    } catch (error) {
        console.error("Failed to append activity log", error);
        return null;
    }
}

function logPageView(page, payload = {}) {
    return appendActivityLog(ACTION_TYPES.ROUTE_VIEWED, { page, ...payload });
}

function getActivityLogs(action = null) {
    const logs = getStoredLogs();
    if (!action) return logs;
    return logs.filter((entry) => entry.action === action);
}

function getMergedActivityLogs(action = null) {
    const logs = mergeActivityLogs(getStoredLogs(), getSharedStoredLogs());
    if (!action) return logs;
    return logs.filter((entry) => entry.action === action);
}

async function syncSharedActivityLogs() {
    try {
        const response = await fetchLiveSignalJson("/activity-logs");
        const merged = mergeActivityLogs(response?.logs || [], getStoredLogs());
        saveSharedStoredLogs(merged);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("activity-logs-shared-updated"));
        }
        return merged;
    } catch (error) {
        console.error("Failed to fetch shared activity logs", error);
        return getMergedActivityLogs();
    }
}

function clearActivityLogs() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SHARED_STORAGE_KEY);
}

function saveDraft(key, value) {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, value);
}

function getDraft(key) {
    return localStorage.getItem(`${DRAFT_PREFIX}${key}`) || "";
}

function clearDraft(key) {
    localStorage.removeItem(`${DRAFT_PREFIX}${key}`);
}

function formatDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    } catch (error) {
        return String(value);
    }
}

function formatActionLabel(action) {
    switch (action) {
        case ACTION_TYPES.APP_SESSION_STARTED: return "セッション開始";
        case ACTION_TYPES.ROUTE_VIEWED: return "ルート表示";
        case ACTION_TYPES.ROUTE_FALLBACK_SHOWN: return "ルート待機表示";
        case ACTION_TYPES.LOGIN_PAGE_VIEWED: return "ログイン画面表示";
        case ACTION_TYPES.LOGIN_ATTEMPT: return "ログイン開始";
        case ACTION_TYPES.LOGIN_SUCCESS: return "ログイン成功";
        case ACTION_TYPES.LOGIN_FAILURE: return "ログイン失敗";
        case ACTION_TYPES.WALLET_PROVIDER_MISSING: return "ウォレット未検出";
        case ACTION_TYPES.QUIZ_PAGE_VIEWED: return "問題画面表示";
        case ACTION_TYPES.QUIZ_LOAD_STARTED: return "問題取得開始";
        case ACTION_TYPES.QUIZ_LOAD_SUCCESS: return "問題取得成功";
        case ACTION_TYPES.QUIZ_LOAD_FAILURE: return "問題取得失敗";
        case ACTION_TYPES.QUIZ_RETRY_CLICKED: return "問題再読込";
        case ACTION_TYPES.QUIZ_STATUS_DETECTED: return "問題状態判定";
        case ACTION_TYPES.QUIZ_CORRECT_REVEALED: return "正解表示";
        case ACTION_TYPES.ANSWER_INPUT_STARTED: return "解答入力開始";
        case ACTION_TYPES.ANSWER_OPTION_SELECTED: return "選択肢選択";
        case ACTION_TYPES.ANSWER_TEXT_CHANGED: return "解答テキスト変更";
        case ACTION_TYPES.ANSWER_PATTERN_VALIDATION: return "解答形式判定";
        case ACTION_TYPES.ANSWER_DRAFT_RESTORED: return "下書き復元";
        case ACTION_TYPES.ANSWER_DRAFT_SAVED: return "下書き保存";
        case ACTION_TYPES.ANSWER_DRAFT_CLEARED: return "下書き削除";
        case ACTION_TYPES.ANSWER_SUBMIT_CLICKED: return "解答送信クリック";
        case ACTION_TYPES.ANSWER_SUBMITTED: return "解答送信成功";
        case ACTION_TYPES.ANSWER_SUBMIT_FAILED: return "解答送信失敗";
        case ACTION_TYPES.ANSWER_BLOCKED_BEFORE_START: return "解答開始前ブロック";
        case ACTION_TYPES.ANSWER_PRACTICE_SUBMITTED: return "練習モード回答";
        case ACTION_TYPES.ANSWER_PRACTICE_CORRECT: return "練習モード正解";
        case ACTION_TYPES.ANSWER_PRACTICE_INCORRECT: return "練習モード不正解";
        case ACTION_TYPES.LIVE_PAGE_VIEWED: return "ライブ画面表示";
        case ACTION_TYPES.LIVE_AUTH_CHECK_STARTED: return "ライブ認証開始";
        case ACTION_TYPES.LIVE_AUTH_CHECK: return "ライブ認証結果";
        case ACTION_TYPES.LIVE_DUMMY_MESSAGE_EMITTED: return "ダミーコメント追加";
        case ACTION_TYPES.LIVE_DUMMY_TOGGLE_CHANGED: return "ダミーコメント切替";
        case ACTION_TYPES.LIVE_CHAT_VISIBILITY_CHANGED: return "チャット表示切替";
        case ACTION_TYPES.LIVE_CAMERA_TOGGLE_CLICKED: return "カメラ切替クリック";
        case ACTION_TYPES.LIVE_CAMERA_STARTED: return "カメラ開始";
        case ACTION_TYPES.LIVE_CAMERA_STOPPED: return "カメラ停止";
        case ACTION_TYPES.LIVE_CAMERA_FAILED: return "カメラ失敗";
        case ACTION_TYPES.LIVE_PINNED_SUPERCHAT_CHANGED: return "固定コメント変更";
        case ACTION_TYPES.LIVE_CHAT_INPUT_CHANGED: return "チャット入力変更";
        case ACTION_TYPES.LIVE_CHAT_DRAFT_SAVED: return "チャット下書き保存";
        case ACTION_TYPES.LIVE_CHAT_DRAFT_CLEARED: return "チャット下書き削除";
        case ACTION_TYPES.LIVE_MODAL_OPENED: return "スーパーチャットモーダル開";
        case ACTION_TYPES.LIVE_MODAL_CLOSED: return "スーパーチャットモーダル閉";
        case ACTION_TYPES.LIVE_MESSAGE_BLOCKED: return "コメント送信ブロック";
        case ACTION_TYPES.LIVE_MESSAGE_SENT: return "ライブコメント送信";
        case ACTION_TYPES.LIVE_SUPERCHAT_SENT: return "スーパーチャット送信";
        case ACTION_TYPES.LIVE_ANNOUNCEMENT_PUBLISHED: return "授業内お知らせ送信";
        case ACTION_TYPES.LIVE_QUESTION_LIKED: return "質問支持";
        case ACTION_TYPES.LIVE_REACTION_SESSION_STARTED: return "授業リアクション開始";
        case ACTION_TYPES.LIVE_REACTION_RESET: return "授業リアクション初期化";
        case ACTION_TYPES.PERFORMANCE_SAMPLE: return "性能サンプル";
        case ACTION_TYPES.EXPORT_ANALYTICS: return "ログ出力";
        case ACTION_TYPES.EXPORT_GRADES: return "成績CSV出力";
        case ACTION_TYPES.ADMIN_ADD_STUDENT: return "学生追加";
        case ACTION_TYPES.ADMIN_ADD_TEACHER: return "教員追加";
        case ACTION_TYPES.ADMIN_CREATE_QUIZ: return "クイズ作成";
        case ACTION_TYPES.ADMIN_GRANT_TOKENS: return "トークン付与";
        case ACTION_TYPES.ADMIN_EDIT_QUIZ: return "クイズ編集";
        case ACTION_TYPES.ADMIN_TA_HELPER_VIEWED: return "TA補助画面表示";
        default: return action || "-";
    }
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function exportLogsAsJson() {
    const logs = getActivityLogs();
    appendActivityLog(ACTION_TYPES.EXPORT_ANALYTICS, { format: "json", count: logs.length });
    downloadTextFile(
        `activity_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        JSON.stringify(logs, null, 2),
        "application/json;charset=utf-8"
    );
}

function escapeCsvValue(value) {
    const normalized = value == null ? "" : String(value);
    if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

function exportLogsAsCsv() {
    const logs = getActivityLogs();
    const keys = Array.from(
        logs.reduce((set, log) => {
            Object.keys(log).forEach((key) => set.add(key));
            return set;
        }, new Set(["id", "action", "createdAt"]))
    );
    const rows = [
        keys.join(","),
        ...logs.map((log) => keys.map((key) => escapeCsvValue(log[key])).join(",")),
    ];
    appendActivityLog(ACTION_TYPES.EXPORT_ANALYTICS, { format: "csv", count: logs.length });
    downloadTextFile(
        `activity_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`,
        rows.join("\n"),
        "text/csv;charset=utf-8"
    );
}

export {
    ACTION_TYPES,
    appendActivityLog,
    clearActivityLogs,
    clearDraft,
    exportLogsAsCsv,
    exportLogsAsJson,
    formatActionLabel,
    formatDateTime,
    getActivityLogs,
    getMergedActivityLogs,
    getActor,
    getDraft,
    getSessionId,
    logPageView,
    saveDraft,
    setActor,
    syncSharedActivityLogs,
};
