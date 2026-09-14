import React, { useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";

function Reward_burn_panel(props) {
    const [quizId, setQuizId] = useState("");
    const [newReward, setNewReward] = useState("");
    const [quizInfo, setQuizInfo] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");

    const currentReward = useMemo(() => Number(quizInfo?.reward || 0), [quizInfo]);
    const respondentLimit = useMemo(() => Number(quizInfo?.respondentLimit || 0), [quizInfo]);
    const burnAmount = useMemo(() => {
        const next = Number(newReward || 0);
        if (!Number.isFinite(next) || next >= currentReward) return 0;
        return (currentReward - next) * respondentLimit;
    }, [currentReward, newReward, respondentLimit]);

    async function loadQuiz() {
        const id = Number(quizId);
        if (!Number.isInteger(id) || id < 0) {
            alert("クイズIDを正しく入力してください。");
            return;
        }

        setMessage("");
        setQuizInfo(null);
        try {
            const quiz = await props.cont.get_quiz(id);
            const reward = Number(quiz?.[10] || 0) / 10 ** 18;
            const limit = Number(quiz?.[12] || 0);
            setQuizInfo({
                id,
                title: quiz?.[2] || "",
                reward,
                respondentLimit: limit,
            });
            setNewReward(String(reward));
        } catch (error) {
            console.error("Failed to load quiz for reward burn", error);
            alert("クイズ情報を取得できませんでした。");
        }
    }

    async function reduceReward() {
        if (!quizInfo) {
            alert("先にクイズ情報を読み込んでください。");
            return;
        }

        const next = Number(newReward || 0);
        if (!Number.isFinite(next) || next < 0) {
            alert("減額後の報酬は0以上の数値で入力してください。");
            return;
        }
        if (next >= currentReward) {
            alert("現在の報酬より小さい金額を入力してください。増額はクイズ編集画面から行えます。");
            return;
        }

        const ok = window.confirm(`クイズID ${quizInfo.id} の報酬を ${currentReward} TFT から ${next} TFT に減額します。余剰 ${burnAmount.toLocaleString()} TFT はバーン用アドレスへ送られ、元に戻せません。続行しますか？`);
        if (!ok) return;

        setIsSubmitting(true);
        setMessage("");
        try {
            const result = await props.cont.reduce_quiz_reward(quizInfo.id, next.toString());
            appendActivityLog(ACTION_TYPES.ADMIN_EDIT_QUIZ, {
                page: "reward_burn_panel",
                quizId: quizInfo.id,
                title: quizInfo.title,
                rewardBefore: currentReward,
                rewardAfter: next,
                burnedTft: burnAmount,
                txHash: result?.hash || "",
            });
            setMessage(`報酬を減額し、${burnAmount.toLocaleString()} TFT をバーン用アドレスへ送信しました。Tx: ${result?.hash || "-"}`);
            await loadQuiz();
        } catch (error) {
            console.error("Failed to reduce quiz reward", error);
            alert("報酬バーンに失敗しました。報酬支払い済みの問題、または未対応の旧コントラクトでは実行できません。");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div>
            <h2 className="section-title">報酬バーン減額</h2>
            <p className="section-desc">
                問題の回答報酬を減額し、余剰TFTをバーン用アドレスへ送って、表示額と実際の支払い額を一致させます。
                報酬支払い済みの問題は減額できません。
            </p>

            <div className="token-grant-card">
                <div className="token-grant-card-title">クイズを指定</div>
                <div className="token-grant-inputs">
                    <Form.Group>
                        <Form.Label>クイズID</Form.Label>
                        <Form.Control
                            type="number"
                            min="0"
                            value={quizId}
                            onChange={(event) => setQuizId(event.target.value)}
                            placeholder="例: 0"
                        />
                    </Form.Group>
                </div>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={loadQuiz}>
                        クイズ情報を読み込む
                    </button>
                </div>
            </div>

            {quizInfo && (
                <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                    <div className="token-grant-card-title">減額内容</div>
                    <div className="token-grant-status-list detailed">
                        <div className="token-grant-status-badge detailed">タイトル: {quizInfo.title || "-"}</div>
                        <div className="token-grant-status-badge detailed">現在の報酬: {currentReward.toLocaleString()} TFT / 人</div>
                        <div className="token-grant-status-badge detailed">回答上限: {respondentLimit.toLocaleString()} 人</div>
                        <div className="token-grant-status-badge detailed">バーン予定: {burnAmount.toLocaleString()} TFT</div>
                    </div>
                    <Form.Group style={{ marginTop: "var(--space-4)" }}>
                        <Form.Label>減額後の報酬（TFT / 人）</Form.Label>
                        <Form.Control
                            type="number"
                            min="0"
                            max={currentReward}
                            step="0.000001"
                            value={newReward}
                            onChange={(event) => setNewReward(event.target.value)}
                        />
                    </Form.Group>
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" disabled={isSubmitting || burnAmount <= 0} onClick={reduceReward}>
                            余剰TFTをバーンして減額
                        </button>
                    </div>
                </div>
            )}

            {message && <div className="address-item" style={{ marginTop: "var(--space-4)" }}>{message}</div>}
        </div>
    );
}

export default Reward_burn_panel;
