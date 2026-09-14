import React, { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { FaMoneyBillWave } from "react-icons/fa";
import "./chat.css";

function Superchat_modal({ show, onHide, onSend, cont }) {
    const [amount, setAmount] = useState(10);
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [balance, setBalance] = useState(0);
    const [address, setAddress] = useState("");
    const [teacherRecipients, setTeacherRecipients] = useState([]);
    const [selectedRecipient, setSelectedRecipient] = useState("");
    const [customRecipient, setCustomRecipient] = useState("");

    const amounts = [10, 50, 100, 500, 1000];

    useEffect(() => {
        let active = true;
        const load = async () => {
            const nextAddress = await cont?.get_address?.();
            if (!active) return;
            setAddress(nextAddress || "");
            const nextBalance = nextAddress ? await cont?.get_ttt_balance?.(nextAddress) : 0;
            if (!active) return;
            setBalance(Number(nextBalance || 0));

            const teacherAddresses = await cont?.get_teachers?.();
            if (!active) return;

            const recipients = await Promise.all(
                (Array.isArray(teacherAddresses) ? teacherAddresses : []).map(async (teacherAddress, index) => {
                    const normalizedAddress = String(teacherAddress || "");
                    if (!normalizedAddress) return null;
                    try {
                        const userData = await cont?.get_user_data?.(normalizedAddress);
                        const teacherName = String(userData?.[0] || "").trim();
                        return {
                            address: normalizedAddress,
                            label: teacherName || `教員 ${index + 1}`,
                        };
                    } catch (error) {
                        return {
                            address: normalizedAddress,
                            label: `教員 ${index + 1}`,
                        };
                    }
                })
            );

            setTeacherRecipients(recipients.filter(Boolean));
        };
        if (show) {
            load();
        } else {
            setSelectedRecipient("");
            setCustomRecipient("");
        }
        return () => {
            active = false;
        };
    }, [cont, show]);

    const handleSend = async () => {
        if (amount <= 0 || message.trim() === "") return;

        setIsSending(true);
        try {
            await onSend(amount, message, {
                recipientAddress: customRecipient.trim() || selectedRecipient || "",
            });
            const nextBalance = address ? await cont?.get_ttt_balance?.(address) : 0;
            setBalance(Number(nextBalance || 0));
            setMessage("");
            setAmount(10);
            setSelectedRecipient("");
            setCustomRecipient("");
            onHide();
        } catch (error) {
            console.error("Superchat failed:", error);
            if (error?.message === "insufficient_ttt_balance") {
                alert("TTT 残高が不足しています。");
            } else if (error?.message === "superchat_recipient_not_found") {
                alert("送金先の教員アドレスが見つかりませんでした。");
            } else {
                alert("スーパーチャット送信に失敗しました。MetaMask の確認画面を確認してください。");
            }
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <div className="glass-card" style={{ padding: "var(--space-6)", borderRadius: "var(--radius-xl)" }}>
                <Modal.Header closeButton style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "var(--space-4)" }}>
                    <Modal.Title className="heading-lg" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FaMoneyBillWave style={{ color: "var(--accent-yellow)" }} /> 
                        スーパーチャットを送信
                    </Modal.Title>
                </Modal.Header>
                
                <Modal.Body style={{ paddingTop: "var(--space-6)" }}>
                    <div className="mb-4">
                        <label className="text-muted" style={{ marginBottom: "var(--space-2)", display: "block" }}>
                            送信する金額 (TTT)
                        </label>
                        <div style={{ marginBottom: "var(--space-2)", color: "#d8f3ff", fontSize: "14px" }}>
                            現在残高: {balance} TTT
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
                            {amounts.map(preset => (
                                <button
                                    key={preset}
                                    type="button"
                                    className={`btn ${amount === preset ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setAmount(preset)}
                                    style={{ flex: 1, minWidth: "60px", padding: "8px" }}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            className="form-control-custom"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            min="1"
                            style={{ color: "#222", backgroundColor: "#fff", border: "1px solid #ccc" }}
                        />
                    </div>

                    <div className="mb-4">
                        <label className="text-muted" style={{ marginBottom: "var(--space-2)", display: "block" }}>
                            メッセージ
                        </label>
                        <textarea
                            className="form-control-custom"
                            rows="3"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="応援メッセージを入力..."
                            maxLength={100}
                            style={{ color: "#222", backgroundColor: "#fff", border: "1px solid #ccc" }}
                        />
                    </div>

                    <div className="mb-3">
                        <label className="text-muted" style={{ marginBottom: "var(--space-2)", display: "block" }}>
                            送り先
                        </label>
                        <select
                            className="form-control-custom"
                            value={selectedRecipient}
                            onChange={(event) => setSelectedRecipient(event.target.value)}
                            style={{ color: "#222", backgroundColor: "#fff", border: "1px solid #ccc", marginBottom: "12px" }}
                        >
                            <option value="">指定しない（教員側へ送る）</option>
                            {teacherRecipients.map((recipient) => (
                                <option key={recipient.address} value={recipient.address}>
                                    {recipient.label} ({recipient.address.slice(0, 6)}...{recipient.address.slice(-4)})
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            className="form-control-custom"
                            value={customRecipient}
                            onChange={(event) => setCustomRecipient(event.target.value)}
                            placeholder="直接アドレスを指定する場合はここへ入力"
                            style={{ color: "#222", backgroundColor: "#fff", border: "1px solid #ccc" }}
                        />
                        <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(216,243,255,0.8)" }}>
                            未指定なら教員側の受取先へ送ります。
                        </div>
                    </div>
                </Modal.Body>

                <Modal.Footer style={{ borderTop: "none", padding: 0, marginTop: "var(--space-6)" }}>
                    <button 
                        className="btn-primary" 
                        style={{ width: "100%", padding: "16px", fontSize: "18px", fontWeight: "bold", background: "linear-gradient(135deg, var(--accent-yellow), #FF8C00)" }}
                        onClick={handleSend}
                        disabled={isSending || amount <= 0 || message.trim() === "" || balance < amount}
                    >
                        {isSending ? "送信中..." : `${amount} TTT を送る`}
                    </button>
                </Modal.Footer>
            </div>
        </Modal>
    );
}

export default Superchat_modal;
