import React, { useEffect, useRef, useState } from "react";
import Superchat_modal from "./superchat_modal";
import { AiOutlineSend } from "react-icons/ai";
import { FaMoneyBillWave } from "react-icons/fa";
import { ACTION_TYPES, appendActivityLog, getDraft, saveDraft, clearDraft } from "../../../utils/activityLog";
import { appendBoardLog } from "../../../utils/boardModerationLog";
import { moderateLiveComment } from "../../../utils/liveCommentModeration";
import "./chat.css";

const CHAT_DRAFT_KEY = "live_chat_message";

function Chat_input({ onSendMessage, cont, isRegistered, isLoadingAuth, readOnlyReason = "" }) {
    const [text, setText] = useState(() => getDraft(CHAT_DRAFT_KEY));
    const [showModal, setShowModal] = useState(false);
    const [messageKind, setMessageKind] = useState("comment");
    const [isAnonymousQuestion, setIsAnonymousQuestion] = useState(false);
    const changeCountRef = useRef(0);

    useEffect(() => {
        if (text === "") {
            clearDraft(CHAT_DRAFT_KEY);
            appendActivityLog(ACTION_TYPES.LIVE_CHAT_DRAFT_CLEARED, {
                page: "live",
                reason: "empty_input",
            });
            return;
        }
        const timer = setTimeout(() => {
            saveDraft(CHAT_DRAFT_KEY, text);
            appendActivityLog(ACTION_TYPES.LIVE_CHAT_DRAFT_SAVED, {
                page: "live",
                contentLength: text.length,
            });
        }, 250);
        return () => clearTimeout(timer);
    }, [text]);

    const handleInputChange = (value) => {
        setText(value);
        changeCountRef.current += 1;
        appendActivityLog(ACTION_TYPES.LIVE_CHAT_INPUT_CHANGED, {
            page: "live",
            contentLength: value.length,
            changeCount: changeCountRef.current,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        const moderation = moderateLiveComment(trimmed);
        if (moderation.blocked) {
            appendBoardLog({
                type: "normal",
                messageKind,
                user: "local_user",
                text: trimmed,
                isAnonymous: messageKind === "question" && isAnonymousQuestion,
                status: "blocked",
                reason: moderation.reason || "moderated",
                categories: moderation.categories || [],
            });
            appendActivityLog(ACTION_TYPES.LIVE_MESSAGE_BLOCKED, {
                page: "live",
                channel: "live",
                reason: moderation.categories.join(",") || "moderated",
                contentLength: trimmed.length,
                type: "normal",
            });
            alert(moderation.reason || "このコメントは送信できません。");
            return;
        }

        onSendMessage(trimmed, "normal", 0, {
            messageKind,
            isQuestion: messageKind === "question",
            isAnonymous: messageKind === "question" && isAnonymousQuestion,
        });
        appendActivityLog(ACTION_TYPES.LIVE_MESSAGE_SENT, {
            page: "live",
            contentLength: trimmed.length,
            channel: "live",
            draftUsed: Boolean(getDraft(CHAT_DRAFT_KEY)),
            messageKind,
            isAnonymousQuestion,
        });
        setText("");
        clearDraft(CHAT_DRAFT_KEY);
    };

    const handleSuperchat = async (amount, message, options = {}) => {
        const trimmed = (message || "").trim();
        const moderation = trimmed ? moderateLiveComment(trimmed) : { blocked: false, categories: [] };
        if (trimmed && moderation.blocked) {
            appendBoardLog({
                type: "superchat",
                messageKind: "superchat",
                user: "local_user",
                text: trimmed,
                amount,
                status: "blocked",
                reason: moderation.reason || "moderated",
                categories: moderation.categories || [],
            });
            appendActivityLog(ACTION_TYPES.LIVE_MESSAGE_BLOCKED, {
                page: "live",
                reason: moderation.categories.join(",") || "moderated",
                contentLength: trimmed.length,
                type: "superchat",
                amount,
            });
            alert(moderation.reason || "スーパーチャットのメッセージを見直してください。");
            return;
        }
        await onSendMessage(trimmed, "superchat", amount, options);
        appendActivityLog(ACTION_TYPES.LIVE_SUPERCHAT_SENT, {
            page: "live",
            contentLength: trimmed.length,
            amount,
            channel: "live",
            messageKind: "superchat",
            recipientSpecified: Boolean(options.recipientAddress),
        });
    };

    return (
        <div className="chat-input-wrapper">
            {isLoadingAuth ? (
                <div className="text-muted text-center py-2" style={{ fontSize: "14px" }}>
                    認証状態を確認中...
                </div>
            ) : !isRegistered ? (
                <div className="auth-warning glass-card text-center" style={{ padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--accent-red)", background: "rgba(255, 50, 50, 0.1)" }}>
                    <p style={{ margin: 0, fontSize: "14px", color: "#ff8888" }}>
                        コメントや質問をするには、MetaMask 接続後に教員から登録してもらってください。
                    </p>
                </div>
        ) : readOnlyReason ? (
            <div className="auth-warning glass-card text-center" style={{ padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255, 255, 255, 0.06)" }}>
                <p style={{ margin: 0, fontSize: "14px", color: "#d8f3ff" }}>
                    {readOnlyReason}
                </p>
            </div>
        ) : (
                <form onSubmit={handleSubmit} className="chat-form">
                    <div className="chat-mode-row">
                        <button
                            type="button"
                            className={`chat-mode-btn ${messageKind === "comment" ? "is-active" : ""}`}
                            onClick={() => setMessageKind("comment")}
                        >
                            コメント
                        </button>
                        <button
                            type="button"
                            className={`chat-mode-btn ${messageKind === "question" ? "is-active" : ""}`}
                            onClick={() => setMessageKind("question")}
                        >
                            質問
                        </button>
                        {messageKind === "question" ? (
                            <label className="chat-anonymous-toggle">
                                <input
                                    type="checkbox"
                                    checked={isAnonymousQuestion}
                                    onChange={(event) => setIsAnonymousQuestion(event.target.checked)}
                                />
                                匿名で送る
                            </label>
                        ) : null}
                    </div>
                    <div className="chat-input-main">
                        <input
                            type="text"
                            className="form-control-custom chat-input-field"
                            placeholder={messageKind === "question" ? "質問を入力..." : "コメントを入力..."}
                            value={text}
                            maxLength={200}
                            onChange={(e) => handleInputChange(e.target.value)}
                        />
                        <div className="chat-form-actions">
                            <div className="chat-draft-hint">{text ? `${text.length}/200` : "下書き自動保存"}</div>
                            <button
                                type="button"
                                className="btn-superchat"
                                onClick={() => {
                                    setShowModal(true);
                                    appendActivityLog(ACTION_TYPES.LIVE_MODAL_OPENED, { page: "live", modal: "superchat" });
                                }}
                                title="スーパーチャットを送る"
                            >
                                <FaMoneyBillWave />
                            </button>
                            <button type="submit" className="btn-primary btn-send">
                                <AiOutlineSend />
                            </button>
                        </div>
                    </div>
                </form>
            )}

            <Superchat_modal
                show={showModal}
                onHide={() => {
                    setShowModal(false);
                    appendActivityLog(ACTION_TYPES.LIVE_MODAL_CLOSED, { page: "live", modal: "superchat" });
                }}
                onSend={handleSuperchat}
                cont={cont}
            />
        </div>
    );
}

export default Chat_input;
