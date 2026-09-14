import { render, screen, waitFor } from "@testing-library/react";
import View_result from "./view_results";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";

jest.mock("react-csv", () => ({
    CSVLink: ({ children }) => <span>{children}</span>,
}));

jest.mock("../../../utils/activityLog", () => ({
    ACTION_TYPES: {},
    appendActivityLog: jest.fn(),
    getActivityLogs: jest.fn(() => []),
}));

jest.mock("../../../utils/courseEnhancements", () => ({
    buildExtendedCsvData: jest.fn(() => ({ gradeRows: [], reactionRows: [] })),
    getCourseEnhancementSnapshot: jest.fn(() => ({ boardLogs: [], reactionHistory: [] })),
}));

jest.mock("../../../utils/rewardPayoutLedger", () => ({
    getRewardPayoutEntries: jest.fn(() => []),
    syncRewardPayoutLedgerFromServer: jest.fn(async () => []),
}));

describe("View_result", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        syncRewardPayoutLedgerFromServer.mockResolvedValue([]);
        jest.spyOn(Contracts_MetaMask.prototype, "get_token_balance").mockResolvedValue(125);
        jest.spyOn(Contracts_MetaMask.prototype, "get_ttt_balance").mockResolvedValue(3000);
        jest.spyOn(Contracts_MetaMask.prototype, "get_pol_balance").mockResolvedValue(1.25);
        jest.spyOn(Contracts_MetaMask.prototype, "get_student_list").mockResolvedValue(["0xabc"]);
        jest.spyOn(Contracts_MetaMask.prototype, "get_data_for_survey_users").mockResolvedValue([
            { user: "0xabc", create_quiz_count: 0, result: 15000000000000000000n, answer_count: 1 },
        ]);
        jest.spyOn(Contracts_MetaMask.prototype, "get_data_for_survey_quizs").mockResolvedValue([
            { reward: 15000000000000000000n, respondent_count: 1 },
        ]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("shows actual TFT, TTT, and POL balances for each student", async () => {
        const cont = {
            get_results: jest.fn().mockResolvedValue([
                { student: "0xabc", result: 15 },
            ]),
        };

        render(<View_result cont={cont} />);

        expect(await screen.findByText("📊 生徒の成績")).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getAllByText("125.0000 TFT").length).toBeGreaterThan(0);
            expect(screen.getAllByText("3000.0000 TTT").length).toBeGreaterThan(0);
            expect(screen.getAllByText("1.250000 POL").length).toBeGreaterThan(0);
        });
    });

    test("shows registered student token holdings in the live balance table", async () => {
        const cont = {
            get_results: jest.fn().mockResolvedValue([
                { student: "0xabc", result: 15 },
            ]),
        };

        render(<View_result cont={cont} />);

        expect(await screen.findByText("🪙 登録学生の現在トークン残高")).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getAllByText("0xabc").length).toBeGreaterThan(0);
            expect(screen.getAllByText("125.0000 TFT").length).toBeGreaterThan(0);
        });
    });
});
