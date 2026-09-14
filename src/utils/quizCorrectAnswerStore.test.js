import { getRegisteredCorrectAnswer, setRegisteredCorrectAnswer } from "./quizCorrectAnswerStore";

describe("quizCorrectAnswerStore", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test("stores and reads registered correct answers by quiz id and contract address", () => {
        setRegisteredCorrectAnswer(3, "42", "0xabc");
        setRegisteredCorrectAnswer(3, "99", "0xdef");

        expect(getRegisteredCorrectAnswer(3, "0xabc")).toBe("42");
        expect(getRegisteredCorrectAnswer("3", "0xdef")).toBe("99");
        expect(getRegisteredCorrectAnswer(99, "0xabc")).toBe("");
    });

    test("falls back to legacy storage when scoped answer is missing", () => {
        localStorage.setItem(
            "web3_quiz_registered_correct_answers_v1",
            JSON.stringify({ 7: "legacy-answer" })
        );

        expect(getRegisteredCorrectAnswer(7, "0xabc")).toBe("legacy-answer");
    });
});
