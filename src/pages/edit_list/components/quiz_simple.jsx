import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./quiz_simple.css";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { buildAnswerQuizPath, buildAnswerQuizState, buildEditQuizPath, buildInvestmentQuizPath, rememberQuizSource } from "../../../utils/quizLinks";

/* ── 定数定義 ── */
const QUIZ_INDEX = {
    ID: 0,
    OWNER: 1,
    TITLE: 2,
    EXPLANATION: 3,
    THUMBNAIL: 4,
    START_TIME: 5,
    DEADLINE: 6,
    REWARD: 7,
    ANSWER_COUNT: 8,
    CORRECT_LIMIT: 9,
    STATUS: 10,
    IS_PAYMENT: 11,
};

const STATUS_MAP = {
    0: { label: "未回答", className: "badge-unanswered", glow: "glow-unanswered" },
    1: { label: "不正解", className: "badge-incorrect", glow: "glow-incorrect" },
    2: { label: "正解", className: "badge-correct", glow: "glow-correct" },
    3: { label: "解答済み", className: "badge-answered", glow: "glow-answered" },
};

function Time_diff(props) {
    function convertSecondsToHours(secondsLimit, secondsStart) {
        let isBeforeStartline = false;

        const date1 = new Date();
        const date2 = new Date(secondsLimit * 1000);
        const date3 = new Date(secondsStart * 1000);

        const epochTime1 = Math.floor(date1.getTime() / 1000);
        const epochTime2 = Math.floor(date2.getTime() / 1000);
        const epochTime3 = Math.floor(date3.getTime() / 1000);

        let elapsedTime = 0;

        if (epochTime1 < epochTime3) {
            elapsedTime = Math.floor(Math.abs(epochTime3 - epochTime1));
            elapsedTime = new Date(elapsedTime * 1000);
            isBeforeStartline = true;
        } else {
            elapsedTime = Math.floor(Math.abs(epochTime2 - epochTime1));
            elapsedTime = new Date(elapsedTime * 1000);
        }

        const labels = ["年", "ヶ月", "日", "時間", "分", "秒"];
        let date = [];
        date.push(elapsedTime.getUTCFullYear() - 1970);
        date.push(elapsedTime.getUTCMonth());
        date.push(elapsedTime.getUTCDate() - 1);
        date.push(elapsedTime.getUTCHours());
        date.push(elapsedTime.getUTCMinutes());
        date.push(elapsedTime.getUTCSeconds());
        let res = "";
        let i = 0;

        for (i = 0; i <= date.length; i++) {
            if (date[i] !== 0) break;
        }
        for (i; i < date.length; i++) {
            res += date[i].toString() + labels[i];
        }

        if (isBeforeStartline) {
            return "回答開始まで " + res;
        } else {
            if (epochTime2 - epochTime1 > 0) {
                return "締切まで " + res;
            } else {
                return "締切終了";
            }
        }
    }

    return (
        <span className="time-remaining">
            {convertSecondsToHours(parseInt(props.limit), parseInt(props.start))}
        </span>
    );
}

function Simple_quiz(props) {
    const contract = useMemo(() => new Contracts_MetaMask(), []);
    const [is_payment, setIs_payment] = useState(false);

    const quiz = Array.isArray(props.quiz) ? props.quiz : [];
    const quizId = Number(quiz[QUIZ_INDEX.ID]);
    const title = quiz[QUIZ_INDEX.TITLE] || "タイトル未設定";
    const explanation = quiz[QUIZ_INDEX.EXPLANATION] || "";
    const thumbnail = quiz[QUIZ_INDEX.THUMBNAIL] || "";
    const reward = Number(quiz[QUIZ_INDEX.REWARD]) / (10 ** 18);
    const answerCount = Number(quiz[QUIZ_INDEX.ANSWER_COUNT]);
    const correctLimit = Number(quiz[QUIZ_INDEX.CORRECT_LIMIT]);
    const status = Number(quiz[QUIZ_INDEX.STATUS]);
    const startTime = Number(quiz[QUIZ_INDEX.START_TIME]);
    const deadline = Number(quiz[QUIZ_INDEX.DEADLINE]);
    const sourceAddress = quiz.sourceAddress || quiz[12] || "";
    const statusInfo = STATUS_MAP[status] || { label: "", className: "", glow: "" };

    async function get_is_payment(id) {
        const localPaymentState = quiz[QUIZ_INDEX.IS_PAYMENT];
        if (typeof localPaymentState === "boolean") {
            setIs_payment(localPaymentState);
            return;
        }
        setIs_payment(await contract.get_is_payment(id, sourceAddress));
    }

    useEffect(() => {
        if (!Number.isFinite(quizId)) return;
        get_is_payment(quizId);
    }, [quizId]);

    if (!quiz.length || !Number.isFinite(quizId)) {
        return null;
    }

    return (
        <div className={`edit-quiz-card glass-card ${statusInfo.glow} ${is_payment ? 'payment-warning' : ''}`}>
            <Link 
                to={buildAnswerQuizPath(quizId, sourceAddress)}
                state={{ back_page: 0, ...(buildAnswerQuizState(sourceAddress) || {}) }}
                onClick={() => rememberQuizSource(quizId, sourceAddress)}
                className="quiz-card-link"
            >
                <div className="quiz-card-body">
                    {thumbnail && (
                        <div className="quiz-thumbnail">
                            <img src={thumbnail} alt={title} />
                        </div>
                    )}
                    <div className="quiz-card-info">
                        <div className="quiz-card-top">
                            <h3 className="quiz-card-title">{title}</h3>
                            <span className={`badge-status ${statusInfo.className}`}>
                                {statusInfo.label}
                            </span>
                        </div>
                        <p className="quiz-card-desc" style={{ color: "#ffffff", opacity: 0.9 }}>{explanation}</p>
                        <div className="quiz-card-time">
                            <Time_diff start={startTime} limit={deadline} />
                        </div>
                        <div className="quiz-card-stats">
                            <div className="stat-item">
                                <span className="stat-label">報酬</span>
                                <span className="stat-value">{reward} TFT</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">回答数</span>
                                <span className="stat-value">{answerCount}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">上限</span>
                                <span className="stat-value">{correctLimit}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
            <div className="quiz-card-actions">
                <Link 
                    to={buildAnswerQuizPath(quizId, sourceAddress)}
                    state={{ back_page: 0, ...(buildAnswerQuizState(sourceAddress) || {}) }}
                    onClick={() => rememberQuizSource(quizId, sourceAddress)}
                    className="btn-edit"
                >
                    👁 問題を見る
                </Link>
                <Link 
                    to={buildEditQuizPath(quizId, sourceAddress)} 
                    className="btn-edit"
                >
                    ✏️ 編集
                </Link>
                <Link 
                    to={buildInvestmentQuizPath(quizId, sourceAddress)} 
                    className="btn-reward"
                >
                    💰 報酬の追加
                </Link>
                {typeof props.onDeleteQuiz === "function" && (
                    <button
                        type="button"
                        className="btn-reward"
                        onClick={() => props.onDeleteQuiz(quiz)}
                        style={{
                            background: "rgba(255, 120, 120, 0.16)",
                            borderColor: "rgba(255, 120, 120, 0.4)",
                            color: "#ffd4d4",
                        }}
                    >
                        🗑 一覧から削除
                    </button>
                )}
            </div>
        </div>
    );
}

export default Simple_quiz;
