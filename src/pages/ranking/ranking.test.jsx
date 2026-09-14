import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Ranking from "./ranking";
import { Contracts_MetaMask } from "../../contract/contracts";
import { getCourseEnhancementSnapshot } from "../../utils/courseEnhancements";
import { syncRewardPayoutLedgerFromServer } from "../../utils/rewardPayoutLedger";

jest.mock("../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../utils/courseEnhancements", () => ({
    getCourseEnhancementSnapshot: jest.fn(),
}));

jest.mock("../../utils/rewardPayoutLedger", () => ({
    syncRewardPayoutLedgerFromServer: jest.fn(async () => []),
}));

describe("Ranking", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Contracts_MetaMask.mockImplementation(() => ({
            get_address: jest.fn().mockResolvedValue("0xme"),
            get_results: jest.fn().mockResolvedValue([
                { student: "0xaaa", result: 200 },
                { student: "0xme", result: 150 },
                { student: "0xbbb", result: 50 },
            ]),
        }));
        getCourseEnhancementSnapshot.mockReturnValue({
            boardLogs: [
                { user: "Alice", status: "visible" },
                { user: "Alice", status: "visible" },
                { user: "Bob", status: "visible" },
            ],
        });
        syncRewardPayoutLedgerFromServer.mockResolvedValue([]);
    });

    test("switches between score ranking and board participation ranking", async () => {
        render(<Ranking />);

        expect(await screen.findByText("あなたの順位")).toBeInTheDocument();
        expect(screen.getByText("2位 / 3人")).toBeInTheDocument();
        expect(screen.getAllByText("3.0 pts").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "掲示板参加" }));

        await waitFor(() => {
            expect(screen.getByText("Alice")).toBeInTheDocument();
        });
        expect(screen.getByText("2 posts")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByText("1 posts")).toBeInTheDocument();
    });
});
