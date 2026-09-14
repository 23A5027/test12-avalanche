import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Contracts_MetaMask } from "../../../contract/contracts";
import View_answers, { buildAnswerExportRows, buildRewardPayoutExportRows, buildExplorerTxUrl } from "./view_answers";
import { getRewardPayoutEntries, syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";

const mockContract = {
    get_all_quiz_simple_list: jest.fn(),
    get_quiz: jest.fn(),
    get_user_data: jest.fn(),
    get_student_list: jest.fn(),
    get_students_answer_hash_list: jest.fn(),
    get_student_answer_detail: jest.fn(),
};

jest.mock("../../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../../utils/activityLog", () => ({
    getMergedActivityLogs: jest.fn(() => [
        {
            id: "log-1",
            action: "answer_submitted",
            address: "0x1111111111111111111111111111111111111111",
            quizId: 1,
            sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
            txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            verificationStatus: "receipt_confirmed",
        },
    ]),
    syncSharedActivityLogs: jest.fn(async () => [
        {
            id: "log-1",
            action: "answer_submitted",
            address: "0x1111111111111111111111111111111111111111",
            quizId: 1,
            sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
            txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            verificationStatus: "receipt_confirmed",
        },
    ]),
}));

jest.mock("../../../utils/rewardPayoutLedger", () => ({
    getRewardPayoutEntries: jest.fn(() => [
        {
            id: "reward-1",
            quizId: 1,
            sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
            quizTitle: "確認用クイズ",
            studentAddress: "0x1111111111111111111111111111111111111111",
            studentName: "学生A",
            resultState: "correct",
            rewardTft: 50,
            txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            paidAt: "2026-05-27T10:00:00.000Z",
            mode: "manual",
            contractTypeLabel: "現在コントラクト",
            confirmed: true,
        },
    ]),
    syncRewardPayoutLedgerFromServer: jest.fn(async () => [
        {
            id: "reward-1",
            quizId: 1,
            sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
            quizTitle: "確認用クイズ",
            studentAddress: "0x1111111111111111111111111111111111111111",
            studentName: "学生A",
            resultState: "correct",
            rewardTft: 50,
            txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            paidAt: "2026-05-27T10:00:00.000Z",
            mode: "manual",
            contractTypeLabel: "現在コントラクト",
            confirmed: true,
        },
    ]),
}));

describe("View_answers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Contracts_MetaMask.mockImplementation(() => mockContract);
        getRewardPayoutEntries.mockReturnValue([
            {
                id: "reward-1",
                quizId: 1,
                sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
                quizTitle: "確認用クイズ",
                studentAddress: "0x1111111111111111111111111111111111111111",
                studentName: "学生A",
                resultState: "correct",
                rewardTft: 50,
                txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                paidAt: "2026-05-27T10:00:00.000Z",
                mode: "manual",
                contractTypeLabel: "現在コントラクト",
                confirmed: true,
            },
        ]);
        syncRewardPayoutLedgerFromServer.mockResolvedValue([
            {
                id: "reward-1",
                quizId: 1,
                sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
                quizTitle: "確認用クイズ",
                studentAddress: "0x1111111111111111111111111111111111111111",
                studentName: "学生A",
                resultState: "correct",
                rewardTft: 50,
                txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                paidAt: "2026-05-27T10:00:00.000Z",
                mode: "manual",
                contractTypeLabel: "現在コントラクト",
                confirmed: true,
            },
        ]);
        mockContract.get_all_quiz_simple_list.mockResolvedValue([
            Object.assign([1, "0xteacher", "確認用クイズ", "", "", 0, 0, 0, 1, 10, 0, false], {
                sourceAddress: "0xeb196c161EFA30939f78170694bb908E17fd1479",
            }),
        ]);
        mockContract.get_quiz.mockResolvedValue([
            1,
            "0xteacher",
            "確認用クイズ",
            "",
            "",
            "問題本文",
            "A,B,C",
            0,
            0,
            0,
            50000000000000000000,
            1,
            10,
            0,
            "",
            false,
        ]);
        mockContract.get_student_list.mockResolvedValue(["0x1111111111111111111111111111111111111111"]);
        mockContract.get_user_data.mockResolvedValue(["学生A"]);
        mockContract.get_students_answer_hash_list.mockResolvedValue({
            "0x1111111111111111111111111111111111111111": "0x0000000000000000000000000000000000000000000000000000000000000000",
        });
        mockContract.get_student_answer_detail.mockResolvedValue({
            answerText: "1/6",
            state: 3,
            answerTime: 1710000000,
            reward: 0,
            result: false,
            submitted: true,
            attemptCount: 1,
        });
    });

    test("shows submitted student answers from answer_text even when hash decoding is empty", async () => {
        render(<View_answers />);

        const quizButton = await screen.findByRole("button", { name: /確認用クイズ/ });
        fireEvent.click(quizButton);

        await waitFor(() => {
            expect(mockContract.get_student_answer_detail).toHaveBeenCalledWith(
                "0x1111111111111111111111111111111111111111",
                1,
                "0xeb196c161EFA30939f78170694bb908E17fd1479"
            );
        });

        expect(await screen.findByText("1/6")).toBeInTheDocument();
        expect(screen.getByText("回答済み")).toBeInTheDocument();
        expect(screen.getByText("保存確認")).toBeInTheDocument();
        expect(screen.getByText("Tx Hash")).toBeInTheDocument();
        expect(screen.getByText("回答保存済み")).toBeInTheDocument();
        expect(screen.getByText("この問題の保存先 quiz.sol")).toBeInTheDocument();
        expect(screen.getByText("0xeb196c161EFA30939f78170694bb908E17fd1479")).toBeInTheDocument();
        expect(screen.getAllByText("契約種別: 現在コントラクト").length).toBeGreaterThan(0);
        expect(screen.getByText("✅ 回答済:", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("回答報酬の付与履歴")).toBeInTheDocument();
        expect(screen.getByText("📤 回答報酬履歴を CSV 出力")).toBeInTheDocument();
        expect(screen.getByText("📤 全問題の回答一覧を CSV 出力")).toBeInTheDocument();
        expect(screen.getByText("📤 全問題の回答一覧を JSON 出力")).toBeInTheDocument();
        expect(screen.getByText("学生A")).toBeInTheDocument();
    });

    test("builds answer and reward payout export rows with explorer urls", () => {
        expect(buildExplorerTxUrl("0xabc")).toBe("https://explorer-test.avax.network/c-chain/tx/0xabc");

        const answerRows = buildAnswerExportRows([
            {
                address: "0x1111111111111111111111111111111111111111",
                answer: "1/6",
                hash: "0xhash",
                txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                verificationStatus: "receipt_confirmed",
            },
        ], "0xeb196c161EFA30939f78170694bb908E17fd1479:1", "確認用クイズ");
        expect(answerRows[0].txUrl).toBe("https://explorer-test.avax.network/c-chain/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
        expect(answerRows[0].verificationStatus).toBe("receipt_confirmed");
        expect(answerRows[0].sourceAddress).toBe("0xeb196c161EFA30939f78170694bb908E17fd1479");
        expect(answerRows[0].submitted).toBe("false");
        expect(answerRows[0].rewardTft).toBe(0);

        const rewardRows = buildRewardPayoutExportRows([
            {
                quizId: 1,
                quizTitle: "確認用クイズ",
                studentAddress: "0x1111111111111111111111111111111111111111",
                studentName: "学生A",
                resultState: "correct",
                rewardTft: 50,
                txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                paidAt: "2026-05-27T10:00:00.000Z",
                mode: "manual",
                contractTypeLabel: "現在コントラクト",
                confirmed: true,
            },
        ]);
        expect(rewardRows[0].txUrl).toBe("https://explorer-test.avax.network/c-chain/tx/0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
        expect(rewardRows[0].walletAddress).toBe("0x1111111111111111111111111111111111111111");
    });
});
