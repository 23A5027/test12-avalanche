import {
    buildPendingQuizKey,
    clearPendingCreatedQuizzes,
    getPendingCreatedQuizzes,
    pruneResolvedPendingCreatedQuizzes,
    removePendingCreatedQuiz,
    savePendingCreatedQuiz,
    toPendingQuizSimple,
} from "./pendingCreatedQuizzes";

describe("pendingCreatedQuizzes", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test("saves and reads pending quizzes in newest-first order", () => {
        const now = Date.now();
        savePendingCreatedQuiz({
            quizId: 1,
            sourceAddress: "0xabc",
            title: "first",
            createdAt: new Date(now - 60 * 1000).toISOString(),
        });
        savePendingCreatedQuiz({
            quizId: 2,
            sourceAddress: "0xabc",
            title: "second",
            createdAt: new Date(now).toISOString(),
        });

        const entries = getPendingCreatedQuizzes();
        expect(entries).toHaveLength(2);
        expect(entries[0].quizId).toBe(2);
        expect(entries[1].quizId).toBe(1);
    });

    test("removes resolved pending quizzes when on-chain data is available", () => {
        savePendingCreatedQuiz({
            quizId: 5,
            sourceAddress: "0xdef",
            title: "created",
        });

        pruneResolvedPendingCreatedQuizzes([
            Object.assign([5, "0xteacher", "created", "", "", 1710000000], { sourceAddress: "0xdef" }),
        ]);

        expect(getPendingCreatedQuizzes()).toHaveLength(0);
    });

    test("can remove a single pending quiz manually", () => {
        savePendingCreatedQuiz({
            quizId: 7,
            sourceAddress: "0x123",
            title: "created",
        });

        removePendingCreatedQuiz(7, "0x123");
        expect(getPendingCreatedQuizzes()).toHaveLength(0);
    });

    test("builds a quiz-like object for immediate list rendering", () => {
        const pending = toPendingQuizSimple({
            quizId: 9,
            sourceAddress: "0x456",
            title: "new quiz",
            explanation: "desc",
            rewardWei: "50000000000000000000",
        });

        expect(pending[0]).toBe(9);
        expect(pending[2]).toBe("new quiz");
        expect(pending.pendingCreated).toBe(true);
        expect(buildPendingQuizKey(pending[0], pending.sourceAddress)).toBe("0x456:9");
    });

    afterEach(() => {
        clearPendingCreatedQuizzes();
    });
});
