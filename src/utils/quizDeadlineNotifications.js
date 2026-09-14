import { buildAnswerQuizPath } from "./quizLinks";

const SETTINGS_KEY = "web3_quiz_deadline_notification_settings_v1";
const SENT_REMINDERS_KEY = "web3_quiz_deadline_sent_v1";
const SETTINGS_UPDATED_EVENT = "quiz-deadline-notification-settings-updated";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 15 * 1000;

const REMINDER_OPTIONS = [
    { key: "oneDay", label: "24時間前", offsetSeconds: 24 * 60 * 60 },
    { key: "sixHours", label: "6時間前", offsetSeconds: 6 * 60 * 60 },
    { key: "twoHours", label: "2時間前", offsetSeconds: 2 * 60 * 60 },
    { key: "oneHour", label: "1時間前", offsetSeconds: 1 * 60 * 60 },
    { key: "thirtyMinutes", label: "30分前", offsetSeconds: 30 * 60 },
    { key: "tenMinutes", label: "10分前", offsetSeconds: 10 * 60 },
];

function getDefaultNotificationSettings() {
    return {
        enabled: false,
        oneDay: false,
        sixHours: false,
        twoHours: true,
        oneHour: true,
        thirtyMinutes: false,
        tenMinutes: false,
        includeQuizTitle: true,
        includeDeadlineTime: true,
        includeRemainingTime: true,
        includeReward: false,
        includeOpenPrompt: true,
    };
}

function isBrowserEnvironment() {
    return typeof window !== "undefined";
}

function safeParseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function emitSettingsUpdated() {
    if (!isBrowserEnvironment()) return;
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
}

function readReminderStore() {
    if (typeof localStorage === "undefined") return {};
    const parsed = safeParseJson(localStorage.getItem(SENT_REMINDERS_KEY) || "{}", {});
    return parsed && typeof parsed === "object" ? parsed : {};
}

function writeReminderStore(store) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SENT_REMINDERS_KEY, JSON.stringify(store || {}));
}

function buildReminderId({ sourceAddress = "", quizId = 0, deadlineEpoch = 0, offsetSeconds = 0 }) {
    return `${String(sourceAddress || "").toLowerCase()}:${Number(quizId)}:${Number(deadlineEpoch)}:${Number(offsetSeconds)}`;
}

function normalizeQuizForReminder(quiz) {
    if (!Array.isArray(quiz)) return null;
    const quizId = Number(quiz?.[0] || 0);
    const title = String(quiz?.[2] || "クイズ");
    const deadlineEpoch = Number(quiz?.[6] || quiz?.[9] || 0);
    const answerState = Number(quiz?.[10] || 0);
    const sourceAddress = String(quiz?.sourceAddress || quiz?.[12] || "");
    const reward = Number(quiz?.[7] || 0);
    if (!deadlineEpoch || Number.isNaN(deadlineEpoch)) return null;

    return {
        quizId,
        title,
        deadlineEpoch,
        answerState,
        sourceAddress,
        reward,
    };
}

function pruneReminderStore(store, nowEpoch = Math.floor(Date.now() / 1000)) {
    const nextStore = {};
    Object.entries(store || {}).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        const deadlineEpoch = Number(value.deadlineEpoch || 0);
        if (!deadlineEpoch || deadlineEpoch + 24 * 60 * 60 < nowEpoch) return;
        nextStore[key] = value;
    });
    return nextStore;
}

function isNotificationSupported() {
    return typeof window !== "undefined" && typeof Notification !== "undefined";
}

function getNotificationPermission() {
    if (!isNotificationSupported()) return "unsupported";
    return Notification.permission || "default";
}

function readDeadlineNotificationSettings() {
    if (typeof localStorage === "undefined") return getDefaultNotificationSettings();
    const parsed = safeParseJson(localStorage.getItem(SETTINGS_KEY) || "null", null);
    return {
        ...getDefaultNotificationSettings(),
        ...(parsed && typeof parsed === "object" ? parsed : {}),
    };
}

function saveDeadlineNotificationSettings(nextSettings) {
    const merged = {
        ...getDefaultNotificationSettings(),
        ...(nextSettings && typeof nextSettings === "object" ? nextSettings : {}),
    };
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    }
    emitSettingsUpdated();
    return merged;
}

async function requestDeadlineNotificationPermission() {
    if (!isNotificationSupported()) return "unsupported";
    const permission = await Notification.requestPermission();
    emitSettingsUpdated();
    return permission;
}

function buildDueDeadlineReminders(quizzes, settings = getDefaultNotificationSettings(), nowEpoch = Math.floor(Date.now() / 1000)) {
    const sentStore = pruneReminderStore(readReminderStore(), nowEpoch);
    writeReminderStore(sentStore);

    const enabledSettings = {
        ...getDefaultNotificationSettings(),
        ...(settings || {}),
    };

    if (!enabledSettings.enabled) return [];

    const reminders = [];
    quizzes
        .map((quiz) => normalizeQuizForReminder(quiz))
        .filter(Boolean)
        .forEach((quiz) => {
            if (quiz.answerState !== 0) return;
            if (quiz.deadlineEpoch <= nowEpoch) return;

            REMINDER_OPTIONS.forEach((option) => {
                if (!enabledSettings[option.key]) return;
                const remindAtEpoch = quiz.deadlineEpoch - option.offsetSeconds;
                if (remindAtEpoch > nowEpoch) return;

                const reminderId = buildReminderId({
                    sourceAddress: quiz.sourceAddress,
                    quizId: quiz.quizId,
                    deadlineEpoch: quiz.deadlineEpoch,
                    offsetSeconds: option.offsetSeconds,
                });
                if (sentStore[reminderId]) return;

                reminders.push({
                    id: reminderId,
                    quizId: quiz.quizId,
                    title: quiz.title,
                    sourceAddress: quiz.sourceAddress,
                    deadlineEpoch: quiz.deadlineEpoch,
                    reward: quiz.reward,
                    offsetSeconds: option.offsetSeconds,
                    label: option.label,
                    path: buildAnswerQuizPath(quiz.quizId, quiz.sourceAddress),
                });
            });
        });

    return reminders.sort((left, right) => left.deadlineEpoch - right.deadlineEpoch);
}

function markDeadlineRemindersSent(reminders = []) {
    if (!Array.isArray(reminders) || !reminders.length) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const store = pruneReminderStore(readReminderStore(), nowEpoch);
    reminders.forEach((reminder) => {
        if (!reminder?.id) return;
        store[reminder.id] = {
            deadlineEpoch: Number(reminder.deadlineEpoch || 0),
            sentAtEpoch: nowEpoch,
            sourceAddress: reminder.sourceAddress || "",
            quizId: Number(reminder.quizId || 0),
            offsetSeconds: Number(reminder.offsetSeconds || 0),
        };
    });
    writeReminderStore(store);
}

function formatRemainingTime(offsetSeconds = 0) {
    if (offsetSeconds >= 24 * 60 * 60) {
        return `${Math.round(offsetSeconds / (24 * 60 * 60))}日前`;
    }
    if (offsetSeconds >= 60 * 60) {
        return `${Math.round(offsetSeconds / (60 * 60))}時間前`;
    }
    return `${Math.round(offsetSeconds / 60)}分前`;
}

function createReminderBody(reminder, settings = getDefaultNotificationSettings()) {
    const deadlineText = new Date(Number(reminder.deadlineEpoch || 0) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const lines = [];

    if (settings.includeQuizTitle) {
        lines.push(`問題: ${reminder.title}`);
    }
    if (settings.includeDeadlineTime) {
        lines.push(`締切: ${deadlineText}`);
    }
    if (settings.includeRemainingTime) {
        lines.push(`通知タイミング: ${formatRemainingTime(reminder.offsetSeconds)}`);
    }
    if (settings.includeReward && Number(reminder.reward || 0) > 0) {
        lines.push(`報酬: ${Number(reminder.reward)} TFT`);
    }
    if (settings.includeOpenPrompt) {
        lines.push("未回答のままです。問題を開いて確認してください。");
    }

    return lines.join("\n");
}

function createReminderTitle(reminder, settings = getDefaultNotificationSettings()) {
    if (settings.includeQuizTitle) {
        return `クイズ締切 ${reminder.label} - ${reminder.title}`;
    }
    return `クイズ締切 ${reminder.label}`;
}

function showDeadlineReminderNotification(reminder, settings = getDefaultNotificationSettings()) {
    if (!isNotificationSupported() || getNotificationPermission() !== "granted") return false;

    const notification = new Notification(createReminderTitle(reminder, settings), {
        body: createReminderBody(reminder, settings),
        tag: reminder.id,
        renotify: false,
    });

    notification.onclick = () => {
        try {
            window.focus();
        } catch (error) {
        }
        try {
            window.location.assign(reminder.path);
        } catch (error) {
        }
        notification.close();
    };

    return true;
}

async function checkAndSendDeadlineNotifications(cont) {
    if (!cont) return { sent: 0, reason: "no_contract" };
    const settings = readDeadlineNotificationSettings();
    if (!settings.enabled) return { sent: 0, reason: "disabled" };
    if (!isNotificationSupported()) return { sent: 0, reason: "unsupported" };
    if (getNotificationPermission() !== "granted") return { sent: 0, reason: "permission_not_granted" };

    const inventory = await cont.getQuizInventory();
    const account = await cont.get_address().catch(() => "");
    const settled = await Promise.allSettled(
        (inventory || []).map((ref) => cont.get_quiz_simple(ref.id, ref.address, account))
    );

    const quizzes = settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .filter(Array.isArray);

    const reminders = buildDueDeadlineReminders(quizzes, settings);
    const sent = reminders.filter((reminder) => showDeadlineReminderNotification(reminder, settings));
    markDeadlineRemindersSent(sent);
    return { sent: sent.length, reason: sent.length ? "sent" : "none_due" };
}

export {
    CHECK_INTERVAL_MS,
    INITIAL_CHECK_DELAY_MS,
    SETTINGS_UPDATED_EVENT,
    buildDueDeadlineReminders,
    checkAndSendDeadlineNotifications,
    getDefaultNotificationSettings,
    getNotificationPermission,
    isNotificationSupported,
    readDeadlineNotificationSettings,
    requestDeadlineNotificationPermission,
    saveDeadlineNotificationSettings,
};
