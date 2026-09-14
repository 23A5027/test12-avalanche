/* global BigInt */
import { Contracts_MetaMask } from "../../contract/contracts";
import Form from "react-bootstrap/Form";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { parseUnits } from "viem";
import MDEditor from "@uiw/react-md-editor";
import Answer_select from "./components/answer_select";
import Wait_Modal from "../../contract/wait_Modal";
import { ACTION_TYPES, appendActivityLog, clearDraft, getDraft, saveDraft } from "../../utils/activityLog";
import { setRegisteredCorrectAnswer } from "../../utils/quizCorrectAnswerStore";
import { quiz_address } from "../../contract/config";
import { MAX_TFT_PER_LECTURE, MAX_TFT_TOTAL, QUIZ_RATE_OPTIONS, TOTAL_LECTURE_COUNT, convertTftToPoint, TFT_PER_POINT } from "../../utils/quizRewardRate";
import { buildAnswerQuizPath } from "../../utils/quizLinks";
import { createDefaultQuizContentMeta, withQuizContentMeta } from "../../utils/quizContentMeta";
import { appendColoredText } from "../../utils/quizEditorHelpers";
import { savePendingCreatedQuiz } from "../../utils/pendingCreatedQuizzes";
import { normalizeCreatedQuizKey, saveCreatedQuiz } from "../../utils/liveSignalApi";
import "./create_quiz.css";

const CREATE_QUIZ_DRAFT_KEY = "create_quiz_form_v1";
const CREATE_QUIZ_BATCH_DRAFT_KEY = "create_quiz_batch_v1";

function Create_quiz() {
    const navigate = useNavigate();
    const [useing_address, Set_useing_address] = useState(null);
    const [title, setTitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [thumbnail_url, setThumbnail_url] = useState("");
    const [content, setContent] = useState("");
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(createDefaultQuizContentMeta().allowMultipleAnswers);
    const [highlightText, setHighlightText] = useState("");
    const [answer_type, setAnswer_type] = useState(0);
    const [answer_data, setAnswer_data] = useState([]);
    const [correct, setCorrect] = useState("");
    const [scoreTier, setScoreTier] = useState(QUIZ_RATE_OPTIONS[0].id);
    const [isManualReward, setIsManualReward] = useState(false);
    const [reply_startline, setReply_startline] = useState(
        new Date()
            .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            .replace(/[/]/g, "-")
            .replace(/\s(\d):/, " 0$1:"),
    );
    const [reply_deadline, setReply_deadline] = useState(getLocalizedDateTimeString(addDays(new Date(), 1)));
    const [reward, setReward] = useState(QUIZ_RATE_OPTIONS[0].reward);

    const [correct_limit, setCorrect_limit] = useState(null);
    const [currentStudentCount, setCurrentStudentCount] = useState(0);
    const [state, setState] = useState("Null");
    const [now, setnow] = useState(null);
    const [show, setShow] = useState(false);
    const [isDraftLoaded, setIsDraftLoaded] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [batchQuizzes, setBatchQuizzes] = useState([]);
    const [batchEditQuizId, setBatchEditQuizId] = useState("");

    const Contract = useMemo(() => new Contracts_MetaMask(), []);

    const convertFullWidthNumbersToHalf = (() => {
        const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
        return text => text.replace(
            /[０-９]/g
            , m => String.fromCharCode(m.charCodeAt(0) - diff)
        );
    })();

    const clearCreateQuizDraft = () => {
        clearDraft(CREATE_QUIZ_DRAFT_KEY);
    };

    const resetQuestionFields = () => {
        setTitle("");
        setExplanation("");
        setThumbnail_url("");
        setContent("");
        setHighlightText("");
        setAnswer_type(0);
        setAnswer_data([]);
        setCorrect("");
        setAllowMultipleAnswers(createDefaultQuizContentMeta().allowMultipleAnswers);
        setBatchEditQuizId("");
    };

    const buildCurrentQuizPayload = () => ({
        id: `batch_quiz_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        title: String(title || "").trim(),
        explanation: String(explanation || "").trim(),
        thumbnail_url: String(thumbnail_url || "").trim(),
        content: String(content || ""),
        allowMultipleAnswers: Boolean(allowMultipleAnswers),
        answer_type: Number(answer_type || 0),
        answer_data: Array.isArray(answer_data) ? [...answer_data] : [],
        correct: convertFullWidthNumbersToHalf(String(correct || "").trim()),
        reply_startline: String(reply_startline || ""),
        reply_deadline: String(reply_deadline || ""),
        reward: Number(reward || 0),
        correct_limit: Number(correct_limit || 0),
    });

    const validateQuizPayload = (payload) => {
        if (!String(payload.title || "").trim()) {
            return "タイトルを入力してください";
        }
        if (!String(payload.content || "").trim()) {
            return "問題内容を入力してください";
        }
        if (!String(payload.correct || "").trim()) {
            return "正解を入力してください";
        }
        if (!Number(payload.correct_limit) || Number(payload.correct_limit) <= 0) {
            return "報酬を確保する人数を1以上で入力してください";
        }
        if (!String(payload.reply_startline || "").trim() || !String(payload.reply_deadline || "").trim()) {
            return "回答開始日時と締切日時を入力してください";
        }
        return "";
    };

    const persistCreatedQuizRecord = async (payload, createdQuizId, hash) => {
        const normalizedQuizId = BigInt(createdQuizId).toString();
        const startEpoch = Math.floor(new Date(payload.reply_startline).getTime() / 1000);
        const deadlineEpoch = Math.floor(new Date(payload.reply_deadline).getTime() / 1000);
        const rewardWei = String(parseUnits(String(payload.reward || 0), 18));
        setRegisteredCorrectAnswer(normalizedQuizId, payload.correct, quiz_address);
        savePendingCreatedQuiz({
            quizId: Number(normalizedQuizId),
            sourceAddress: quiz_address,
            title: payload.title,
            explanation: payload.explanation,
            thumbnail_url: payload.thumbnail_url,
            startTime: startEpoch,
            deadline: deadlineEpoch,
            rewardWei,
            respondentCount: 0,
            respondentLimit: Number(payload.correct_limit || 0),
            status: 0,
            isPayment: false,
            txHash: String(hash || ""),
            createdAt: new Date().toISOString(),
        });
        await saveCreatedQuiz(
            normalizeCreatedQuizKey(`${quiz_address}:${Number(normalizedQuizId)}`),
            {
                quizId: Number(normalizedQuizId),
                sourceAddress: quiz_address,
                title: payload.title,
                explanation: payload.explanation,
                thumbnail_url: payload.thumbnail_url,
                startTime: startEpoch,
                deadline: deadlineEpoch,
                rewardWei,
                respondentCount: 0,
                respondentLimit: Number(payload.correct_limit || 0),
                status: 0,
                isPayment: false,
                txHash: String(hash || ""),
                createdAt: new Date().toISOString(),
            }
        );
        return normalizedQuizId;
    };

    const createQuizFromPayload = async (payload) => {
        const validationError = validateQuizPayload(payload);
        if (validationError) {
            throw new Error(validationError);
        }

        const { createdQuizId, hash } = await Contract.create_quiz(
            payload.title,
            payload.explanation,
            payload.thumbnail_url,
            withQuizContentMeta(payload.content, { allowMultipleAnswers: payload.allowMultipleAnswers }),
            payload.answer_type,
            payload.answer_data,
            payload.correct,
            payload.reply_startline,
            payload.reply_deadline,
            payload.reward,
            payload.correct_limit,
            setShow,
        );

        appendActivityLog(ACTION_TYPES.ADMIN_CREATE_QUIZ, {
            page: "create_quiz",
            title: payload.title,
            answerType: payload.answer_type,
            reward: payload.reward,
            allowMultipleAnswers: payload.allowMultipleAnswers,
            batchMode: true,
        });

        if (createdQuizId === null || createdQuizId === undefined) {
            return null;
        }

        return await persistCreatedQuizRecord(payload, createdQuizId, hash);
    };

    const create_quiz = async () => {
        if (isSubmitting) return;
        const payload = buildCurrentQuizPayload();
        const validationError = validateQuizPayload(payload);
        if (validationError) {
            alert(validationError);
            return;
        }
        setIsSubmitting(true);
        try {
            const createdQuizId = await createQuizFromPayload(payload);
            if (createdQuizId !== null) {
                clearCreateQuizDraft();
                navigate(buildAnswerQuizPath(createdQuizId, quiz_address));
                return;
            }
        } catch (error) {
            console.error("Failed to create quiz", error);
            alert(error?.shortMessage || error?.message || "問題作成に失敗しました。MetaMask の承認状態と教員権限を確認してください。");
            return;
        } finally {
            setIsSubmitting(false);
        }
        clearCreateQuizDraft();
        navigate("/list_quiz");
    };

    const addCurrentQuizToBatch = () => {
        const payload = buildCurrentQuizPayload();
        const validationError = validateQuizPayload(payload);
        if (validationError) {
            alert(validationError);
            return;
        }
        setBatchQuizzes((current) => (
            batchEditQuizId
                ? current.map((item) => (item.id === batchEditQuizId ? { ...payload, id: batchEditQuizId } : item))
                : [...current, payload]
        ));
        appendActivityLog(ACTION_TYPES.ADMIN_CREATE_QUIZ, {
            page: "create_quiz",
            title: payload.title,
            answerType: payload.answer_type,
            reward: payload.reward,
            allowMultipleAnswers: payload.allowMultipleAnswers,
            savedToBatch: true,
            updatedBatchQuiz: Boolean(batchEditQuizId),
        });
        resetQuestionFields();
    };

    const removeBatchQuiz = (id) => {
        setBatchQuizzes((current) => current.filter((item) => item.id !== id));
        if (batchEditQuizId === id) {
            setBatchEditQuizId("");
        }
    };

    const editBatchQuiz = (item) => {
        if (!item) return;
        setBatchEditQuizId(item.id);
        setTitle(String(item.title || ""));
        setExplanation(String(item.explanation || ""));
        setThumbnail_url(String(item.thumbnail_url || ""));
        setContent(String(item.content || ""));
        setAllowMultipleAnswers(Boolean(item.allowMultipleAnswers));
        setHighlightText("");
        setAnswer_type(Number(item.answer_type || 0));
        setAnswer_data(Array.isArray(item.answer_data) ? item.answer_data : []);
        setCorrect(String(item.correct || ""));
        setReward(Number(item.reward || 0));
        setCorrect_limit(Number(item.correct_limit || 0));
        setReply_startline(String(item.reply_startline || ""));
        setReply_deadline(String(item.reply_deadline || ""));
        const matchedRate = QUIZ_RATE_OPTIONS.find((option) => Number(option.reward) === Number(item.reward || 0));
        setScoreTier(matchedRate ? matchedRate.id : "custom");
        setIsManualReward(!matchedRate);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const moveBatchQuiz = (id, direction) => {
        setBatchQuizzes((current) => {
            const index = current.findIndex((item) => item.id === id);
            if (index === -1) return current;
            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= current.length) return current;
            const next = [...current];
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const reorderBatchQuiz = (id, nextIndexValue) => {
        const nextIndex = Number(nextIndexValue);
        if (!Number.isFinite(nextIndex) || nextIndex < 0) return;
        setBatchQuizzes((current) => {
            const index = current.findIndex((item) => item.id === id);
            if (index === -1 || index === nextIndex || nextIndex >= current.length) return current;
            const next = [...current];
            const [moved] = next.splice(index, 1);
            next.splice(nextIndex, 0, moved);
            return next;
        });
    };

    const publishBatchQuizzes = async () => {
        if (isSubmitting || batchQuizzes.length === 0) return;
        setIsSubmitting(true);
        try {
            const remaining = [...batchQuizzes];
            const createdIds = [];
            while (remaining.length > 0) {
                const nextQuiz = remaining[0];
                const createdQuizId = await createQuizFromPayload(nextQuiz);
                createdIds.push(createdQuizId);
                remaining.shift();
                setBatchQuizzes([...remaining]);
            }
            clearDraft(CREATE_QUIZ_BATCH_DRAFT_KEY);
            if (createdIds.length > 0) {
                clearCreateQuizDraft();
                navigate("/list_quiz");
            }
        } catch (error) {
            console.error("Failed to publish batch quizzes", error);
            alert(error?.shortMessage || error?.message || "一括出題の途中で失敗しました。残っている問題だけ続きから再実行できます。");
        } finally {
            setIsSubmitting(false);
        }
    };

    function getLocalizedDateTimeString(now = new Date()) {
        const formatter = new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });

        const localizedDateTimeString = formatter
            .format(now)
            .replace(/\u200E|\u200F/g, "")
            .replace(/\//g, "-")
            .replace(/ /, "T");

        return localizedDateTimeString;
    }

    function addDays(date, days) {
        date.setDate(date.getDate() + days);
        return date;
    }

    useEffect(() => {
        async function get_contract() {
            const studentCount = await Contract.get_num_of_students();
            const normalizedStudentCount = Number(studentCount || 0);
            setCurrentStudentCount(normalizedStudentCount);
            setCorrect_limit(Math.max(normalizedStudentCount + 200, 200));
        }
        get_contract();
        setnow(getLocalizedDateTimeString());
    }, [Contract]);

    useEffect(() => {
        try {
            const rawDraft = getDraft(CREATE_QUIZ_DRAFT_KEY);
            if (!rawDraft) {
                setIsDraftLoaded(true);
                return;
            }

            const parsedDraft = JSON.parse(rawDraft);
            if (parsedDraft && typeof parsedDraft === "object") {
                setTitle(String(parsedDraft.title || ""));
                setExplanation(String(parsedDraft.explanation || ""));
                setThumbnail_url(String(parsedDraft.thumbnail_url || ""));
                setContent(String(parsedDraft.content || ""));
                setAllowMultipleAnswers(Boolean(parsedDraft.allowMultipleAnswers));
                setHighlightText(String(parsedDraft.highlightText || ""));
                setAnswer_type(Number(parsedDraft.answer_type || 0));
                setAnswer_data(Array.isArray(parsedDraft.answer_data) ? parsedDraft.answer_data : []);
                setCorrect(String(parsedDraft.correct || ""));
                setScoreTier(String(parsedDraft.scoreTier || QUIZ_RATE_OPTIONS[0].id));
                setIsManualReward(Boolean(parsedDraft.isManualReward));
                setReply_startline(String(parsedDraft.reply_startline || getLocalizedDateTimeString()));
                setReply_deadline(String(parsedDraft.reply_deadline || getLocalizedDateTimeString(addDays(new Date(), 1))));
                setReward(Number(parsedDraft.reward ?? QUIZ_RATE_OPTIONS[0].reward));
                if (parsedDraft.correct_limit != null) {
                    setCorrect_limit(Number(parsedDraft.correct_limit));
                }
            }
        } catch (error) {
            console.error("Failed to restore create quiz draft", error);
        } finally {
            setIsDraftLoaded(true);
        }
    }, []);

    useEffect(() => {
        try {
            const rawBatchDraft = getDraft(CREATE_QUIZ_BATCH_DRAFT_KEY);
            if (!rawBatchDraft) return;
            const parsedBatchDraft = JSON.parse(rawBatchDraft);
            if (Array.isArray(parsedBatchDraft)) {
                setBatchQuizzes(parsedBatchDraft);
            }
        } catch (error) {
            console.error("Failed to restore batch quiz draft", error);
        }
    }, []);

    useEffect(() => {
        if (!isDraftLoaded) return;
        try {
            saveDraft(CREATE_QUIZ_DRAFT_KEY, JSON.stringify({
                title,
                explanation,
                thumbnail_url,
                content,
                allowMultipleAnswers,
                highlightText,
                answer_type,
                answer_data,
                correct,
                scoreTier,
                isManualReward,
                reply_startline,
                reply_deadline,
                reward,
                correct_limit,
            }));
        } catch (error) {
            console.error("Failed to save create quiz draft", error);
        }
    }, [
        isDraftLoaded,
        title,
        explanation,
        thumbnail_url,
        content,
        allowMultipleAnswers,
        highlightText,
        answer_type,
        answer_data,
        correct,
        scoreTier,
        isManualReward,
        reply_startline,
        reply_deadline,
        reward,
        correct_limit,
    ]);

    useEffect(() => {
        try {
            saveDraft(CREATE_QUIZ_BATCH_DRAFT_KEY, JSON.stringify(batchQuizzes));
        } catch (error) {
            console.error("Failed to save batch quiz draft", error);
        }
    }, [batchQuizzes]);

    const selectedRate = QUIZ_RATE_OPTIONS.find((item) => item.id === scoreTier) || QUIZ_RATE_OPTIONS[0];

    const handleRateChange = (nextTier) => {
        const nextRate = QUIZ_RATE_OPTIONS.find((item) => item.id === nextTier) || QUIZ_RATE_OPTIONS[0];
        setScoreTier(nextRate.id);
        setReward(nextRate.reward);
        setIsManualReward(false);
    };

    const handleManualModeToggle = (checked) => {
        setIsManualReward(checked);
        if (!checked) {
            const nextRate = QUIZ_RATE_OPTIONS.find((item) => item.id === scoreTier) || QUIZ_RATE_OPTIONS[0];
            setScoreTier(nextRate.id);
            setReward(nextRate.reward);
        }
    };

    const handleManualRewardChange = (value) => {
        const normalizedValue = Number(String(value || "").replace(/[^\d.]/g, ""));
        const nextReward = Number.isFinite(normalizedValue) ? normalizedValue : 0;
        setReward(nextReward);
        setIsManualReward(true);

        const matchedRate = QUIZ_RATE_OPTIONS.find((item) => Number(item.reward) === Number(nextReward));
        setScoreTier(matchedRate ? matchedRate.id : "custom");
    };

    const handleAddHighlight = (color) => {
        if (!highlightText.trim()) {
            alert("色を付けたい文字を入力してください");
            return;
        }
        setContent((current) => appendColoredText(current, highlightText, color));
        setHighlightText("");
    };

    return (
        <div className="quiz-form-page">
            <div className="page-header">
                <h1 className="page-title">📝 クイズを作成</h1>
                <p className="page-subtitle">新しいクイズを作成して、学生に出題しましょう</p>
            </div>

            <div className="quiz-form-card">
                <div className="quiz-form-group">
                    <div
                        className="glass-card"
                        style={{
                            padding: "16px",
                            display: "grid",
                            gap: "12px",
                            color: "#fff",
                            background: "rgba(255,255,255,0.04)",
                        }}
                    >
                        <div style={{ fontWeight: 700 }}>Web3小テストの配点ルール</div>
                        <div style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
                            0.3点 × 2問、0.6点 × 2問、1.2点 × 1問
                            <br />
                            1講義あたり最大 {MAX_TFT_PER_LECTURE}TFT、全{TOTAL_LECTURE_COUNT}回で最大 {MAX_TFT_TOTAL}TFT
                            <br />
                            入力内容は自動で下書き保存され、作成成功時に消去されます。
                        </div>
                    </div>
                </div>

                <div className="quiz-form-group">
                    <div className="batch-quiz-card">
                        <div className="batch-quiz-header">
                            <div>
                                <div className="batch-quiz-title">📚 まとめて出題</div>
                                <div className="batch-quiz-note">現在の入力内容を一括出題リストへ追加して、複数問題を順番にまとめて登録できます。</div>
                            </div>
                            <div className="batch-quiz-actions">
                                <button type="button" className="btn-ghost" disabled={isSubmitting} onClick={addCurrentQuizToBatch}>
                                    {batchEditQuizId ? "保存済み問題を更新" : "＋ 出題リストへ追加"}
                                </button>
                                {batchEditQuizId ? (
                                    <button type="button" className="btn-ghost" disabled={isSubmitting} onClick={resetQuestionFields}>
                                        編集をやめる
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="btn-submit-quiz"
                                    disabled={isSubmitting || batchQuizzes.length === 0}
                                    onClick={publishBatchQuizzes}
                                >
                                    {isSubmitting ? "一括出題中..." : `🚀 ${batchQuizzes.length}問をまとめて出題`}
                                </button>
                            </div>
                        </div>

                        {batchQuizzes.length === 0 ? (
                            <div className="batch-quiz-empty">まだ一括出題リストは空です。問題を入力して「出題リストへ追加」を押してください。</div>
                        ) : (
                            <div className="batch-quiz-list">
                                {batchQuizzes.map((item, index) => (
                                    <div key={item.id} className="batch-quiz-item">
                                        <div className="batch-quiz-item-main">
                                            <div className="batch-quiz-item-index">#{index + 1}</div>
                                            <div>
                                                <div className="batch-quiz-item-title">{item.title}</div>
                                                <div className="batch-quiz-item-meta">
                                                    {item.reward} TFT / {item.answer_type === 0 ? "選択式" : "記述式"} / {item.allowMultipleAnswers ? "複数回答可" : "初回のみ"}
                                                </div>
                                                <div className="batch-quiz-item-meta">
                                                    {item.reply_startline} 開始 / {item.reply_deadline} 締切 / 報酬人数 {item.correct_limit} 人
                                                </div>
                                            </div>
                                        </div>
                                        <div className="batch-quiz-item-controls">
                                            <div className="batch-quiz-order-row">
                                                <button type="button" className="btn-ghost" disabled={isSubmitting || index === 0} onClick={() => moveBatchQuiz(item.id, "up")}>
                                                    ↑
                                                </button>
                                                <button type="button" className="btn-ghost" disabled={isSubmitting || index === batchQuizzes.length - 1} onClick={() => moveBatchQuiz(item.id, "down")}>
                                                    ↓
                                                </button>
                                                <select
                                                    className="form-control-custom batch-quiz-order-select"
                                                    value={index}
                                                    disabled={isSubmitting}
                                                    onChange={(event) => reorderBatchQuiz(item.id, event.target.value)}
                                                >
                                                    {batchQuizzes.map((_, position) => (
                                                        <option key={`${item.id}_position_${position}`} value={position}>
                                                            {position + 1}番目
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="batch-quiz-item-actions">
                                                <button type="button" className="btn-secondary-custom" disabled={isSubmitting} onClick={() => editBatchQuiz(item)}>
                                                    編集
                                                </button>
                                                <button type="button" className="btn-ghost" disabled={isSubmitting} onClick={() => removeBatchQuiz(item.id)}>
                                                    削除
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* タイトル */}
                <div className="quiz-form-group">
                    <Form.Group controlId="form_titile" style={{ textAlign: "left" }}>
                        <Form.Label>📌 タイトル</Form.Label>
                        <Form.Control 
                            type="text" 
                            placeholder="クイズのタイトルを入力" 
                            value={title} 
                            onChange={(event) => setTitle(event.target.value)} 
                        />
                    </Form.Group>
                </div>

                {/* 説明 */}
                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>📄 説明</Form.Label>
                        <Form.Control 
                            as="textarea" 
                            rows={explanation.split("\n").length + 3} 
                            value={explanation} 
                            onChange={(event) => setExplanation(event.target.value)} 
                        />
                    </Form.Group>
                </div>

                {/* サムネイル */}
                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🖼️ サムネイル URL</Form.Label>
                        <Form.Control 
                            type="url" 
                            value={thumbnail_url} 
                            placeholder="https://example.com/image.png"
                            onChange={(event) => setThumbnail_url(event.target.value)} 
                        />
                    </Form.Group>
                    {thumbnail_url && (
                        <div className="thumbnail-preview">
                            <img src={thumbnail_url} alt="サムネイルプレビュー" />
                        </div>
                    )}
                </div>

                {/* 内容（Markdown） */}
                <div className="quiz-form-group">
                    <Form.Group data-color-mode="dark" style={{ textAlign: "left" }}>
                        <Form.Label>📋 内容</Form.Label>
                        <div className="content-helper-card">
                            <div className="content-helper-title">重要箇所の色付け</div>
                            <div className="content-helper-row">
                                <Form.Control
                                    type="text"
                                    value={highlightText}
                                    placeholder="色を付けたい文字を入力"
                                    onChange={(event) => setHighlightText(event.target.value)}
                                />
                                <button type="button" className="content-color-btn red" onClick={() => handleAddHighlight("#ef4444")}>赤</button>
                                <button type="button" className="content-color-btn blue" onClick={() => handleAddHighlight("#3b82f6")}>青</button>
                                <button type="button" className="content-color-btn yellow" onClick={() => handleAddHighlight("#facc15")}>黄</button>
                                <button type="button" className="content-color-btn green" onClick={() => handleAddHighlight("#22c55e")}>緑</button>
                            </div>
                            <div className="content-helper-note">入力した文字を選んだ色で本文末尾に追加します。</div>
                        </div>
                        <MDEditor height={500} value={content} onChange={setContent} />
                    </Form.Group>
                </div>

                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🔁 回答回数の設定</Form.Label>
                        <div className="answer-policy-row">
                            <label className={`answer-policy-option ${allowMultipleAnswers ? "" : "selected"}`}>
                                <input
                                    type="radio"
                                    name="answer_policy"
                                    checked={!allowMultipleAnswers}
                                    onChange={() => setAllowMultipleAnswers(false)}
                                />
                                初回のみ回答可
                            </label>
                            <label className={`answer-policy-option ${allowMultipleAnswers ? "selected" : ""}`}>
                                <input
                                    type="radio"
                                    name="answer_policy"
                                    checked={allowMultipleAnswers}
                                    onChange={() => setAllowMultipleAnswers(true)}
                                />
                                締切まで複数回回答可
                            </label>
                        </div>
                        <div className="content-helper-note">
                            複数回回答可を選ぶと、支払い確定前かつ締切前であれば回答内容を更新できます。2回目以降に正解した場合の報酬は初回設定の半額です。
                        </div>
                    </Form.Group>
                </div>

                {/* 回答選択肢 */}
                <div className="quiz-form-group">
                    <Answer_select 
                        name={"回答の追加"} 
                        variable={answer_data} 
                        variable1={correct} 
                        set={setAnswer_data} 
                        set1={setCorrect} 
                        setAnswer_type={setAnswer_type} 
                        answer_type={answer_type} 
                    />
                </div>

                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🎯 配点とTFTレート</Form.Label>
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
                            {QUIZ_RATE_OPTIONS.map((option) => {
                                const selected = !isManualReward && option.id === scoreTier;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleRateChange(option.id)}
                                        style={{
                                            border: selected ? "2px solid rgba(56, 189, 248, 0.9)" : "1px solid rgba(255,255,255,0.18)",
                                            background: selected ? "rgba(56, 189, 248, 0.18)" : "rgba(255,255,255,0.04)",
                                            color: "#fff",
                                            borderRadius: "12px",
                                            padding: "12px 16px",
                                            minWidth: "160px",
                                            textAlign: "left",
                                            fontWeight: 600,
                                        }}
                                    >
                                        <div>{option.label}</div>
                                        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.74)", marginTop: "4px" }}>
                                            1問あたり {option.reward} TFT
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: "16px" }}>
                            <Form.Check
                                type="switch"
                                id="manual-reward-switch"
                                label="TFT報酬を手動で入力する"
                                checked={isManualReward}
                                onChange={(event) => handleManualModeToggle(event.target.checked)}
                                style={{ color: "#fff", marginBottom: "12px" }}
                            />
                            {isManualReward && (
                                <Form.Group style={{ maxWidth: "320px" }}>
                                    <Form.Label style={{ color: "#fff" }}>手動入力の報酬（TFT）</Form.Label>
                                    <Form.Control
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={reward}
                                        onChange={(event) => handleManualRewardChange(event.target.value)}
                                        placeholder="例: 45"
                                    />
                                    <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>
                                        現在の換算目安: {convertTftToPoint(reward).toFixed(2)} 点（1点 = {TFT_PER_POINT} TFT）
                                    </div>
                                </Form.Group>
                            )}
                        </div>
                    </Form.Group>

                    <div
                        className="glass-card"
                        style={{
                            marginTop: "12px",
                            padding: "14px 16px",
                            color: "#fff",
                            display: "flex",
                            gap: "20px",
                            flexWrap: "wrap",
                            background: "rgba(255,255,255,0.04)",
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>今回の配点</div>
                            <div style={{ fontWeight: 700 }}>{(isManualReward ? convertTftToPoint(reward) : selectedRate.point).toFixed(2)} 点</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>今回の報酬</div>
                            <div style={{ fontWeight: 700 }}>{reward} TFT</div>
                        </div>
                    </div>
                </div>

                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left", maxWidth: "360px" }}>
                        <Form.Label>👥 報酬を確保する人数</Form.Label>
                        <Form.Control
                            type="number"
                            min={Math.max(currentStudentCount, 1)}
                            step="1"
                            value={correct_limit ?? ""}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value || 0);
                                setCorrect_limit(Number.isFinite(nextValue) ? nextValue : 0);
                            }}
                        />
                        <div className="content-helper-note" style={{ marginTop: "8px" }}>
                            現在の登録学生数は {currentStudentCount} 人です。あとから追加される学生にも報酬を配布したい場合は、この人数を多めに設定してください。
                        </div>
                        <div style={{ marginTop: "10px", color: "rgba(255,255,255,0.75)", fontSize: "13px" }}>
                            今回プラットフォームに預ける合計: {(Number(reward || 0) * Number(correct_limit || 0)).toLocaleString()} TFT
                        </div>
                    </Form.Group>
                </div>

                {/* 日時設定 */}
                <div className="quiz-form-group">
                    <div className="date-row">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>🕐 回答開始日時</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                value={String(reply_startline || now || "")}
                                min={now}
                                onChange={(event) => setReply_startline(event.target.value)}
                            />
                        </Form.Group>

                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>⏰ 回答締切日時</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                value={String(reply_deadline || "")}
                                min={now}
                                onChange={(event) => setReply_deadline(event.target.value)}
                            />
                        </Form.Group>
                    </div>
                </div>

                {/* 送信ボタン */}
                <div className="submit-area">
                    <button
                        type="button"
                        className="btn-ghost"
                        style={{ marginRight: "12px" }}
                        disabled={isSubmitting}
                        onClick={() => {
                            clearCreateQuizDraft();
                            window.location.reload();
                        }}
                    >
                        下書きを削除
                    </button>
                    <button className="btn-submit-quiz" disabled={isSubmitting} onClick={() => create_quiz()}>
                        {isSubmitting ? "送信中..." : "🚀 クイズを作成"}
                    </button>
                </div>
            </div>

            <Wait_Modal showFlag={show} />
        </div>
    );
}

export default Create_quiz;
