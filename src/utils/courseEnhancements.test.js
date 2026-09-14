import {
    buildBadgeSet,
    buildExtendedCsvData,
    buildFraudAlerts,
    buildReviewList,
    buildWeaknessSummary,
    getAnnouncements,
    getPracticeAttempts,
    publishAnnouncement,
    recordPracticeAttempt,
    removeAnnouncement,
} from "./courseEnhancements";

describe("courseEnhancements utilities", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test("publishes and removes announcements in local storage", () => {
        const announcement = publishAnnouncement({
            title: "資料配布",
            body: "第3回の資料を配布しました。",
            author: "TA",
        });

        expect(getAnnouncements()).toHaveLength(1);
        expect(getAnnouncements()[0]).toMatchObject({
            id: announcement.id,
            title: "資料配布",
            body: "第3回の資料を配布しました。",
            author: "TA",
            pinned: true,
        });

        removeAnnouncement(announcement.id);
        expect(getAnnouncements()).toEqual([]);
    });

    test("records practice attempts and builds review items for unanswered and incorrect quizzes", () => {
        recordPracticeAttempt({
            quizId: 2,
            address: "0xabc",
            answer: "B",
            isCorrect: false,
            title: "第2問",
        });

        expect(getPracticeAttempts()).toHaveLength(1);

        const reviewList = buildReviewList({
            address: "0xAbC",
            practiceAttempts: getPracticeAttempts(),
            quizzes: [
                [1, "", "第1問", "", "", "", "", 0, 0, 0, 0],
                [2, "", "第2問", "", "", "", "", 0, 0, 0, 2],
                [3, "", "第3問", "", "", "", "", 0, 0, 0, 3],
            ],
        });

        expect(reviewList).toEqual([
            expect.objectContaining({ quizId: "1", reason: "未回答" }),
            expect.objectContaining({ quizId: "2", reason: "練習モードで再確認が必要" }),
        ]);
    });

    test("builds badges, fraud alerts, and extended csv rows from logs", () => {
        const logs = [
            { action: "answer_submitted", actor: "0xuser", quizId: "1", createdAt: "2026-04-07T10:00:01.000Z", solvingDurationSeconds: 8 },
            { action: "answer_submitted", actor: "0xuser", quizId: "1", createdAt: "2026-04-07T10:00:10.000Z", solvingDurationSeconds: 9 },
            { action: "answer_submitted", actor: "0xuser", quizId: "1", createdAt: "2026-04-07T10:00:40.000Z", solvingDurationSeconds: 7 },
            { action: "login_success", actor: "0xuser", createdAt: "2026-04-05T01:00:00.000Z" },
            { action: "login_success", actor: "0xuser", createdAt: "2026-04-06T01:00:00.000Z" },
            { action: "login_success", actor: "0xuser", createdAt: "2026-04-07T01:00:00.000Z" },
            { action: "live_message_sent", actor: "0xuser", messageKind: "question", createdAt: "2026-04-07T11:00:00.000Z" },
            { action: "live_message_sent", actor: "0xuser", messageKind: "question", createdAt: "2026-04-07T11:01:00.000Z" },
            { action: "live_message_sent", actor: "0xuser", messageKind: "question", createdAt: "2026-04-07T11:02:00.000Z" },
        ];
        const practiceAttempts = [
            { quizId: "1", address: "0xuser", isCorrect: true },
            { quizId: "2", address: "0xuser", isCorrect: true },
            { quizId: "3", address: "0xuser", isCorrect: true },
            { quizId: "4", address: "0xuser", isCorrect: true },
            { quizId: "5", address: "0xuser", isCorrect: true },
        ];
        const boardLogs = [
            { user: "0xuser", status: "visible" },
            { user: "0xuser", status: "visible" },
        ];

        const badges = buildBadgeSet({ logs, boardLogs, practiceAttempts });
        const alerts = buildFraudAlerts(logs);
        const csvData = buildExtendedCsvData({
            results: [{ student: "0xuser", result: "80000000000000000000" }],
            logs,
            boardLogs,
            reactionHistory: [{
                label: "第3回",
                startedAt: "2026-04-07T09:00:00.000Z",
                endedAt: "2026-04-07T10:30:00.000Z",
                reactions: { understood: 10, repeat: 2, slow: 1, fast: 0 },
            }],
            studentBalanceMap: {
                "0xuser": {
                    tft: 125,
                    ttt: 3000,
                    pol: 1.25,
                },
            },
        });

        expect(badges.map((item) => item.id)).toEqual(
            expect.arrayContaining(["first_answer", "questioner", "practice_master", "regular"])
        );
        expect(alerts).toEqual([
            expect.objectContaining({
                level: "high",
                title: "短時間の連続回答",
            }),
        ]);
        expect(csvData.gradeRows).toContainEqual(["0xuser", "1.6", "3", "3", "2", "125.0000", "3000.0000", "1.250000"]);
        expect(csvData.reactionRows).toContainEqual(["第3回", "2026-04-07T09:00:00.000Z", "2026-04-07T10:30:00.000Z", "10", "2", "1", "0"]);
    });

    test("builds weakness summary for all quizzes and keeps avg duration labels", () => {
        const summary = buildWeaknessSummary({
            quizzes: [
                [1, "", "第1問", "", "", "", "", 0, 4, 10, 0],
                [2, "", "第2問", "", "", "", "", 0, 0, 10, 0],
            ],
            logs: [
                { action: "answer_submitted", quizId: "1", solvingDurationSeconds: 12 },
                { action: "answer_submitted", quizId: "1", totalDurationSeconds: 18 },
            ],
            reactionHistory: [],
        });

        expect(summary.quizzes).toHaveLength(2);
        expect(summary.quizzes.find((item) => item.quizId === "1")).toMatchObject({
            avgDuration: 15,
            avgDurationLabel: "15秒",
            submissionCount: 2,
        });
        expect(summary.quizzes.find((item) => item.quizId === "2")).toMatchObject({
            avgDuration: 0,
            avgDurationLabel: "ログなし",
            submissionCount: 0,
        });
    });
});
