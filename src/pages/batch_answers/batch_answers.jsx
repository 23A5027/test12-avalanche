import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Wait_Modal from "../../contract/wait_Modal";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import {
    buildBatchAnswerKey,
    clearBatchAnswerQueue,
    getBatchAnswerQueue,
    removeBatchAnswerQueueItem,
    subscribeBatchAnswerQueue,
    updateBatchAnswerQueueItem,
} from "../../utils/batchAnswerQueue";
import { ACTION_TYPES, appendActivityLog } from "../../utils/activityLog";
import { buildAnswerQuizPath, buildAnswerQuizState, rememberQuizSource } from "../../utils/quizLinks";
import "./batch_answers.css";

function Batch_answers() {
    const contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(contract);
    const [queue, setQueue] = useState(() => getBatchAnswerQueue());
    const [show, setShow] = useState(false);
    const [modalContent, setModalContent] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitReport, setSubmitReport] = useState([]);

    useEffect(() => {
        const unsubscribe = subscribeBatchAnswerQueue((nextQueue) => {
            setQueue(Array.isArray(nextQueue) ? nextQueue : []);
        });
        return unsubscribe;
    }, []);

    const handleAnswerChange = (key, value) => {
        updateBatchAnswerQueueItem(key, { answer: value });
    };

    const handleRemove = (key) => {
        removeBatchAnswerQueueItem(key);
    };

    const handleClear = () => {
        if (!window.confirm("まとめて解答リストをすべて削除します。よろしいですか。")) return;
        clearBatchAnswerQueue();
        setSubmitReport([]);
    };

    const handleSubmitAll = async () => {
        if (isSubmitting || queue.length === 0) return;
        if (!access.canAnswerQuiz) {
            alert("回答権限がないため、一括送信できません。");
            return;
        }

        setIsSubmitting(true);
        setSubmitReport([]);
        const nextReport = [];

        try {
            for (const item of queue) {
                const normalizedAnswer = String(item.answer || "").trim();
                if (!normalizedAnswer) {
                    nextReport.push({
                        key: item.key,
                        title: item.title,
                        ok: false,
                        message: "回答が空のため送信していません。",
                    });
                    continue;
                }

                try {
                    setModalContent(`${item.title || `問題 ${item.quizId}`} を送信中...`);
                    await contract.create_answer(item.quizId, normalizedAnswer, setShow, setModalContent, item.sourceAddress);
                    removeBatchAnswerQueueItem(item.key);
                    nextReport.push({
                        key: item.key,
                        title: item.title,
                        ok: true,
                        message: "送信できました。",
                    });
                    appendActivityLog(ACTION_TYPES.ANSWER_SUBMITTED, {
                        page: "batch_answers",
                        quizId: item.quizId,
                        quizTitle: item.title,
                        sourceAddress: item.sourceAddress || "",
                        answerLength: normalizedAnswer.length,
                        batchMode: true,
                        address: access.address,
                    });
                } catch (error) {
                    nextReport.push({
                        key: item.key,
                        title: item.title,
                        ok: false,
                        message: error?.shortMessage || error?.message || "送信に失敗しました。",
                    });
                    appendActivityLog(ACTION_TYPES.ANSWER_SUBMIT_FAILED, {
                        page: "batch_answers",
                        quizId: item.quizId,
                        quizTitle: item.title,
                        sourceAddress: item.sourceAddress || "",
                        answerLength: normalizedAnswer.length,
                        errorMessage: error?.message || "batch_answer_submit_failed",
                        batchMode: true,
                        address: access.address,
                    });
                }
            }
        } finally {
            setShow(false);
            setModalContent("");
            setSubmitReport(nextReport);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="batch-answer-page animate-fadeIn">
            <div className="page-header">
                <h1 className="page-title">🗂 まとめて解答</h1>
                <p className="page-subtitle">各問題で保存した解答を確認し、最後にまとめて送信できます。</p>
                <div className="batch-answer-page-nav">
                    <Link to="/list_quiz" className="btn-secondary-custom" style={{ textDecoration: "none" }}>
                        クイズ一覧へ戻る
                    </Link>
                </div>
            </div>

            {!access.canAnswerQuiz ? (
                <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff" }}>
                    MetaMask 接続と利用登録が完了すると、一括送信を利用できます。
                </div>
            ) : null}

            <div className="glass-card batch-answer-card">
                <div className="batch-answer-toolbar">
                    <div>
                        <div className="batch-answer-count">{queue.length}件の解答を保管中</div>
                        <div className="batch-answer-note">授業中は各問題で「まとめて解答リストに保存」を選び、最後にここから送信できます。</div>
                    </div>
                    <div className="batch-answer-actions">
                        <button type="button" className="btn-ghost" disabled={queue.length === 0 || isSubmitting} onClick={handleClear}>
                            リストを空にする
                        </button>
                        <button type="button" className="btn-primary-custom" disabled={queue.length === 0 || isSubmitting || !access.canAnswerQuiz} onClick={handleSubmitAll}>
                            {isSubmitting ? "一括送信中..." : "最後に一括送信"}
                        </button>
                    </div>
                </div>

                {queue.length === 0 ? (
                    <div className="batch-answer-empty">
                        まだ保存された解答はありません。各問題ページで「まとめて解答リストに保存」を押してください。
                    </div>
                ) : (
                    <div className="batch-answer-list">
                        {queue.map((item, index) => (
                            <div key={item.key || buildBatchAnswerKey(item.quizId, item.sourceAddress)} className="batch-answer-item">
                                <div className="batch-answer-item-header">
                                    <div>
                                        <div className="batch-answer-item-index">#{index + 1}</div>
                                        <div className="batch-answer-item-title">{item.title || `問題 ${item.quizId}`}</div>
                                    </div>
                                    <div className="batch-answer-item-actions">
                                        <Link
                                            to={buildAnswerQuizPath(item.quizId, item.sourceAddress)}
                                            state={buildAnswerQuizState(item.sourceAddress)}
                                            className="btn-secondary-custom"
                                            onClick={() => rememberQuizSource(item.quizId, item.sourceAddress)}
                                            style={{ textDecoration: "none" }}
                                        >
                                            問題へ戻る
                                        </Link>
                                        <button type="button" className="btn-ghost" onClick={() => handleRemove(item.key)} disabled={isSubmitting}>
                                            削除
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    className="form-control-custom"
                                    rows={Math.max(3, String(item.answer || "").split("\n").length)}
                                    value={item.answer || ""}
                                    onChange={(event) => handleAnswerChange(item.key, event.target.value)}
                                    disabled={isSubmitting}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {submitReport.length > 0 && (
                <div className="glass-card batch-answer-report">
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>送信結果</h2>
                    <div className="batch-answer-report-list">
                        {submitReport.map((item) => (
                            <div key={`${item.key}_${item.ok ? "ok" : "ng"}`} className={`batch-answer-report-item ${item.ok ? "is-ok" : "is-error"}`}>
                                <strong>{item.title || "問題"}</strong>
                                <span>{item.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Wait_Modal showFlag={show} content={modalContent} />
        </div>
    );
}

export default Batch_answers;
