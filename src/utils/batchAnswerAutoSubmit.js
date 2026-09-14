import {
    AUTO_SUBMIT_WINDOW_SECONDS,
    getEarliestBatchAnswerDeadlineEpoch,
    getAutoSubmitReadyBatchAnswerQueue,
    removeBatchAnswerQueueItem,
    updateBatchAnswerQueueItem,
} from "./batchAnswerQueue";
import { ACTION_TYPES, appendActivityLog } from "./activityLog";

const AUTO_SUBMIT_CHECK_INTERVAL_MS = 60 * 1000;
const AUTO_SUBMIT_INITIAL_DELAY_MS = 20 * 1000;
const AUTO_SUBMIT_IDLE_RECHECK_MS = 10 * 60 * 1000;

let autoSubmitInFlight = false;

function isVisibleBrowserWindow() {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
}

async function processAutoSubmitBatchAnswers(cont) {
    if (!cont) return { sent: 0, failed: 0, reason: "no_contract" };
    if (autoSubmitInFlight) return { sent: 0, failed: 0, reason: "busy" };
    if (!isVisibleBrowserWindow()) return { sent: 0, failed: 0, reason: "hidden" };

    const nowEpoch = Math.floor(Date.now() / 1000);
    const dueItems = getAutoSubmitReadyBatchAnswerQueue(nowEpoch);
    if (!dueItems.length) return { sent: 0, failed: 0, reason: "none_due" };

    autoSubmitInFlight = true;
    let sent = 0;
    let failed = 0;

    try {
        for (const item of dueItems) {
            const nextAttemptCount = Number(item.autoSubmitAttemptCount || 0) + 1;
            updateBatchAnswerQueueItem(item.key, {
                autoSubmitAttemptCount: nextAttemptCount,
                lastAutoSubmitAttemptAt: new Date().toISOString(),
                lastAutoSubmitStatus: "attempting",
                lastAutoSubmitError: "",
            }, { touchSavedAt: false });

            try {
                await cont.create_answer(
                    Number(item.quizId),
                    String(item.answer || ""),
                    () => {},
                    () => {},
                    String(item.sourceAddress || "")
                );
                removeBatchAnswerQueueItem(item.key);
                sent += 1;
                appendActivityLog(ACTION_TYPES.ANSWER_SUBMITTED, {
                    page: "batch_auto_submit",
                    quizId: Number(item.quizId),
                    quizTitle: item.title || "",
                    sourceAddress: String(item.sourceAddress || ""),
                    answerLength: String(item.answer || "").length,
                    batchMode: true,
                    autoRetry: true,
                    autoSubmitAttemptCount: nextAttemptCount,
                    reason: "deadline_one_hour_auto_submit",
                });
            } catch (error) {
                failed += 1;
                updateBatchAnswerQueueItem(item.key, {
                    autoSubmitAttemptCount: nextAttemptCount,
                    lastAutoSubmitAttemptAt: new Date().toISOString(),
                    lastAutoSubmitStatus: "failed",
                    lastAutoSubmitError: error?.shortMessage || error?.message || "auto_submit_failed",
                }, { touchSavedAt: false });
                appendActivityLog(ACTION_TYPES.ANSWER_SUBMIT_FAILED, {
                    page: "batch_auto_submit",
                    quizId: Number(item.quizId),
                    quizTitle: item.title || "",
                    sourceAddress: String(item.sourceAddress || ""),
                    answerLength: String(item.answer || "").length,
                    batchMode: true,
                    autoRetry: true,
                    autoSubmitAttemptCount: nextAttemptCount,
                    errorMessage: error?.shortMessage || error?.message || "auto_submit_failed",
                    reason: "deadline_one_hour_auto_submit",
                });
            }
        }

        return {
            sent,
            failed,
            reason: sent || failed ? "processed" : "none_due",
        };
    } finally {
        autoSubmitInFlight = false;
    }
}

function getNextBatchAutoSubmitDelayMs(nowEpoch = Math.floor(Date.now() / 1000)) {
    const earliestDeadlineEpoch = Number(getEarliestBatchAnswerDeadlineEpoch() || 0);
    if (!earliestDeadlineEpoch) {
        return AUTO_SUBMIT_IDLE_RECHECK_MS;
    }

    const autoSubmitStartEpoch = earliestDeadlineEpoch - AUTO_SUBMIT_WINDOW_SECONDS;
    if (nowEpoch >= autoSubmitStartEpoch) {
        return AUTO_SUBMIT_CHECK_INTERVAL_MS;
    }

    return Math.max(30 * 1000, (autoSubmitStartEpoch - nowEpoch) * 1000);
}

export {
    AUTO_SUBMIT_CHECK_INTERVAL_MS,
    AUTO_SUBMIT_IDLE_RECHECK_MS,
    AUTO_SUBMIT_INITIAL_DELAY_MS,
    getNextBatchAutoSubmitDelayMs,
    processAutoSubmitBatchAnswers,
};
