import { useEffect, useMemo, useRef, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import Wait_Modal from "../../contract/wait_Modal";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import {
    ACTION_TYPES,
    appendActivityLog,
    clearDraft,
    getDraft,
    logPageView,
    saveDraft,
} from "../../utils/activityLog";
import { recordPracticeAttempt } from "../../utils/courseEnhancements";
import { buildQuizStorageKey } from "../../utils/quizCorrectAnswerStore";
import { getRememberedQuizSource, rememberQuizSource } from "../../utils/quizLinks";
import { resolveGlobalId } from "../../utils/quizGlobalId";
import { parseQuizContentMeta, stripQuizContentMeta } from "../../utils/quizContentMeta";
import { buildBatchAnswerKey, saveBatchAnswerQueueItem } from "../../utils/batchAnswerQueue";
import {
    QUIZ_INPUT_MODE_PLAIN,
    QUIZ_INPUT_MODE_REGEX,
    parseQuizInputAnswerData,
    testRegexPattern,
} from "../../utils/quizAnswerInput";

function Show_correct(props) {
    if (!props.cont) return null;
    return (
        <div className="glass-card" style={{ marginTop: "var(--space-4)", padding: "var(--space-4)" }}>
            <span className="text-accent">正解: </span>
            <strong>{props.answer}</strong>
        </div>
    );
}

function Answer_type1(props) {
    return (
        <div className="answer-section">
            <h4 className="heading-md" style={{ marginBottom: "var(--space-4)", color: "#ffffff" }}>選択式回答</h4>
            <div className="answer-options">
                {(props.quiz[6] || "")
                    .split(",")
                    .filter((item) => item.trim() !== "")
                    .map((item) => (
                        <label
                            key={item}
                            className={`answer-option ${props.answer === item ? "answer-option--selected" : ""} ${props.disabled ? "opacity-75" : ""}`}
                            style={{
                                cursor: props.disabled ? "not-allowed" : "pointer",
                                padding: "8px 12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                borderRadius: "var(--radius-sm)",
                                border: props.answer === item ? "1px solid var(--accent-blue)" : "1px solid transparent",
                                background: props.answer === item ? "rgba(30, 136, 229, 0.1)" : "transparent",
                                transition: "all 0.2s ease",
                            }}
                        >
                            <input
                                type="radio"
                                name="quiz-answer"
                                value={item}
                                checked={props.answer === item}
                                onChange={() => props.onSelect(item)}
                                className="answer-radio"
                                disabled={props.disabled}
                            />
                            <span className="answer-text" style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: "16px", marginLeft: "4px" }}>{item}</span>
                        </label>
                    ))}
            </div>
        </div>
    );
}

function Answer_type2(props) {
    const answerConfig = parseQuizInputAnswerData(props.quiz[6]);
    const [hasError, setHasError] = useState(true);

    const handleTestPattern = (value) => {
        const valid =
            answerConfig.inputMode === QUIZ_INPUT_MODE_PLAIN
                ? value.trim().length > 0
                : testRegexPattern(answerConfig.pattern, value);
        setHasError(!valid);
        props.onValidation(valid, value.length);
    };

    useEffect(() => {
        if (!props.answer) {
            setHasError(true);
            return;
        }
        handleTestPattern(props.answer);
        // answerConfig values are derived from quiz data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.answer, props.quiz]);

    return (
        <div className="answer-section">
            <h4 className="heading-md" style={{ marginBottom: "var(--space-4)", color: "#ffffff" }}>記述式回答</h4>
            {answerConfig.example ? (
                <p style={{ marginBottom: "var(--space-2)", color: "#ffffff", opacity: 0.9 }}>例: {answerConfig.example}</p>
            ) : null}
            <input
                type="text"
                className="form-control-custom"
                value={props.answer || ""}
                placeholder={answerConfig.inputMode === QUIZ_INPUT_MODE_PLAIN ? (answerConfig.placeholder || "回答を入力してください") : "回答を入力してください"}
                disabled={props.disabled}
                onChange={(event) => {
                    if (props.disabled) return;
                    handleTestPattern(event.target.value);
                    props.onTextChange(event.target.value);
                }}
                style={{ cursor: props.disabled ? "not-allowed" : "text", opacity: props.disabled ? 0.7 : 1 }}
            />
            {!props.disabled && (
                <div
                    className={`answer-validation ${hasError ? "answer-validation--error" : "answer-validation--ok"}`}
                    style={{ color: hasError ? "var(--accent-red)" : "var(--accent-green)", marginTop: "var(--space-2)" }}
                >
                    {answerConfig.inputMode === QUIZ_INPUT_MODE_REGEX
                        ? (hasError ? "入力形式が正しくありません" : "入力形式は問題ありません")
                        : (hasError ? "回答を入力してください" : "入力内容を受け付けました")}
                </div>
            )}
        </div>
    );
}

function Answer_quiz() {
    const navigate = useNavigate();
    const location = useLocation();
    const [answer, setAnswer] = useState("");
    const [show, setShow] = useState(false);
    const [content, setContent] = useState("");
    const [isCorrectShow, setIsCorrectShow] = useState(false);
    const [savedAnswerStr, setSavedAnswerStr] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quiz, setQuiz] = useState(null);
    const [simpleQuiz, setSimpleQuiz] = useState(null);
    const [draftSavedAt, setDraftSavedAt] = useState("");
    const [loadDurationMs, setLoadDurationMs] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [practiceFeedback, setPracticeFeedback] = useState(null);
    const [currentEpoch, setCurrentEpoch] = useState(() => Math.floor(Date.now() / 1000));
    const contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(contract);
    
    const rawId = useParams().id;
    const { id: localId, address: defaultResolvedAddress } = resolveGlobalId(rawId);
    const id = localId;

    const searchParams = new URLSearchParams(location.search);
    const querySourceAddress = searchParams.get("c") || "";
    const stateSourceAddress = location.state?.sourceAddress || "";
    const initialSourceAddress = querySourceAddress || stateSourceAddress || defaultResolvedAddress || getRememberedQuizSource(rawId) || "";
    
    const [resolvedSourceAddress, setResolvedSourceAddress] = useState(initialSourceAddress);
    const sourceAddress = resolvedSourceAddress || initialSourceAddress;
    const isPracticeMode = searchParams.get("practice") === "1";
    const draftKey = `quiz_answer_${String(sourceAddress || "default").toLowerCase()}_${id}`;
    const answerStorageKey = buildQuizStorageKey(id, sourceAddress);
    const pageOpenedAtRef = useRef(Date.now());
    const answerStartedAtRef = useRef(null);
    const textChangeCountRef = useRef(0);
    const actorLogPayload = access.address ? { address: access.address } : {};

    useEffect(() => {
        setResolvedSourceAddress(initialSourceAddress);
    }, [id, initialSourceAddress]);

    useEffect(() => {
        if (sourceAddress) {
            rememberQuizSource(rawId, sourceAddress);
        }
        if (querySourceAddress) {
            const nextParams = new URLSearchParams(location.search);
            nextParams.delete("c");
            const query = nextParams.toString();
            navigate(`/answer_quiz/${rawId}${query ? `?${query}` : ""}`, {
                replace: true,
                state: { ...(location.state || {}), sourceAddress },
            });
        }
    }, [id, rawId, location.search, location.state, navigate, querySourceAddress, sourceAddress]);

    const convertFullWidthNumbersToHalf = (text) => {
        const full = "０１２３４５６７８９";
        const half = "0123456789";
        return String(text || "").replace(/[０-９]/g, (char) => half[full.indexOf(char)] || char);
    };

    const markAnswerInputStarted = (mode) => {
        if (!answerStartedAtRef.current) {
            answerStartedAtRef.current = Date.now();
            appendActivityLog(ACTION_TYPES.ANSWER_INPUT_STARTED, {
                page: "answer_quiz",
                quizId: id,
                mode,
                ...actorLogPayload,
            });
        }
    };

    const handleSelectOption = (value) => {
        markAnswerInputStarted("choice");
        setAnswer(value);
        appendActivityLog(ACTION_TYPES.ANSWER_OPTION_SELECTED, {
            page: "answer_quiz",
            quizId: id,
            value,
            valueLength: value.length,
            ...actorLogPayload,
        });
    };

    const handleTextChange = (value) => {
        markAnswerInputStarted("text");
        setAnswer(value);
        textChangeCountRef.current += 1;
        appendActivityLog(ACTION_TYPES.ANSWER_TEXT_CHANGED, {
            page: "answer_quiz",
            quizId: id,
            textLength: value.length,
            changeCount: textChangeCountRef.current,
            ...actorLogPayload,
        });
    };

    const handleValidation = (valid, textLength) => {
        appendActivityLog(ACTION_TYPES.ANSWER_PATTERN_VALIDATION, {
            page: "answer_quiz",
            quizId: id,
            valid,
            textLength,
            ...actorLogPayload,
        });
    };

    const get_quiz = async () => {
        const startedAt = performance.now();
        setLoadError("");
        appendActivityLog(ACTION_TYPES.QUIZ_LOAD_STARTED, {
            page: "answer_quiz",
            quizId: id,
            ...actorLogPayload,
        });

        try {
            const resolvedQuiz = await contract.get_quiz_with_source(id, sourceAddress);
            const quizData = resolvedQuiz.quizData;
            const simpleQuizData = resolvedQuiz.simpleQuizData;
            const resolvedSource = resolvedQuiz.sourceAddress || sourceAddress;
            if (resolvedSource && resolvedSource !== sourceAddress) {
                setResolvedSourceAddress(resolvedSource);
                rememberQuizSource(id, resolvedSource);
            }
            setQuiz(quizData);
            setSimpleQuiz(simpleQuizData);

            const resolvedAnswerStorageKey = buildQuizStorageKey(id, resolvedSource);
            const resolvedDraftKey = `quiz_answer_${String(resolvedSource || "default").toLowerCase()}_${id}`;
            const cachedAnswer = localStorage.getItem(resolvedAnswerStorageKey) || "";
            const hasResolvedConnectedAddress = Boolean(access.address);
            if (Number(simpleQuizData[10]) !== 0) {
                setSavedAnswerStr(cachedAnswer);
                if (cachedAnswer) {
                    setAnswer(cachedAnswer);
                }
            } else {
                if (hasResolvedConnectedAddress) {
                    localStorage.removeItem(resolvedAnswerStorageKey);
                    setSavedAnswerStr("");
                } else if (cachedAnswer) {
                    setSavedAnswerStr(cachedAnswer);
                }
                const draft = getDraft(resolvedDraftKey);
                if (draft) {
                    setAnswer(draft);
                    appendActivityLog(ACTION_TYPES.ANSWER_DRAFT_RESTORED, {
                        page: "answer_quiz",
                        quizId: id,
                        answerLength: draft.length,
                        ...actorLogPayload,
                    });
                }
            }

            const durationMs = Math.round(performance.now() - startedAt);
            setLoadDurationMs(durationMs);
            appendActivityLog(ACTION_TYPES.QUIZ_LOAD_SUCCESS, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quizData?.[2] || "",
                sourceAddress: resolvedSource || "",
                durationMs,
                ...actorLogPayload,
            });
            appendActivityLog(ACTION_TYPES.PERFORMANCE_SAMPLE, {
                page: "answer_quiz",
                category: "quiz_load",
                quizId: id,
                durationMs,
                ...actorLogPayload,
            });
        } catch (error) {
            console.error(error);
            setLoadError("問題データの読み込みに失敗しました。通信状態を確認して再試行してください。");
            appendActivityLog(ACTION_TYPES.QUIZ_LOAD_FAILURE, {
                page: "answer_quiz",
                quizId: id,
                errorMessage: error?.message || "quiz_load_failed",
                durationMs: Math.round(performance.now() - startedAt),
                ...actorLogPayload,
            });
        }
    };

    const getSubmitFailureMessage = (error, finalAnswer) => {
        const message = String(error?.shortMessage || error?.message || "").toLowerCase();
        if (error?.code === 4001 || message.includes("user rejected")) {
            return "ウォレット側で送信がキャンセルされました。";
        }

        if (
            message.includes("avalanche-fuji_network_unavailable")
            || message.includes("avalanche-fuji_network_switch_failed")
            || message.includes("amoy")
        ) {
            saveBatchAnswerQueueItem({
                key: buildBatchAnswerKey(id, sourceAddress),
                quizId: id,
                sourceAddress,
                title: quiz?.[2] || `問題 ${id}`,
                answer: finalAnswer,
                answerType: Number(quiz?.[13] || 0),
                deadlineEpoch: Number(quiz?.[9] || 0),
                savedAt: new Date().toISOString(),
            });
            return "Avalanche Fuji への接続確認に失敗しました。回答は自動で『まとめて解答リスト』に保存しました。ネットワーク接続を確認してから再送してください。";
        }

        if (
            message.includes("insufficient funds")
            || message.includes("network fee")
            || message.includes("gas required exceeds")
            || message.includes("pol")
        ) {
            saveBatchAnswerQueueItem({
                key: buildBatchAnswerKey(id, sourceAddress),
                quizId: id,
                sourceAddress,
                title: quiz?.[2] || `問題 ${id}`,
                answer: finalAnswer,
                answerType: Number(quiz?.[13] || 0),
                deadlineEpoch: Number(quiz?.[9] || 0),
                savedAt: new Date().toISOString(),
            });
            return "AVAX が不足しているか、ネットワーク手数料の確認に失敗しました。回答は自動で『まとめて解答リスト』に保存しました。AVAX 補充後に再送してください。";
        }

        if (
            message.includes("timeout")
            || message.includes("failed to fetch")
            || message.includes("network")
            || message.includes("socket")
            || message.includes("rpc")
            || message.includes("transactionreceipt")
        ) {
            saveBatchAnswerQueueItem({
                key: buildBatchAnswerKey(id, sourceAddress),
                quizId: id,
                sourceAddress,
                title: quiz?.[2] || `問題 ${id}`,
                answer: finalAnswer,
                answerType: Number(quiz?.[13] || 0),
                deadlineEpoch: Number(quiz?.[9] || 0),
                savedAt: new Date().toISOString(),
            });
            return "通信が不安定だったため、回答は自動で『まとめて解答リスト』に保存しました。回線が安定したら一括送信から再送できます。";
        }

        saveBatchAnswerQueueItem({
            key: buildBatchAnswerKey(id, sourceAddress),
            quizId: id,
            sourceAddress,
            title: quiz?.[2] || `問題 ${id}`,
            answer: finalAnswer,
            answerType: Number(quiz?.[13] || 0),
            deadlineEpoch: Number(quiz?.[9] || 0),
            savedAt: new Date().toISOString(),
        });
        return "回答送信に失敗しました。回答は『まとめて解答リスト』へ保存してから再送するのがおすすめです。";
    };

    const create_answer = async () => {
        if (!quiz) return;
        if (!access.canAnswerQuiz) {
            alert("このアカウントは閲覧のみです。回答するには MetaMask 接続後に教員登録を受けてください。");
            return;
        }

        const nowEpoch = Math.floor(Date.now() / 1000);
        const startEpoch = Number(quiz?.[8] || 0);
        if (startEpoch > 0 && nowEpoch < startEpoch) {
            appendActivityLog(ACTION_TYPES.ANSWER_BLOCKED_BEFORE_START, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quiz?.[2] || "",
                now: nowEpoch,
                replyStart: startEpoch,
                practiceMode: isPracticeMode,
                ...actorLogPayload,
            });
            alert("まだ回答開始時間になっていません。");
            return;
        }

        const deadlineEpoch = Number(quiz?.[9] || 0);
        if (deadlineEpoch > 0 && nowEpoch >= deadlineEpoch) {
            appendActivityLog(ACTION_TYPES.ANSWER_SUBMIT_FAILED, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quiz?.[2] || "",
                sourceAddress,
                answerLength: String(answer || "").length,
                errorMessage: "deadline_passed",
                submitDurationMs: 0,
                ...actorLogPayload,
            });
            alert("この問題は回答時間が終了しているため、これ以上回答できません。");
            return;
        }

        if (isPracticeMode) {
            const finalAnswer = convertFullWidthNumbersToHalf(answer).trim();
            const correctAnswer = String(quiz[14] || "").trim();
            const isCorrect = finalAnswer !== "" && finalAnswer === correctAnswer;

            recordPracticeAttempt({
                quizId: id,
                address: access.address,
                answer: finalAnswer,
                isCorrect,
                title: quiz[2],
            });

            appendActivityLog(ACTION_TYPES.ANSWER_PRACTICE_SUBMITTED, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quiz?.[2] || "",
                answerLength: finalAnswer.length,
                isCorrect,
                ...actorLogPayload,
            });
            appendActivityLog(
                isCorrect ? ACTION_TYPES.ANSWER_PRACTICE_CORRECT : ACTION_TYPES.ANSWER_PRACTICE_INCORRECT,
                {
                    page: "answer_quiz",
                    quizId: id,
                    answerLength: finalAnswer.length,
                    ...actorLogPayload,
                }
            );

            setPracticeFeedback({
                isCorrect,
                message: isCorrect ? "練習モード: 正解です。" : "練習モード: まだ復習が必要です。",
            });
            return;
        }

        if (quiz[15] === true) {
            setIsCorrectShow(true);
            appendActivityLog(ACTION_TYPES.QUIZ_CORRECT_REVEALED, {
                page: "answer_quiz",
                quizId: id,
                source: "already_correct",
                ...actorLogPayload,
            });
            return;
        }

        const quizMeta = parseQuizContentMeta(quiz?.[5] || "");
        const allowMultipleAnswers = Boolean(quizMeta.allowMultipleAnswers);
        const currentStatus = Number(simpleQuiz?.[10] || 0);
        const canUpdateSubmittedAnswer = allowMultipleAnswers && currentStatus === 3 && !Boolean(simpleQuiz?.[11]) && (deadlineEpoch === 0 || deadlineEpoch > nowEpoch);
        if (!isPracticeMode && currentStatus !== 0 && !canUpdateSubmittedAnswer) {
            alert("この問題は現在の設定では再回答できません。");
            return;
        }

        setIsSubmitting(true);
        const startedAt = performance.now();
        const finalAnswer = convertFullWidthNumbersToHalf(answer);
        appendActivityLog(ACTION_TYPES.ANSWER_SUBMIT_CLICKED, {
            page: "answer_quiz",
            quizId: id,
            quizTitle: quiz?.[2] || "",
            sourceAddress,
            answerLength: finalAnswer.length,
            answerType: Number(quiz[13]) === 0 ? "choice" : "text",
            ...actorLogPayload,
        });

        try {
            const submitResult = await contract.create_answer(id, finalAnswer, setShow, setContent, sourceAddress);
            const txHash = submitResult?.transactionHash || submitResult?.hash || "";
            const verificationStatus = submitResult?.status === "verified_after_receipt_timeout"
                ? "verified_after_receipt_timeout"
                : "receipt_confirmed";
            setSavedAnswerStr(finalAnswer);
            setAnswer(finalAnswer);
            clearDraft(draftKey);
            appendActivityLog(ACTION_TYPES.ANSWER_DRAFT_CLEARED, {
                page: "answer_quiz",
                quizId: id,
                reason: "submit_success",
                ...actorLogPayload,
            });
            appendActivityLog(ACTION_TYPES.ANSWER_SUBMITTED, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quiz?.[2] || "",
                sourceAddress,
                address: access.address,
                rewardPolicy: allowMultipleAnswers ? "repeat_half_after_first" : "single_full_reward",
                answerLength: finalAnswer.length,
                answerType: Number(quiz[13]) === 0 ? "choice" : "text",
                txHash,
                verificationStatus,
                openedAt: new Date(pageOpenedAtRef.current).toISOString(),
                startedAt: answerStartedAtRef.current ? new Date(answerStartedAtRef.current).toISOString() : null,
                totalDurationSeconds: Math.round((Date.now() - pageOpenedAtRef.current) / 1000),
                solvingDurationSeconds: answerStartedAtRef.current ? Math.round((Date.now() - answerStartedAtRef.current) / 1000) : null,
                submitDurationMs: Math.round(performance.now() - startedAt),
            });
            await get_quiz();
            setShow(false);
            navigate("/list_quiz");
        } catch (error) {
            console.error(error);
            const failureMessage = getSubmitFailureMessage(error, finalAnswer);
            appendActivityLog(ACTION_TYPES.ANSWER_SUBMIT_FAILED, {
                page: "answer_quiz",
                quizId: id,
                quizTitle: quiz?.[2] || "",
                sourceAddress,
                answerLength: finalAnswer.length,
                errorMessage: error?.message || "answer_submit_failed",
                fallbackMessage: failureMessage,
                submitDurationMs: Math.round(performance.now() - startedAt),
                ...actorLogPayload,
            });
            alert(failureMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const save_answer_to_batch_queue = () => {
        if (!access.canAnswerQuiz) {
            alert("このアカウントは閲覧のみです。");
            return;
        }
        const finalAnswer = convertFullWidthNumbersToHalf(answer).trim();
        if (!finalAnswer) {
            alert("まとめて送信する回答を入力してください。");
            return;
        }
        const queueItem = saveBatchAnswerQueueItem({
            key: buildBatchAnswerKey(id, sourceAddress),
            quizId: id,
            sourceAddress,
            title: quiz?.[2] || `問題 ${id}`,
            answer: finalAnswer,
            answerType: Number(quiz?.[13] || 0),
            deadlineEpoch: Number(quiz?.[9] || 0),
            savedAt: new Date().toISOString(),
        });
        appendActivityLog(ACTION_TYPES.ANSWER_DRAFT_SAVED, {
            page: "answer_quiz",
            quizId: id,
            answerLength: finalAnswer.length,
            savedAtLabel: new Date(queueItem.savedAt).toLocaleTimeString("ja-JP"),
            savedToBatchQueue: true,
            ...actorLogPayload,
        });
        alert("まとめて解答リストに保存しました。クイズ一覧から最後に一括送信できます。");
    };

    useEffect(() => {
        if (access.isLoading) return;
        pageOpenedAtRef.current = Date.now();
        answerStartedAtRef.current = null;
        textChangeCountRef.current = 0;
        logPageView("answer_quiz", { action: ACTION_TYPES.QUIZ_PAGE_VIEWED, quizId: id });
        appendActivityLog(ACTION_TYPES.QUIZ_PAGE_VIEWED, {
            page: "answer_quiz",
            quizId: id,
            ...actorLogPayload,
        });
        get_quiz();
        // contract instance is intentionally recreated locally.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [access.address, access.canAnswerQuiz, access.isLoading, id, sourceAddress]);

    useEffect(() => {
        if (!answer || !simpleQuiz || Number(simpleQuiz[10]) !== 0) return;
        const timer = setTimeout(() => {
            saveDraft(draftKey, answer);
            const nowLabel = new Date().toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
            setDraftSavedAt(nowLabel);
            appendActivityLog(ACTION_TYPES.ANSWER_DRAFT_SAVED, {
                page: "answer_quiz",
                quizId: id,
                answerLength: answer.length,
                savedAtLabel: nowLabel,
                ...actorLogPayload,
            });
        }, 400);
        return () => clearTimeout(timer);
    }, [answer, draftKey, id, simpleQuiz]);

    useEffect(() => {
        if (!simpleQuiz) return;
        const rawStatus = Number(simpleQuiz[10]);
        appendActivityLog(ACTION_TYPES.QUIZ_STATUS_DETECTED, {
            page: "answer_quiz",
            quizId: id,
            rawStatus,
            derivedStatus: rawStatus,
            hasLocalCachedAnswer: Boolean(localStorage.getItem(answerStorageKey)),
            ...actorLogPayload,
        });
    }, [answerStorageKey, id, simpleQuiz]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setCurrentEpoch(Math.floor(Date.now() / 1000));
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    if (access.isLoading) {
        return (
            <div className="answer-page">
                <div className="glass-card" style={{ padding: "var(--space-6)" }}>
                    権限を確認中です...
                </div>
            </div>
        );
    }

    if (!quiz || !simpleQuiz) {
        return (
            <div className="answer-page">
                {loadError ? (
                    <div className="glass-card" style={{ padding: "var(--space-6)" }}>
                        <h3 className="heading-md">読み込みエラー</h3>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>{loadError}</p>
                        <button
                            className="btn-primary-custom"
                            onClick={() => {
                                appendActivityLog(ACTION_TYPES.QUIZ_RETRY_CLICKED, { page: "answer_quiz", quizId: id });
                                get_quiz();
                            }}
                        >
                            再読み込み
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="skeleton skeleton-card" style={{ height: "60px" }}></div>
                        <div className="skeleton skeleton-card" style={{ height: "400px" }}></div>
                    </>
                )}
            </div>
        );
    }

    const localCachedAnswer = localStorage.getItem(answerStorageKey);
    const rawStatus = Number(simpleQuiz[10]);
    const status = rawStatus;
    const deadlineEpoch = Number(quiz?.[9] || 0);
    const startEpoch = Number(quiz?.[8] || 0);
    const isBeforeStart = startEpoch > 0 && currentEpoch < startEpoch;
    const isClosed = deadlineEpoch > 0 && currentEpoch >= deadlineEpoch;
    const canShowCorrectAnswer = Boolean(quiz?.[14]) && (isCorrectShow || isClosed);
    const quizMeta = parseQuizContentMeta(quiz?.[5] || "");
    const renderedContent = stripQuizContentMeta(quiz?.[5] || "");
    const allowMultipleAnswers = Boolean(quizMeta.allowMultipleAnswers);
    const canUpdateSubmittedAnswer = !isPracticeMode && allowMultipleAnswers && status === 3 && !Boolean(simpleQuiz?.[11]) && !isClosed;
    const canEditAnswer = access.canAnswerQuiz && !isBeforeStart && !isClosed && (isPracticeMode || status === 0 || canUpdateSubmittedAnswer);
    const savedAnswerDisplay = savedAnswerStr || localCachedAnswer || "";
    const visibleDraft = status === 0 ? answer : "";
    const statusMessages = {
        0: { text: isClosed ? "回答時間が終了しました。未回答のまま締め切られています。" : "未回答です。回答後に結果を確認してください。", className: "status-first" },
        1: { text: "支払い処理後に回答結果が確定しました。必要なら正解を確認してください。", className: "status-wrong" },
        2: { text: "支払い処理後に正解として確定しました。", className: "status-correct" },
        3: { text: canUpdateSubmittedAnswer ? "回答は送信済みです。いまは回答内容を更新できます。" : allowMultipleAnswers ? "回答は送信済みです。締切または支払い確定後のため、いまは更新できません。" : "回答は送信済みです。再回答はできません。", className: "status-first" },
    };
    const statusInfo = statusMessages[status] || { text: "", className: "" };

    return (
        <div className="answer-page animate-fadeIn">
            {statusInfo.text && (
                <div className={`answer-status-banner glass-card ${statusInfo.className}`} style={{ color: "#ffffff", fontWeight: "600", fontSize: "16px", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
                    {statusInfo.text}
                </div>
            )}

            {!access.canAnswerQuiz && (
                <div className="glass-card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                    <h3 className="heading-md" style={{ marginBottom: "var(--space-2)" }}>閲覧のみ</h3>
                    <p style={{ color: "#ffffff", opacity: 0.9, marginBottom: 0 }}>
                        このアカウントは問題本文の確認だけできます。回答するには MetaMask 接続後に教員から登録を受けてください。
                    </p>
                </div>
            )}

            <div className="quiz-detail-card glass-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
                    <h2 className="heading-lg" style={{ marginBottom: 0 }}>{quiz[2]}</h2>
                    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", color: "var(--text-secondary)", fontSize: "14px" }}>
                        {isPracticeMode ? <span style={{ color: "#9be7ff" }}>練習モード</span> : null}
                        <span>読込時間: {loadDurationMs == null ? "-" : `${loadDurationMs}ms`}</span>
                        <span>下書き保存: {draftSavedAt || "未保存"}</span>
                    </div>
                </div>

                {quiz[3] && (
                    <p style={{ whiteSpace: "pre-wrap", marginBottom: "var(--space-4)", color: "#ffffff", opacity: 0.9 }}>
                        {quiz[3]}
                    </p>
                )}

                <div style={{ marginBottom: "var(--space-6)", color: "#ffffff", opacity: 0.9 }}>
                    <span>出題時刻: </span>
                    <span className="text-accent">{quiz[1] ? `${quiz[1].slice(0, 10)}...` : ""}</span>
                </div>

                <div style={{ marginBottom: "var(--space-4)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span className="reward-edit-summary" style={{ marginTop: 0 }}>
                        <span>回答設定: {allowMultipleAnswers ? "複数回回答可" : "初回のみ"}</span>
                    </span>
                    {allowMultipleAnswers ? (
                        <span className="reward-edit-summary" style={{ marginTop: 0 }}>
                            <span>2回目以降に正解した場合の報酬は半額です</span>
                        </span>
                    ) : null}
                    {isBeforeStart ? (
                        <span className="reward-edit-summary" style={{ marginTop: 0 }}>
                            <span>回答開始前です</span>
                        </span>
                    ) : null}
                    {isClosed ? (
                        <span className="reward-edit-summary" style={{ marginTop: 0 }}>
                            <span>回答時間は終了しています</span>
                        </span>
                    ) : null}
                    {!access.canAnswerQuiz ? (
                        <span className="reward-edit-summary" style={{ marginTop: 0 }}>
                            <span>この画面では閲覧のみ可能です</span>
                        </span>
                    ) : null}
                </div>

                <div data-color-mode="dark" style={{ marginBottom: "var(--space-6)" }}>
                    <MDEditor.Markdown source={renderedContent} />
                </div>

                {Number(quiz[13]) === 0 && (
                    <Answer_type1
                        quiz={quiz}
                        answer={answer}
                        onSelect={handleSelectOption}
                        disabled={!canEditAnswer || isSubmitting}
                    />
                )}
                {Number(quiz[13]) === 1 && (
                    <Answer_type2
                        quiz={quiz}
                        answer={answer}
                        onTextChange={handleTextChange}
                        onValidation={handleValidation}
                        disabled={!canEditAnswer || isSubmitting}
                    />
                )}

                {canEditAnswer ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "var(--space-6)", gap: "var(--space-4)", flexWrap: "wrap" }}>
                        {!isPracticeMode && (
                            <button
                                className="btn-secondary-custom"
                                onClick={save_answer_to_batch_queue}
                                disabled={isSubmitting || !answer}
                            >
                                まとめて解答リストに保存
                            </button>
                        )}
                        <button className="btn-primary-custom" onClick={create_answer} disabled={isSubmitting || !answer || isBeforeStart}>
                            {isBeforeStart ? "回答開始前" : (isPracticeMode ? "練習として判定" : canUpdateSubmittedAnswer ? (isSubmitting ? "更新中..." : "回答を更新") : (isSubmitting ? "送信中..." : "回答を送信"))}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-6)" }}>
                        <button className="btn-secondary-custom" disabled style={{ cursor: "not-allowed", opacity: 0.6 }}>
                            {!access.canAnswerQuiz ? "閲覧のみ" : isBeforeStart ? "回答開始前" : isClosed ? "回答締切後" : "回答済み"}
                        </button>
                    </div>
                )}

                {status === 0 && visibleDraft && (
                    <div className="glass-card" style={{ marginTop: "var(--space-4)", padding: "var(--space-4)" }}>
                        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", marginBottom: "var(--space-2)" }}>
                            現在の下書き内容
                        </div>
                        <div style={{ color: "#ffffff", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {visibleDraft}
                        </div>
                    </div>
                )}

                {isPracticeMode && practiceFeedback && (
                    <div className="glass-card" style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", border: `1px solid ${practiceFeedback.isCorrect ? "rgba(76, 175, 80, 0.5)" : "rgba(255, 152, 0, 0.5)"}` }}>
                        <div style={{ color: practiceFeedback.isCorrect ? "#9cffb3" : "#ffd27d", fontWeight: 700 }}>
                            {practiceFeedback.message}
                        </div>
                    </div>
                )}

                {status !== 0 && savedAnswerDisplay && (
                    <div className="glass-card" style={{ marginTop: "var(--space-4)", padding: "var(--space-4)" }}>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>あなたの回答: </span>
                        <strong style={{ color: "#ffffff", fontSize: "16px" }}>{savedAnswerDisplay}</strong>
                    </div>
                )}

                <Show_correct cont={canShowCorrectAnswer} answer={quiz[14]} />
            </div>

            <Wait_Modal showFlag={show} content={content} />
        </div>
    );
}

export default Answer_quiz;
