import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Quiz_list from "./quiz_list";

const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};

describe("Edit Quiz_list", () => {
    test("loads raw quiz data for the management screen", async () => {
        const setLoadError = jest.fn();
        const setQuizList = jest.fn((updater) => updater([]));
        const targetRef = { current: null };
        const now_numRef = { current: 5 };
        const quizBatch = [
            [5, "0x1", "管理テスト問題", "説明", "", 100, 200, 300, 4, 10, 0, false],
        ];
        const cont = {
            get_quiz_list: jest.fn().mockResolvedValue(quizBatch),
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
            expect(cont.get_quiz_list).toHaveBeenCalled();
            expect(setQuizList).toHaveBeenCalled();
        });
        expect(setLoadError).toHaveBeenCalledWith("");

        window.IntersectionObserver = originalObserver;
    });
});
