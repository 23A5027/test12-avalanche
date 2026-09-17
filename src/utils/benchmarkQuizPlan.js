const BENCHMARK_STUDENT_ADDRESS = "0xfE80703A3d906AdFED06C1452f087D91d064Da9D";
const BENCHMARK_ANSWER = "2";
const BENCHMARK_QUIZ_START_NUMBER = 33;
const BENCHMARK_QUIZ_END_NUMBER = 62;
const BENCHMARK_QUIZ_DEADLINE = "2026-12-31T23:59";
const BENCHMARK_QUIZ_CHOICES = ["1", "2", "3", "4"];

function formatBenchmarkQuizNumber(value) {
    return String(value).padStart(2, "0");
}

function formatBenchmarkQuizTitle(value) {
    return `Benchmark Test Quiz ${formatBenchmarkQuizNumber(value)}`;
}

function getBenchmarkQuizNumbers(startNumber = BENCHMARK_QUIZ_START_NUMBER, endNumber = BENCHMARK_QUIZ_END_NUMBER) {
    return Array.from(
        { length: endNumber - startNumber + 1 },
        (_, index) => startNumber + index
    );
}

function getBenchmarkQuizTitles(startNumber = BENCHMARK_QUIZ_START_NUMBER, endNumber = BENCHMARK_QUIZ_END_NUMBER) {
    return getBenchmarkQuizNumbers(startNumber, endNumber).map(formatBenchmarkQuizTitle);
}

function createBenchmarkQuizPayloads(replyStartline, {
    startNumber = BENCHMARK_QUIZ_START_NUMBER,
    endNumber = BENCHMARK_QUIZ_END_NUMBER,
} = {}) {
    return getBenchmarkQuizNumbers(startNumber, endNumber).map((number) => ({
        id: `benchmark_test_quiz_${formatBenchmarkQuizNumber(number)}_${Date.now()}`,
        title: formatBenchmarkQuizTitle(number),
        explanation: "",
        thumbnail_url: "",
        content: "1 + 1 = ?",
        allowMultipleAnswers: false,
        answer_type: 0,
        answer_data: [...BENCHMARK_QUIZ_CHOICES],
        correct: BENCHMARK_ANSWER,
        reply_startline: replyStartline,
        reply_deadline: BENCHMARK_QUIZ_DEADLINE,
        reward: 0,
        correct_limit: 1,
    }));
}

function parseBenchmarkQuizNumber(title) {
    const match = String(title || "").match(/^Benchmark Test Quiz (\d{2})$/);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isInteger(value)) return null;
    if (value < BENCHMARK_QUIZ_START_NUMBER || value > BENCHMARK_QUIZ_END_NUMBER) return null;
    return value;
}

export {
    BENCHMARK_ANSWER,
    BENCHMARK_QUIZ_DEADLINE,
    BENCHMARK_QUIZ_END_NUMBER,
    BENCHMARK_QUIZ_START_NUMBER,
    BENCHMARK_STUDENT_ADDRESS,
    createBenchmarkQuizPayloads,
    formatBenchmarkQuizTitle,
    getBenchmarkQuizNumbers,
    getBenchmarkQuizTitles,
    parseBenchmarkQuizNumber,
};
