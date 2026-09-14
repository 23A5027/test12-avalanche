import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buildAnswerQuizPath, buildAnswerQuizState, rememberQuizSource } from "../../../utils/quizLinks";
import { buildQuizStorageKey } from "../../../utils/quizCorrectAnswerStore";
import "./quiz_simple.css";

const QUIZ_STATUS = {
    UNANSWERED: 0,
    INCORRECT: 1,
    CORRECT: 2,
    ANSWERED: 3,
};

function getStatusLabel(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "未解答";
        case QUIZ_STATUS.INCORRECT: return "不正解";
        case QUIZ_STATUS.CORRECT: return "正解";
        case QUIZ_STATUS.ANSWERED: return "解答済み";
        default: return "";
    }
}

function getStatusClass(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "glow-unanswered";
        case QUIZ_STATUS.INCORRECT: return "glow-incorrect";
        case QUIZ_STATUS.CORRECT: return "glow-correct";
        case QUIZ_STATUS.ANSWERED: return "glow-answered";
        default: return "";
    }
}

function getBadgeClass(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "badge-unanswered";
        case QUIZ_STATUS.INCORRECT: return "badge-incorrect";
        case QUIZ_STATUS.CORRECT: return "badge-correct";
        case QUIZ_STATUS.ANSWERED: return "badge-answered";
        default: return "";
    }
}

function Time_diff(props) {
    function convertSecondsToHours(secondsLimit, secondsStart) {
        const now = new Date();
        const deadline = new Date(secondsLimit * 1000);
        const startTime = new Date(secondsStart * 1000);

        const epochNow = Math.floor(now.getTime() / 1000);
        const epochDeadline = Math.floor(deadline.getTime() / 1000);
        const epochStart = Math.floor(startTime.getTime() / 1000);

        let elapsedTime = 0;
        let isBeforeStart = false;

        if (epochNow < epochStart) {
            elapsedTime = new Date(Math.abs(epochStart - epochNow) * 1000);
            isBeforeStart = true;
        } else {
            elapsedTime = new Date(Math.abs(epochDeadline - epochNow) * 1000);
        }

        const labels = ["年", "か月", "日", "時間", "分", "秒"];
        const date = [
            elapsedTime.getUTCFullYear() - 1970,
            elapsedTime.getUTCMonth(),
            elapsedTime.getUTCDate() - 1,
            elapsedTime.getUTCHours(),
            elapsedTime.getUTCMinutes(),
            elapsedTime.getUTCSeconds(),
        ];

        let res = "";
        let i = 0;
        for (i = 0; i < date.length; i++) {
            if (date[i] !== 0) break;
        }
        for (; i < date.length; i++) {
            res += date[i].toString() + labels[i];
        }

        if (isBeforeStart) {
            return { text: `開始まで ${res}`, icon: "⏳", className: "time-pending" };
        } else if (epochDeadline - epochNow > 0) {
            return { text: `残り ${res}`, icon: "⌛", className: "time-active" };
        }
        return { text: "終了済み", icon: "✓", className: "time-ended" };
    }

    const timeInfo = convertSecondsToHours(parseInt(props.limit, 10), parseInt(props.start, 10));
    return (
        <div className={`quiz-time ${timeInfo.className}`}>
            <span className="quiz-time-icon">{timeInfo.icon}</span>
            <span className="quiz-time-text">{timeInfo.text}</span>
        </div>
    );
}

function Simple_quiz(props) {
    const navigate = useNavigate();
    const [isreward, setIsreward] = useState(true);
    const [ispayment, setIspayment] = useState(false);

    const quiz = Array.isArray(props.quiz) ? props.quiz : [];
    const quizId = Number(quiz[0]);
    const title = quiz[2] || "タイトル未設定";
    const description = quiz[3] || "";
    const thumbnail = quiz[4] || "";
    const startTime = Number(quiz[5] || 0);
    const deadline = Number(quiz[6] || 0);
    const reward = Number(quiz[7] || 0) / (10 ** 18);
    const respondents = Number(quiz[8] || 0);
    const limit = Number(quiz[9] || 0);
    const status = Number(quiz[10] || 0);
    const isPaid = Boolean(quiz[11]);
    const sourceAddress = quiz.sourceAddress || quiz[12] || "";
    const answerStorageKey = buildQuizStorageKey(quizId, sourceAddress);
    const currentEpoch = props.currentEpoch ?? Math.floor(Date.now() / 1000);
    const isBeforeStart = startTime > 0 && currentEpoch < startTime;
    const canOpenAnswer = props.canAnswerQuiz && !isBeforeStart;
    const canViewQuiz = true;
    const correctAnswer = props.correctAnswer || "";
    const scheduleLabel = currentEpoch < startTime ? "公開予約" : (currentEpoch > deadline ? "締切済み" : "公開中");
    const quizPath = buildAnswerQuizPath(quizId, sourceAddress);
    const quizState = buildAnswerQuizState(sourceAddress);

    useEffect(() => {
        if (reward === 0) setIsreward(false);
        if (isPaid) {
            setIspayment(true);
            setIsreward(false);
        }
    }, [isPaid, reward]);

    useEffect(() => {
        if (status === QUIZ_STATUS.UNANSWERED) {
            localStorage.removeItem(answerStorageKey);
        }
    }, [answerStorageKey, quizId, status]);

    const statusClass = getStatusClass(status);
    const statusLabel = getStatusLabel(status);
    const badgeClass = getBadgeClass(status);
    const savedAnswer = localStorage.getItem(answerStorageKey);

    if (!quiz.length || !Number.isFinite(quizId)) {
        return null;
    }

    const handleRememberSource = () => {
        rememberQuizSource(quizId, sourceAddress);
    };

    const handleCardOpen = (event) => {
        if (!canViewQuiz) return;
        if (event.target.closest("a,button,input,label")) {
            return;
        }
        handleRememberSource();
        navigate(quizPath, { state: quizState });
    };

    const handleCardKeyDown = (event) => {
        if (!canViewQuiz) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleRememberSource();
        navigate(quizPath, { state: quizState });
    };

    const card = (
        <div
            className={`quiz-card glass-card ${statusClass} animate-slideUp ${canViewQuiz ? "quiz-card--interactive" : ""}`}
            role={canViewQuiz ? "button" : undefined}
            tabIndex={canViewQuiz ? 0 : undefined}
            onClick={handleCardOpen}
            onKeyDown={handleCardKeyDown}
            aria-label={canViewQuiz ? `${title} を開く` : undefined}
        >
            <div className="quiz-card-inner">
                {thumbnail && (
                    <div className="quiz-thumbnail">
                        <img src={thumbnail} alt="" />
                    </div>
                )}

                <div className="quiz-content">
                    <div className="quiz-header">
                        <h3 className="quiz-title">{title}</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {ispayment && (
                                <span className="quiz-indicator quiz-indicator--paid">
                                    報酬配布済み
                                </span>
                            )}
                            {!ispayment && isreward && (
                                <span className="quiz-indicator quiz-indicator--reward">
                                    報酬あり
                                </span>
                            )}
                            <span className={`badge-status ${badgeClass}`}>
                                {statusLabel}
                            </span>
                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>
                                {scheduleLabel}
                            </span>
                        </div>
                    </div>

                    {description && (
                        <p className="quiz-description" style={{ color: "#ffffff", opacity: 0.9 }}>{description}</p>
                    )}

                    <Time_diff start={startTime} limit={deadline} />

                    <div className="quiz-meta">
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">報酬</span>
                            <span className="quiz-meta-value">
                                {reward > 0 ? `${reward} TFT` : "-"}
                            </span>
                        </div>
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">解答数</span>
                            <span className="quiz-meta-value">{respondents}</span>
                        </div>
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">上限</span>
                            <span className="quiz-meta-value">{limit}</span>
                        </div>
                    </div>

                    {status !== QUIZ_STATUS.UNANSWERED && savedAnswer && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-sm)", padding: "var(--space-2)", background: "rgba(255,255,255,0.05)", borderRadius: "var(--radius-sm)" }}>
                            <span style={{ fontSize: "12px", color: "#ffffff", opacity: 0.9 }}>あなたの解答 </span>
                            <strong style={{ color: "#ffffff" }}>{savedAnswer}</strong>
                        </div>
                    )}

                    {currentEpoch > deadline && correctAnswer && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-sm)", padding: "var(--space-2)", background: "rgba(76, 175, 80, 0.12)", borderRadius: "var(--radius-sm)" }}>
                            <span style={{ fontSize: "12px", color: "#ffffff", opacity: 0.9 }}>締切後の正解 </span>
                            <strong style={{ color: "#ffffff" }}>{correctAnswer}</strong>
                        </div>
                    )}

                    {!props.canAnswerQuiz && !props.accessLoading && !props.isConnected && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", padding: "var(--space-2)", background: "rgba(255, 120, 120, 0.12)", borderRadius: "var(--radius-sm)", color: "#ffd0d0" }}>
                            MetaMask を接続すると解答できます。
                        </div>
                    )}

                    {!props.canAnswerQuiz && props.accessLoading && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", padding: "var(--space-2)", background: "rgba(255,255,255,0.08)", borderRadius: "var(--radius-sm)", color: "#ffffff" }}>
                            利用区分を確認中です...
                        </div>
                    )}

                    {props.canAnswerQuiz && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                            {canOpenAnswer ? (
                                <>
                                    <Link
                                        to={quizPath}
                                        state={quizState}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleRememberSource();
                                        }}
                                        className="btn-secondary-custom"
                                        style={{ textDecoration: "none", minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                                    >
                                        問題を見る
                                    </Link>
                                    <Link
                                        to={quizPath}
                                        state={quizState}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleRememberSource();
                                        }}
                                        className="btn-primary-custom"
                                        style={{ textDecoration: "none", flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                                    >
                                        本番で回答
                                    </Link>
                                    <Link
                                        to={buildAnswerQuizPath(quizId, sourceAddress, { practice: true })}
                                        state={quizState}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleRememberSource();
                                        }}
                                        className="btn-secondary-custom"
                                        style={{ textDecoration: "none", flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                                    >
                                        練習モード
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to={quizPath}
                                        state={quizState}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleRememberSource();
                                        }}
                                        className="btn-primary-custom"
                                        style={{ textDecoration: "none", flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                                    >
                                        問題を見る
                                    </Link>
                                    <button
                                        type="button"
                                        className="btn-secondary-custom"
                                        disabled
                                        style={{ flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px", cursor: "not-allowed", opacity: 0.7 }}
                                    >
                                        回答開始前
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {!props.canAnswerQuiz && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                            <Link
                                to={quizPath}
                                state={quizState}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleRememberSource();
                                }}
                                className="btn-primary-custom"
                                style={{ textDecoration: "none", minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                            >
                                問題を見る
                            </Link>
                        </div>
                    )}

                    {props.isTeacher && typeof props.onDeleteQuiz === "function" && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                            <button
                                type="button"
                                className="btn-secondary-custom"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    props.onDeleteQuiz(quiz);
                                }}
                                style={{
                                    minWidth: "160px",
                                    textAlign: "center",
                                    padding: "10px 14px",
                                    border: "1px solid rgba(255,120,120,0.4)",
                                    background: "rgba(255,120,120,0.12)",
                                    color: "#ffd4d4",
                                }}
                            >
                                一覧から削除
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return <div className="quiz-card-link">{card}</div>;
}

export default Simple_quiz;
