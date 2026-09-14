import { Contracts_MetaMask } from "../../contract/contracts";
import Form from "react-bootstrap/Form";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import MDEditor from "@uiw/react-md-editor";
import Wait_Modal from "../../contract/wait_Modal";
import { ACTION_TYPES, appendActivityLog } from "../../utils/activityLog";
import { useAccessControl } from "../../utils/accessControl";
import { createDefaultQuizContentMeta, parseQuizContentMeta, stripQuizContentMeta, withQuizContentMeta } from "../../utils/quizContentMeta";
import { appendColoredText } from "../../utils/quizEditorHelpers";
import { resolveGlobalId } from "../../utils/quizGlobalId";
import "../create_quiz/create_quiz.css";

function Edit_quiz() {
    const navigate = useNavigate();
    const location = useLocation();
    const rawId = useParams()["id"];
    const { id, address: defaultResolvedAddress } = resolveGlobalId(rawId);
    const querySourceAddress = new URLSearchParams(location.search).get("c") || "";
    const sourceAddress = querySourceAddress || defaultResolvedAddress;
    const [owner, setOwner] = useState(null);

    const [title, setTitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [thumbnail_url, setThumbnail_url] = useState("");
    const [content, setContent] = useState("");
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(createDefaultQuizContentMeta().allowMultipleAnswers);
    const [highlightText, setHighlightText] = useState("");
    const [reward, setReward] = useState("");
    const [originalReward, setOriginalReward] = useState(0);
    const [respondentLimit, setRespondentLimit] = useState(0);
    const [reply_startline, setReply_startline] = useState(
        new Date()
            .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            .replace(/[/]/g, "-")
            .replace(/\s(\d):/, " 0$1:"),
    );
    const [reply_deadline, setReply_deadline] = useState(getLocalizedDateTimeString(addDays(new Date(), 0)));
    const Contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(Contract);

    const [now, setnow] = useState(null);
    const [show, setShow] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const nextReward = Number(reward || 0);
    const rewardDelta = Number.isFinite(nextReward) ? Math.max(nextReward - originalReward, 0) : 0;
    const rewardBurnPreview = Number.isFinite(nextReward) ? Math.max(originalReward - nextReward, 0) * respondentLimit : 0;
    const rewardDepositPreview = rewardDelta * respondentLimit;
    const isRewardDecrease = Number.isFinite(nextReward) && nextReward < originalReward;
    const isSuccessfulReceipt = (receipt) => {
        if (!receipt) return false;
        if (receipt.status === "success") return true;
        if (receipt.status === 1 || receipt.status === 1n) return true;
        return false;
    };

    const edit_quiz = async () => {
        console.log(id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline);
        const rewardValue = Number(reward || 0);
        if (!Number.isFinite(rewardValue) || rewardValue < 0) {
            alert("回答報酬は0以上の数値で入力してください");
            return;
        }
        if (new Date(reply_startline).getTime() < new Date(reply_deadline).getTime()) {
            const delta = rewardValue - originalReward;
            if (delta < 0) {
                const ok = window.confirm(`報酬を減額します。余剰分 ${rewardBurnPreview.toLocaleString()} TFT はバーン用アドレスへ送られ、元に戻せません。続行しますか？`);
                if (!ok) return;
                try {
                    await Contract.reduce_quiz_reward(id, rewardValue.toString(), setShow, sourceAddress);
                } catch (error) {
                    alert("報酬の減額バーンに失敗しました。既に報酬支払い済みの問題、または未対応の旧コントラクトでは減額できません。");
                    return;
                }
            }

            let editReceipt = null;
            try {
                editReceipt = await Contract.edit_quiz(id, owner, title, explanation, thumbnail_url, withQuizContentMeta(content, { allowMultipleAnswers }), reply_startline, reply_deadline, setShow, sourceAddress);
            } catch (error) {
                console.error("Failed to submit quiz edit transaction", error);
                alert(error?.shortMessage || error?.message || "クイズ編集のトランザクション送信に失敗しました。MetaMask の接続状態と承認画面を確認してください。");
                return;
            }

            if (!isSuccessfulReceipt(editReceipt)) {
                alert(delta < 0 ? "報酬の減額は完了しましたが、クイズ内容の編集が完了していません。" : "クイズ編集のトランザクションが完了していません。報酬は変更していません。");
                return;
            }

            if (delta > 0) {
                await Contract.add_quiz_reward_delta(id, delta.toString(), respondentLimit, setShow, sourceAddress);
            }
            appendActivityLog(ACTION_TYPES.ADMIN_EDIT_QUIZ, {
                page: "edit_quiz",
                quizId: id,
                title,
                rewardBefore: originalReward,
                rewardAfter: rewardValue,
                rewardDelta: delta,
                respondentLimit,
                allowMultipleAnswers,
            });
            navigate("/edit_list");
        } else {
            alert("回答開始日時を回答締切日時より前に設定してください");
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
        let active = true;

        async function loadQuiz() {
            try {
                const quiz = await Contract.get_quiz(id, sourceAddress);
                if (!active || !quiz) return;
                setOwner(quiz[1]);
                setTitle(quiz[2] || "");
                setExplanation(quiz[3] || "");
                setThumbnail_url(quiz[4] || "");
                const nextMeta = parseQuizContentMeta(quiz[5] || "");
                setAllowMultipleAnswers(Boolean(nextMeta.allowMultipleAnswers));
                setContent(stripQuizContentMeta(quiz[5] || ""));
                setReply_startline(getLocalizedDateTimeString(new Date(Number(quiz[8]) * 1000)));
                setReply_deadline(getLocalizedDateTimeString(new Date(Number(quiz[9]) * 1000)));
                const currentReward = Number(quiz[10] || 0) / 10 ** 18;
                setReward(String(currentReward));
                setOriginalReward(currentReward);
                setRespondentLimit(Number(quiz[12] || 0));
                setnow(getLocalizedDateTimeString());
                setIsReady(true);
            } catch (error) {
                console.error("Failed to load quiz for edit", error);
                setIsReady(false);
            }
        }

        loadQuiz();

        return () => {
            active = false;
        };
    }, [Contract, id, sourceAddress]);

    const handleAddHighlight = (color) => {
        if (!highlightText.trim()) {
            alert("色を付けたい文字を入力してください");
            return;
        }
        setContent((current) => appendColoredText(current, highlightText, color));
        setHighlightText("");
    };

    if (access.isLoading || !isReady) {
        return <div className="quiz-form-page"><div className="loading-text-bright">読み込み中です...</div></div>;
    }

    if (access.isTeacher) {
        return (
            <div className="quiz-form-page">
                <div className="page-header">
                    <h1 className="page-title">✏️ クイズを編集</h1>
                    <p className="page-subtitle">クイズID: {id} の内容を編集します</p>
                </div>

                <div className="quiz-form-card">
                    {/* タイトル */}
                    <div className="quiz-form-group">
                        <Form.Group controlId="form_titile" style={{ textAlign: "left" }}>
                            <Form.Label>📌 タイトル</Form.Label>
                            <Form.Control 
                                type="text" 
                                placeholder="Enter Title" 
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
                            <Form.Label>🖼️ サムネイル</Form.Label>
                            <Form.Control 
                                type="url" 
                                value={thumbnail_url} 
                                onChange={(event) => setThumbnail_url(event.target.value)} 
                            />
                        </Form.Group>
                        {thumbnail_url && (
                            <div className="thumbnail-preview">
                                <img src={thumbnail_url} alt="サムネイルプレビュー" />
                            </div>
                        )}
                    </div>

                    {/* 内容 */}
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
                                複数回回答可では、2回目以降に正解した場合の報酬は初回設定の半額になります。
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
                                    value={reply_startline}
                                    onChange={(event) => setReply_startline(event.target.value)}
                                />
                            </Form.Group>

                            <Form.Group style={{ textAlign: "left" }}>
                                <Form.Label>⏰ 回答締切日時</Form.Label>
                                <Form.Control
                                    type="datetime-local"
                                    value={reply_deadline}
                                    onChange={(event) => setReply_deadline(event.target.value)}
                                />
                            </Form.Group>
                        </div>
                    </div>

                    {/* 報酬設定 */}
                    <div className="quiz-form-group">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>💎 回答報酬 TFT</Form.Label>
                            <Form.Control
                                type="number"
                                min={originalReward}
                                step="0.000001"
                                value={reward}
                                onChange={(event) => setReward(event.target.value)}
                            />
                            <div className="reward-edit-summary">
                                <span>現在の報酬: {originalReward.toLocaleString()} TFT / 人</span>
                                <span>回答上限: {respondentLimit.toLocaleString()} 人</span>
                                <span>追加預託: {rewardDepositPreview.toLocaleString()} TFT</span>
                                <span>バーン予定: {rewardBurnPreview.toLocaleString()} TFT</span>
                            </div>
                            {isRewardDecrease ? (
                                <p className="reward-edit-warning">
                                    保存時に差額 {Math.max(originalReward - nextReward, 0).toLocaleString()} TFT × {respondentLimit.toLocaleString()} 人分をバーン用アドレスへ送って、問題の報酬額も減額します。報酬支払い済みの問題は減額できません。
                                </p>
                            ) : rewardDelta > 0 ? (
                                <p className="reward-edit-note">
                                    保存時に差額 {rewardDelta.toLocaleString()} TFT × {respondentLimit.toLocaleString()} 人分だけ追加で預託します。
                                </p>
                            ) : (
                                <p className="reward-edit-note">報酬額は変更されません。</p>
                            )}
                        </Form.Group>
                    </div>

                    {/* 送信ボタン */}
                    <div className="submit-area">
                        <button className="btn-submit-quiz" onClick={() => edit_quiz()}>
                            💾 編集を保存
                        </button>
                    </div>
                </div>

                <Wait_Modal showFlag={show} />
            </div>
        );
    } else {
        return (<div className="quiz-form-page">この画面は教員・TAのみ利用できます。</div>);
    }
}

export default Edit_quiz;
