import {
    buildBatchAnswerKey,
    getAutoSubmitReadyBatchAnswerQueue,
    getBatchAnswerQueue,
    saveBatchAnswerQueueItem,
    updateBatchAnswerQueueItem,
} from "./batchAnswerQueue";

describe("batchAnswerQueue auto submit helpers", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test("returns queued answers due within one hour", () => {
        const nowEpoch = 1_800_000_000;
        saveBatchAnswerQueueItem({
            key: buildBatchAnswerKey(1, "0xabc"),
            quizId: 1,
            sourceAddress: "0xabc",
            title: "quiz",
            answer: "1",
            deadlineEpoch: nowEpoch + 30 * 60,
        });

        const dueItems = getAutoSubmitReadyBatchAnswerQueue(nowEpoch);
        expect(dueItems).toHaveLength(1);
        expect(dueItems[0].quizId).toBe(1);
    });

    test("skips queued answers still outside auto submit window", () => {
        const nowEpoch = 1_800_000_000;
        saveBatchAnswerQueueItem({
            key: buildBatchAnswerKey(2, "0xdef"),
            quizId: 2,
            sourceAddress: "0xdef",
            title: "quiz",
            answer: "2",
            deadlineEpoch: nowEpoch + 2 * 60 * 60,
        });

        expect(getAutoSubmitReadyBatchAnswerQueue(nowEpoch)).toHaveLength(0);
    });

    test("preserves savedAt when updating auto submit metadata", () => {
        const item = saveBatchAnswerQueueItem({
            key: buildBatchAnswerKey(3, "0xghi"),
            quizId: 3,
            sourceAddress: "0xghi",
            title: "quiz",
            answer: "3",
            deadlineEpoch: 1_800_000_100,
            savedAt: "2026-05-20T00:00:00.000Z",
        });

        const updated = updateBatchAnswerQueueItem(item.key, {
            autoSubmitAttemptCount: 1,
            lastAutoSubmitStatus: "failed",
        }, { touchSavedAt: false });

        expect(updated.savedAt).toBe("2026-05-20T00:00:00.000Z");
        expect(getBatchAnswerQueue()[0].savedAt).toBe("2026-05-20T00:00:00.000Z");
    });
});
