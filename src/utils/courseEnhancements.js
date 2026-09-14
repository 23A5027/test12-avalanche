import { getActivityLogs } from "./activityLog";
import { getBoardLogs } from "./boardModerationLog";
import { convertTftToPoint } from "./quizRewardRate";

const ANNOUNCEMENT_KEY = "web3_quiz_announcements_v1";
const ANNOUNCEMENT_EVENT = "course-announcements-updated";
const PRACTICE_KEY = "web3_quiz_practice_attempts_v1";
const PRACTICE_EVENT = "course-practice-updated";

function safeReadJson(key, fallback = []) {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : fallback;
        return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : (parsed || fallback);
    } catch (error) {
        return fallback;
    }
}

function safeWriteJson(key, value, eventName) {
    localStorage.setItem(key, JSON.stringify(value));
    if (eventName) {
        window.dispatchEvent(new Event(eventName));
    }
}

function getAnnouncements() {
    return safeReadJson(ANNOUNCEMENT_KEY, []);
}

function publishAnnouncement(entry) {
    const announcements = getAnnouncements();
    const next = [{
        id: entry.id || `announcement_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        title: entry.title || "お知らせ",
        body: entry.body || "",
        links: Array.isArray(entry.links) ? entry.links : [],
        createdAt: entry.createdAt || new Date().toISOString(),
        author: entry.author || "Teacher",
        pinned: entry.pinned !== false,
    }, ...announcements].slice(0, 50);
    safeWriteJson(ANNOUNCEMENT_KEY, next, ANNOUNCEMENT_EVENT);
    return next[0];
}

function removeAnnouncement(id) {
    const next = getAnnouncements().filter((item) => item.id !== id);
    safeWriteJson(ANNOUNCEMENT_KEY, next, ANNOUNCEMENT_EVENT);
}

function subscribeAnnouncements(handler) {
    const onStorage = (event) => {
        if (event.key === ANNOUNCEMENT_KEY) handler();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ANNOUNCEMENT_EVENT, handler);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(ANNOUNCEMENT_EVENT, handler);
    };
}

function getPracticeAttempts() {
    return safeReadJson(PRACTICE_KEY, []);
}

function recordPracticeAttempt(entry) {
    const attempts = getPracticeAttempts();
    const next = [{
        id: entry.id || `practice_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        quizId: String(entry.quizId),
        address: String(entry.address || ""),
        answer: String(entry.answer || ""),
        isCorrect: Boolean(entry.isCorrect),
        mode: entry.mode || "practice",
        createdAt: entry.createdAt || new Date().toISOString(),
        title: entry.title || "",
    }, ...attempts].slice(0, 2000);
    safeWriteJson(PRACTICE_KEY, next, PRACTICE_EVENT);
    return next[0];
}

function subscribePracticeAttempts(handler) {
    const onStorage = (event) => {
        if (event.key === PRACTICE_KEY) handler();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PRACTICE_EVENT, handler);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(PRACTICE_EVENT, handler);
    };
}

function getReactionHistorySnapshot() {
    try {
        const raw = localStorage.getItem("board_reaction_history_snapshot_v1");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function getCourseEnhancementSnapshot() {
    return {
        activityLogs: getActivityLogs(),
        boardLogs: getBoardLogs(),
        announcements: getAnnouncements(),
        practiceAttempts: getPracticeAttempts(),
        reactionHistory: getReactionHistorySnapshot(),
    };
}

function buildFraudAlerts(logs = []) {
    const answerLogs = logs.filter((log) => log.action === "answer_submitted");
    const byActorMinute = new Map();
    const byQuizMinute = new Map();

    answerLogs.forEach((log) => {
        const actor = String(log.actor || log.address || "guest");
        const minuteKey = new Date(log.createdAt).toISOString().slice(0, 16);
        const actorKey = `${actor}_${minuteKey}`;
        const quizKey = `${log.quizId || "unknown"}_${minuteKey}`;

        byActorMinute.set(actorKey, (byActorMinute.get(actorKey) || 0) + 1);
        byQuizMinute.set(quizKey, (byQuizMinute.get(quizKey) || 0) + 1);
    });

    const alerts = [];

    [...byActorMinute.entries()].forEach(([key, count]) => {
        if (count >= 3) {
            const [actor, minute] = key.split("_");
            alerts.push({
                id: `actor_${key}`,
                level: "high",
                title: "短時間の連続回答",
                detail: `${actor} が ${minute} に ${count} 回回答しました。`,
            });
        }
    });

    [...byQuizMinute.entries()].forEach(([key, count]) => {
        if (count >= 10) {
            const [quizId, minute] = key.split("_");
            alerts.push({
                id: `quiz_${key}`,
                level: "medium",
                title: "同一時刻の集中回答",
                detail: `問題 ${quizId} に ${minute} の1分間で ${count} 件の回答が集中しました。`,
            });
        }
    });

    return alerts;
}

function buildBadgeSet({ logs = [], boardLogs = [], practiceAttempts = [] }) {
    const answerCount = logs.filter((log) => log.action === "answer_submitted").length;
    const questionCount = logs.filter((log) => log.action === "live_message_sent" && log.messageKind === "question").length;
    const practiceCorrectCount = practiceAttempts.filter((item) => item.isCorrect).length;
    const loginDays = new Set(
        logs
            .filter((log) => log.action === "login_success")
            .map((log) => String(log.createdAt).slice(0, 10))
    ).size;

    const badges = [];
    if (answerCount >= 1) badges.push({ id: "first_answer", label: "初回解答", tone: "blue" });
    if (answerCount >= 10) badges.push({ id: "ten_answers", label: "解答10回達成", tone: "green" });
    if (questionCount >= 3) badges.push({ id: "questioner", label: "質問貢献", tone: "gold" });
    if (practiceCorrectCount >= 5) badges.push({ id: "practice_master", label: "練習モード達人", tone: "purple" });
    if (loginDays >= 3) badges.push({ id: "regular", label: "連続参加", tone: "cyan" });
    return badges;
}

function buildReviewList({ quizzes = [], address = "", practiceAttempts = [] }) {
    const normalizedAddress = String(address || "").toLowerCase();
    const ownPractice = practiceAttempts.filter((item) => String(item.address || "").toLowerCase() === normalizedAddress);
    const latestPracticeByQuiz = new Map();

    ownPractice.forEach((item) => {
        if (!latestPracticeByQuiz.has(item.quizId)) {
            latestPracticeByQuiz.set(item.quizId, item);
        }
    });

    return quizzes.reduce((items, quiz) => {
        const quizId = String(Number(quiz?.[0] ?? ""));
        const status = Number(quiz?.[10] ?? 0);
        const latestPractice = latestPracticeByQuiz.get(quizId);

        if (status === 0 || status === 1 || (latestPractice && !latestPractice.isCorrect)) {
            items.push({
                quizId,
                sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
                title: quiz?.[2] || `問題 ${quizId}`,
                reason:
                    status === 0
                        ? "未回答"
                        : status === 1
                            ? "不正解だった問題"
                            : "練習モードで再確認が必要",
                status,
                practiceCorrect: latestPractice?.isCorrect ?? null,
            });
        }

        return items;
    }, []);
}

function buildWeaknessSummary({ quizzes = [], logs = [], reactionHistory = [] }) {
    const answerLogs = logs.filter((log) => log.action === "answer_submitted");
    const byQuiz = quizzes.map((quiz) => {
        const quizId = String(Number(quiz?.[0] ?? ""));
        const submissions = answerLogs.filter((log) => String(log.quizId || "") === quizId);
        const durations = submissions
            .map((item) => {
                const solvingDuration = Number(item.solvingDurationSeconds || 0);
                if (Number.isFinite(solvingDuration) && solvingDuration > 0) return solvingDuration;
                const totalDuration = Number(item.totalDurationSeconds || 0);
                if (Number.isFinite(totalDuration) && totalDuration > 0) return totalDuration;
                return 0;
            })
            .filter((value) => Number.isFinite(value) && value > 0);
        const avgDuration = durations.length
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : 0;

        return {
            quizId,
            title: quiz?.[2] || `問題 ${quizId}`,
            respondents: Number(quiz?.[8] || 0),
            limit: Number(quiz?.[9] || 0),
            statusCount: Number(quiz?.[10] || 0),
            reward: Number(quiz?.[7] || 0) / 10 ** 18,
            avgDuration,
            avgDurationLabel: avgDuration > 0 ? `${avgDuration}秒` : "ログなし",
            submissionCount: submissions.length,
            responseRate: Number(quiz?.[9] || 0) > 0 ? Math.round((Number(quiz?.[8] || 0) / Number(quiz?.[9] || 1)) * 100) : 0,
        };
    });

    return {
        quizzes: byQuiz.sort((a, b) => {
            if (a.responseRate !== b.responseRate) return a.responseRate - b.responseRate;
            return Number(a.quizId) - Number(b.quizId);
        }),
        reactionHistory,
    };
}

function buildExtendedCsvData({ results = [], logs = [], boardLogs = [], reactionHistory = [], studentBalanceMap = {} }) {
    const attendanceMap = new Map();
    logs.filter((log) => log.action === "login_success").forEach((log) => {
        const actor = String(log.actor || log.address || "");
        const day = String(log.createdAt).slice(0, 10);
        const key = `${actor}_${day}`;
        attendanceMap.set(key, true);
    });

    const answerCountByActor = new Map();
    logs.filter((log) => log.action === "answer_submitted").forEach((log) => {
        const actor = String(log.actor || log.address || "");
        answerCountByActor.set(actor, (answerCountByActor.get(actor) || 0) + 1);
    });

    const boardCountByActor = new Map();
    boardLogs.filter((item) => item.status === "visible").forEach((item) => {
        const actor = String(item.user || "");
        boardCountByActor.set(actor, (boardCountByActor.get(actor) || 0) + 1);
    });

    const gradeRows = [
        ["address", "web3_quiz_score_point", "attendance_days", "answer_count", "board_posts", "actual_tft_balance_live", "actual_ttt_balance_live", "actual_pol_balance_live"],
        ...results.map((item) => {
            const actor = String(item.student || "");
            const attendanceDays = [...attendanceMap.keys()].filter((key) => key.startsWith(`${actor}_`)).length;
            const balances = studentBalanceMap[String(actor || "").trim().toLowerCase()] || {};
            return [
                actor,
                convertTftToPoint(Number(item.result || 0)).toString(),
                String(attendanceDays),
                String(answerCountByActor.get(actor) || 0),
                String(boardCountByActor.get(actor) || 0),
                Number(balances.tft || 0).toFixed(4),
                Number(balances.ttt || 0).toFixed(4),
                Number(balances.pol || 0).toFixed(6),
            ];
        }),
    ];

    const reactionRows = [
        ["label", "startedAt", "endedAt", "understood", "repeat", "slow", "fast"],
        ...reactionHistory.map((session) => [
            session.label || "",
            session.startedAt || "",
            session.endedAt || "",
            String(session.reactions?.understood || 0),
            String(session.reactions?.repeat || 0),
            String(session.reactions?.slow || 0),
            String(session.reactions?.fast || 0),
        ]),
    ];

    return {
        gradeRows,
        reactionRows,
    };
}

export {
    buildBadgeSet,
    buildExtendedCsvData,
    buildFraudAlerts,
    buildReviewList,
    buildWeaknessSummary,
    getAnnouncements,
    getCourseEnhancementSnapshot,
    getPracticeAttempts,
    publishAnnouncement,
    recordPracticeAttempt,
    removeAnnouncement,
    subscribeAnnouncements,
    subscribePracticeAttempts,
};
