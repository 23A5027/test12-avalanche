import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Quiz_list from "./quiz_list";

const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};

describe("Quiz_list", () => {
    test("reports a readable error when a batch fetch fails", async () => {
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const setQuizList = jest.fn();
        const setLoadError = jest.fn();
        const targetRef = { current: null };
        const now_numRef = { current: 5 };
        const cont = {
            get_quiz_list: jest.fn().mockRejectedValue(new Error("rpc error")),
        };

        const originalObserver = window.IntersectionObserver;
        delete window.IntersectionObserver;

        render(
            <MemoryRouter future={routerFuture}>
                <Quiz_list
                    cont={cont}
                    Set_quiz_list={setQuizList}
                    setLoadError={setLoadError}
                    targetRef={targetRef}
                    now_numRef={now_numRef}
                />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(setLoadError).toHaveBeenCalledWith("問題一覧の一部読み込みに失敗しました。再読み込みしてください。");
        });
        expect(setQuizList).not.toHaveBeenCalled();

        window.IntersectionObserver = originalObserver;
        consoleErrorSpy.mockRestore();
    });
});
