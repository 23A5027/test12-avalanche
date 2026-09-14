import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import Investment_page from "./investment_page";

const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};
const mockNavigate = jest.fn();
const mockContract = {
    get_student_list: jest.fn(),
    get_user_data: jest.fn(),
    get_student_answer_detail: jest.fn(),
    get_quiz_simple: jest.fn(),
    settle_quiz_rewards_manually: jest.fn(),
    investment_to_quiz: jest.fn(),
};

jest.mock("../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));

jest.mock("../../utils/rewardPayoutLedger", () => ({
    syncRewardPayoutLedgerFromServer: jest.fn(async () => []),
    persistRewardPayoutEntriesToServer: jest.fn(async () => []),
}));

jest.mock("react-router-dom", () => {
    const actual = jest.requireActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe("Investment_page", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockImplementation(() => true);
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

    beforeEach(() => {
        jest.clearAllMocks();
        Contracts_MetaMask.mockImplementation(() => mockContract);
        useAccessControl.mockReturnValue({
            isLoading: false,
            isTeacher: true,
        });
        mockContract.get_student_list.mockResolvedValue(["0x1111111111111111111111111111111111111111"]);
        mockContract.get_user_data.mockResolvedValue(["学生A"]);
        mockContract.get_quiz_simple.mockResolvedValue([
            1,
            "0xteacher",
            "確認用クイズ",
            "",
            "",
            0,
            0,
            50000000000000000000,
            1,
            10,
            0,
            false,
        ]);
        mockContract.get_student_answer_detail.mockResolvedValue({
            answerText: "1/6",
            submitted: true,
            state: 3,
            answerTime: 1710000000,
            reward: 0,
            result: false,
        });
        mockContract.settle_quiz_rewards_manually.mockResolvedValue({
            res: {
                transactionHash: "0xabc",
                status: "success",
            },
            payoutReceipts: [],
            hash: "",
        });
        mockContract.investment_to_quiz.mockResolvedValue({
            res: {
                transactionHash: "0xdef",
                status: "success",
            },
        });
    });

    afterAll(() => {
        confirmSpy.mockRestore();
        alertSpy.mockRestore();
    });

    test("shows legacy/current contract info and confirms destination address before payout", async () => {
        render(
            <MemoryRouter initialEntries={["/investment_page/q1-2"]} future={routerFuture}>
                <Routes>
                    <Route path="/investment_page/:id" element={<Investment_page />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("この問題の保存先 quiz.sol")).toBeInTheDocument();
        expect(screen.getByText("0x55B3977C7B7b913eaf175A7364c8375732d22241")).toBeInTheDocument();
        expect(screen.getByText("旧コントラクト")).toBeInTheDocument();
        expect(await screen.findByText("学生A")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("追加で預けるTFTを入力（未入力なら 0）"), {
            target: { value: "50" },
        });
        fireEvent.click(screen.getByRole("radio", { name: /採点結果を確定して報酬を払い出す/ }));
        await waitFor(() => {
            expect(screen.getByRole("radio", { name: /採点結果を確定して報酬を払い出す/ })).toBeChecked();
        });
        fireEvent.click(screen.getByRole("button", { name: "正解にする" }));
        fireEvent.click(screen.getByRole("button", { name: "🚀 採点結果を反映する" }));

        await waitFor(() => {
            expect(confirmSpy).toHaveBeenCalled();
        });

        expect(confirmSpy.mock.calls[0][0]).toContain("保存先 quiz.sol: 0x55B3977C7B7b913eaf175A7364c8375732d22241");
        expect(confirmSpy.mock.calls[0][0]).toContain("契約種別: 旧コントラクト");

        expect(mockContract.settle_quiz_rewards_manually).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );
    });
});
