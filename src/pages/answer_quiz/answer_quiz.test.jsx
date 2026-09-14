import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import Answer_quiz from "./answer_quiz";

const mockNavigate = jest.fn();
const mockRecordPracticeAttempt = jest.fn();
const mockAlert = jest.spyOn(window, "alert").mockImplementation(() => {});
const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};
const buildQuizData = ({ title = "練習問題", deadline = "0", correctAnswer = "A", isPayment = false, content = "問題本文" } = {}) => ([
    1,
    "0xteacher",
    title,
    "説明",
    "",
    content,
    "A,B,C",
    0,
    "0",
    deadline,
    0,
    0,
    0,
    0,
    correctAnswer,
    isPayment,
]);
const buildSimpleQuizData = ({ title = "練習問題", state = 0, isPayment = false } = {}) => ([
    1,
    "0xteacher",
    title,
    "説明",
    "",
    0,
    0,
    0,
    0,
    0,
    state,
    isPayment,
]);
const mockContract = {
    get_quiz: jest.fn(),
    get_quiz_simple: jest.fn(),
    get_quiz_with_source: jest.fn(),
    create_answer: jest.fn(),
};

jest.mock("@uiw/react-md-editor", () => ({
    __esModule: true,
    default: {
        Markdown: ({ source }) => <div>{source}</div>,
    },
}));

jest.mock("../../contract/wait_Modal", () => () => null);

jest.mock("../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));

jest.mock("../../utils/courseEnhancements", () => ({
    recordPracticeAttempt: (...args) => mockRecordPracticeAttempt(...args),
}));

jest.mock("../../utils/activityLog", () => ({
    ACTION_TYPES: {},
    appendActivityLog: jest.fn(),
    clearDraft: jest.fn(),
    getDraft: jest.fn(() => ""),
    logPageView: jest.fn(),
    saveDraft: jest.fn(),
}));

jest.mock("react-router-dom", () => {
    const actual = jest.requireActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe("Answer_quiz practice mode", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        Contracts_MetaMask.mockImplementation(() => mockContract);
        useAccessControl.mockReturnValue({
            isLoading: false,
            canAnswerQuiz: true,
            address: "0xpractice",
        });
        const quizData = buildQuizData();
        const simpleQuizData = buildSimpleQuizData();
        mockContract.get_quiz.mockResolvedValue(quizData);
        mockContract.get_quiz_simple.mockResolvedValue(simpleQuizData);
        mockContract.get_quiz_with_source.mockResolvedValue({
            quizData,
            simpleQuizData,
            sourceAddress: "",
        });
    });

    test("records attempts and does not reveal the correct answer text", async () => {
        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1?practice=1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("練習問題")).toBeInTheDocument();

        fireEvent.click(screen.getByDisplayValue("B"));
        fireEvent.click(screen.getByRole("button", { name: "練習として判定" }));

        await waitFor(() => {
            expect(mockRecordPracticeAttempt).toHaveBeenCalledWith(
                expect.objectContaining({
                    quizId: 1,
                    address: "0xpractice",
                    answer: "B",
                    isCorrect: false,
                    title: "練習問題",
                })
            );
        });

        expect(screen.getByText("練習モード: まだ復習が必要です。")).toBeInTheDocument();
        expect(screen.queryByText(/正解:/)).not.toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    afterAll(() => {
        mockAlert.mockRestore();
    });

    test("submits a normal answer and returns to the quiz list", async () => {
        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("練習問題")).toBeInTheDocument();

        fireEvent.click(screen.getByDisplayValue("A"));
        fireEvent.click(screen.getByRole("button", { name: "回答を送信" }));

        await waitFor(() => {
            expect(mockContract.create_answer).toHaveBeenCalledWith(
                1,
                "A",
                expect.any(Function),
                expect.any(Function),
                "0x55B3977C7B7b913eaf175A7364c8375732d22241"
            );
        });
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/list_quiz");
        });
        expect(mockRecordPracticeAttempt).not.toHaveBeenCalled();
    });

    test("shows the registered correct answer automatically after the deadline", async () => {
        mockContract.get_quiz_with_source.mockResolvedValueOnce({
            quizData: buildQuizData({ title: "締切後問題", deadline: "1" }),
            simpleQuizData: buildSimpleQuizData({ title: "締切後問題" }),
            sourceAddress: "",
        });

        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("締切後問題")).toBeInTheDocument();
        expect(await screen.findByText(/正解:/)).toBeInTheDocument();
    });

    test("disables submitting before the quiz start time", async () => {
        const futureStart = String(Math.floor(Date.now() / 1000) + 3600);
        mockContract.get_quiz_with_source.mockResolvedValueOnce({
            quizData: [
                ...buildQuizData({ title: "開始前問題" }).slice(0, 8),
                futureStart,
                "9999999999",
                ...buildQuizData({ title: "開始前問題" }).slice(10),
            ],
            simpleQuizData: buildSimpleQuizData({ title: "開始前問題" }),
            sourceAddress: "",
        });

        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("開始前問題")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "回答開始前" })).toBeDisabled();
        expect(mockContract.create_answer).not.toHaveBeenCalled();
    });

    test("blocks unanswered quizzes after the deadline", async () => {
        const pastDeadline = String(Math.floor(Date.now() / 1000) - 1);
        mockContract.get_quiz_with_source.mockResolvedValueOnce({
            quizData: buildQuizData({ title: "締切済み未回答", deadline: pastDeadline }),
            simpleQuizData: buildSimpleQuizData({ title: "締切済み未回答", state: 0 }),
            sourceAddress: "",
        });

        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("締切済み未回答")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "回答締切後" })).toBeDisabled();
        expect(screen.getByText("回答時間が終了しました。未回答のまま締め切られています。")).toBeInTheDocument();
        expect(mockContract.create_answer).not.toHaveBeenCalled();
    });

    test("blocks updating submitted answers after the deadline even when multiple answers are allowed", async () => {
        const pastDeadline = String(Math.floor(Date.now() / 1000) - 1);
        const content = '<!--web3quiz:{"allowMultipleAnswers":true}-->\n問題本文';
        mockContract.get_quiz_with_source.mockResolvedValueOnce({
            quizData: buildQuizData({ title: "締切済み再回答不可", deadline: pastDeadline, content }),
            simpleQuizData: buildSimpleQuizData({ title: "締切済み再回答不可", state: 3 }),
            sourceAddress: "",
        });
        localStorage.setItem("quiz_answer_default_1", "A");

        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("締切済み再回答不可")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "回答締切後" })).toBeDisabled();
        expect(screen.getByText("回答は送信済みです。締切または支払い確定後のため、いまは更新できません。")).toBeInTheDocument();
        expect(mockContract.create_answer).not.toHaveBeenCalled();
    });

    test("shows quiz content in view-only mode when the user cannot answer", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canAnswerQuiz: false,
            address: "",
        });

        render(
            <MemoryRouter initialEntries={["/answer_quiz/c-1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("練習問題")).toBeInTheDocument();
        expect(screen.getByText("問題本文")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "閲覧のみ" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "閲覧のみ" })).toBeDisabled();
    });
});
