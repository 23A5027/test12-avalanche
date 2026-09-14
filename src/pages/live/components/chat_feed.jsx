import React, { useState } from "react";
import "./chat.css";

function Chat_feed({ messages, onQuestionLike, likedQuestionIds, canModerate = false, onDeleteMessage }) {
    const [openedAddressMessageId, setOpenedAddressMessageId] = useState("");

    // 金額に応じたスーパーチャットのカラークラスを取得
    const getSuperchatColorClass = (amount) => {
        if (amount >= 1000) return "superchat-red";
        if (amount >= 500) return "superchat-magenta";
        if (amount >= 100) return "superchat-orange";
        if (amount >= 50) return "superchat-green";
        return "superchat-blue";
    };

    const toggleAddress = (messageId) => {
        setOpenedAddressMessageId((current) => (current === messageId ? "" : messageId));
    };

    return (
        <div className="chat-feed" style={{ overflowY: "auto", height: "100%", paddingRight: "12px" }}>
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={`chat-message ${msg.type === "superchat" ? `chat-superchat ${getSuperchatColorClass(msg.amount)}` : ""} ${msg.messageKind === "question" ? "chat-question" : ""}`}
                >
                    {canModerate ? (
                        <div className="chat-message-tools">
                            <button
                                type="button"
                                className="chat-message-delete"
                                onClick={() => onDeleteMessage?.(msg.id)}
                            >
                                削除
                            </button>
                        </div>
                    ) : null}
                    {msg.messageKind === "question" && (
                        <div className="chat-question-header">
                            <span className="chat-question-badge">質問</span>
                            <button
                                type="button"
                                className={`chat-question-like ${likedQuestionIds?.includes(msg.id) ? "is-liked" : ""}`}
                                onClick={() => onQuestionLike?.(msg.id)}
                                disabled={!onQuestionLike || likedQuestionIds?.includes(msg.id)}
                            >
                                {likedQuestionIds?.includes(msg.id) ? "支持済み" : "支持する"} {msg.likeCount || 0}
                            </button>
                        </div>
                    )}
                    {msg.type === "superchat" && (
                        <div className="superchat-header">
                            <span className="superchat-amount">{msg.amount} TTT</span>
                            <button
                                type="button"
                                className="chat-user-button superchat-user"
                                onClick={() => toggleAddress(msg.id)}
                                disabled={!msg.senderAddress}
                                title={msg.senderAddress ? "タップで送信者アドレスを表示" : ""}
                            >
                                {msg.user}
                            </button>
                            {msg.recipientLabel ? (
                                <span className="superchat-user">→ {msg.recipientLabel}</span>
                            ) : null}
                        </div>
                    )}
                    <div className="chat-message-content">
                        {msg.type !== "superchat" && (
                            <button
                                type="button"
                                className="chat-user-button chat-user"
                                onClick={() => toggleAddress(msg.id)}
                                disabled={!msg.senderAddress}
                                title={msg.senderAddress ? "タップで送信者アドレスを表示" : ""}
                            >
                                {msg.user}:
                            </button>
                        )}
                        <span className="chat-text" style={{ color: "#ffffff", opacity: 0.9 }}>{msg.text}</span>
                    </div>
                    {openedAddressMessageId === msg.id && msg.senderAddress ? (
                        <div className="chat-address-panel">
                            <span className="chat-address-label">送信者アドレス</span>
                            <span className="chat-address-value">{msg.senderAddress}</span>
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export default Chat_feed;
