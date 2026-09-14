import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { legacy_quiz_addresses, quiz_address } from "../../contract/config";
import { useAccessControl } from "../../utils/accessControl";
import { resolveGlobalId } from "../../utils/quizGlobalId";
import { persistRewardPayoutEntriesToServer, syncRewardPayoutLedgerFromServer } from "../../utils/rewardPayoutLedger";
import "./investment_page.css";

const GRADE_LABEL = {
    correct: "正解",
    incorrect: "不正解",
    pending: "未判定",
};

function formatAnswerState(state) {
    if (state === 2) return "正解済み";
    if (state === 1) return "不正解済み";
    if (state === 3) return "回答済み";
    return "未回答";
}

function formatTxHash(hash) {
    if (!hash) return "";
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function buildChunkTxMap(addressGroups = [], receipts = []) {
    const txMap = new Map();
    addressGroups.forEach((addresses, chunkIndex) => {
        const receipt = receipts[chunkIndex];
        const txHash = String(receipt?.transactionHash || receipt?.hash || "");
        const normalizedAddresses = Array.isArray(addresses)
            ? addresses
            : [...(addresses?.correctStudents || []), ...(addresses?.incorrectStudents || [])];
        normalizedAddresses.forEach((address) => {
            txMap.set(normalizeAddress(address), txHash);
        });
    });
    return txMap;
}

function isRewardSettlementPending(row) {
    return Boolean(row?.submitted) && Number(row?.state || 0) === 3;
}

function Investment_to_quiz() {
    const navigate = useNavigate();
    const location = useLocation();
    const rawId = useParams().id;
    const { id, address: defaultResolvedAddress } = resolveGlobalId(rawId);
    const querySourceAddress = new URLSearchParams(location.search).get("c") || "";
    const sourceAddress = querySourceAddress || defaultResolvedAddress;

    const [amount, setAmount] = useState(0);
    const [isNotPayingOut, setIsNotPayingOut] = useState("true");
    const [autoAnswer, setAutoAnswer] = useState("");
    const [confirmAnswer, setConfirmAnswer] = useState("");
    const [isNotAddingReward, setIsNotAddingReward] = useState("true");
    const [gradingMode, setGradingMode] = useState("manual");
    const [studentRows, setStudentRows] = useState([]);
    const [gradingMap, setGradingMap] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [executionSummary, setExecutionSummary] = useState(null);
    const [quizTitle, setQuizTitle] = useState("");
    const [rewardPayoutEntries, setRewardPayoutEntries] = useState([]);

    const Contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(Contract);
    const normalizedSourceAddress = normalizeAddress(sourceAddress || quiz_address);
    const currentQuizAddress = normalizeAddress(quiz_address);
    const isCurrentQuizContract = normalizedSourceAddress === currentQuizAddress;
    const isLegacyQuizContract = !isCurrentQuizContract && legacy_quiz_addresses.some((address) => normalizeAddress(address) === normalizedSourceAddress);
    const contractTypeLabel = isCurrentQuizContract ? "現在コントラクト" : isLegacyQuizContract ? "旧コントラクト" : "参照先未判定";
    const resolvedQuizAddress = sourceAddress || quiz_address;

    const convertFullWidthNumbersToHalf = (() => {
        const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
        return (text) => String(text || "").replace(
            /[０-９]/g,
            (m) => String.fromCharCode(m.charCodeAt(0) - diff)
        );
    })();

    const loadStudentSubmissions = async () => {
        setIsLoadingSubmissions(true);
        setLoadError("");
        try {
            const students = await Contract.get_student_list();
            const rows = await Promise.all(
                (Array.isArray(students) ? students : []).map(async (student) => {
                    const [userName] = await Contract.get_user_data(student);
                    const answerDetail = await Contract.get_student_answer_detail(student, id, sourceAddress);
                    return {
                        address: student,
                        name: userName || "",
                        answerText: answerDetail?.answerText || "",
                        submitted: Boolean(answerDetail?.submitted),
                        state: Number(answerDetail?.state || 0),
                        answerTime: Number(answerDetail?.answerTime || 0),
                        reward: Number(answerDetail?.reward || 0),
                        result: Boolean(answerDetail?.result),
                    };
                })
            );

            const nextGradingMap = {};
            rows.forEach((row) => {
                if (row.state === 2) {
                    nextGradingMap[row.address] = "correct";
                } else if (row.state === 1) {
                    nextGradingMap[row.address] = "incorrect";
                } else {
                    nextGradingMap[row.address] = "pending";
                }
            });

            setStudentRows(rows);
            setGradingMap(nextGradingMap);
            return rows;
        } catch (error) {
            console.error(error);
            setLoadError("学生の回答一覧の取得に失敗しました。");
            return [];
        } finally {
            setIsLoadingSubmissions(false);
        }
    };

    const handleExecute = async () => {
        const latestRows = await loadStudentSubmissions();
        const targetRows = Array.isArray(latestRows) && latestRows.length > 0 ? latestRows : studentRows;
        const latestGradingMap = {};
        targetRows.forEach((row) => {
            latestGradingMap[row.address] = gradingMap[row.address] || (row.state === 2 ? "correct" : row.state === 1 ? "incorrect" : "pending");
        });

        const ledgerKeys = new Set(
            (Array.isArray(rewardPayoutEntries) ? rewardPayoutEntries : [])
                .map((e) => `${normalizeAddress(e.sourceAddress)}:${e.quizId}:${normalizeAddress(e.studentAddress)}`)
        );

        const isPending = (row) => 
            isRewardSettlementPending(row) && 
            !ledgerKeys.has(`${normalizeAddress(sourceAddress)}:${id}:${normalizeAddress(row.address)}`);

        const pendingSubmittedRows = targetRows.filter((row) => isPending(row));
        const submittedStudentAddresses = pendingSubmittedRows
            .map((row) => row.address);

        if (gradingMode === "auto" && isNotPayingOut === "false" && !autoAnswer.trim()) {
            alert("自動判定で払い出しを行う場合は正解を入力してください。");
            return;
        }

        const correctStudents = targetRows
            .filter((row) => isPending(row) && latestGradingMap[row.address] === "correct")
            .map((row) => row.address);
        const incorrectStudents = targetRows
            .filter((row) => isPending(row) && latestGradingMap[row.address] === "incorrect")
            .map((row) => row.address);

        if (isNotPayingOut === "false" && pendingSubmittedRows.length === 0) {
            alert("未確定の回答がありません。すでに報酬配布または不正解確定が完了した回答には再送しません。");
            return;
        }

        if (gradingMode === "manual" && isNotPayingOut === "false" && correctStudents.length === 0 && incorrectStudents.length === 0) {
            alert("手動判定で払い出しを行う場合は、少なくとも1件を正解または不正解に判定してください。");
            return;
        }

        const targetStudentCount = gradingMode === "auto"
            ? (submittedStudentAddresses.length || targetRows.length)
            : targetRows.length;
        const payoutActionLabel = isNotPayingOut === "false" ? "報酬配布あり" : "報酬配布なし";
        const gradingModeLabel = gradingMode === "auto" ? "自動判定" : "手動判定";
        const confirmationMessage = [
            `この問題の採点・報酬処理は次の quiz.sol に送信されます。`,
            ``,
            `クイズID: ${id}`,
            `保存先 quiz.sol: ${resolvedQuizAddress}`,
            `契約種別: ${contractTypeLabel}`,
            `判定モード: ${gradingModeLabel}`,
            `実行内容: ${payoutActionLabel}`,
            `対象人数の目安: ${targetStudentCount}人`,
            ``,
            `この内容で続行しますか？`,
        ].join("\n");

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        setIsSubmitting(true);
        try {
            let executionResult = null;
            if (gradingMode === "auto") {
                executionResult = await Contract.investment_to_quiz(
                    id,
                    amount,
                    convertFullWidthNumbersToHalf(autoAnswer),
                    isNotPayingOut,
                    targetStudentCount,
                    isNotAddingReward,
                    submittedStudentAddresses,
                    sourceAddress
                );
            } else if (isNotPayingOut === "true") {
                if (Number(amount || 0) > 0) {
                    await Contract.investment_to_quiz(
                        id,
                        amount,
                        "",
                        "true",
                        targetStudentCount,
                        isNotAddingReward,
                        [],
                        sourceAddress
                    );
                }
            } else {
                executionResult = await Contract.settle_quiz_rewards_manually(
                    id,
                    amount,
                    confirmAnswer,
                    correctStudents,
                    incorrectStudents,
                    isNotAddingReward,
                    sourceAddress
                );
            }
            const refreshedRows = await loadStudentSubmissions();
            if (isNotPayingOut === "false") {
                try {
                    const syncedBefore = await syncRewardPayoutLedgerFromServer().catch(() => []);
                    if (Array.isArray(syncedBefore)) {
                        setRewardPayoutEntries(syncedBefore);
                    }
                    const payoutReceipts = Array.isArray(executionResult?.payoutReceipts) ? executionResult.payoutReceipts : [];
                    const payoutTargets = gradingMode === "auto"
                        ? submittedStudentAddresses
                        : [...correctStudents, ...incorrectStudents];
                    const payoutTxMap = buildChunkTxMap(
                        Array.isArray(executionResult?.payoutChunks) && executionResult.payoutChunks.length > 0
                            ? executionResult.payoutChunks.map((chunk) => (
                                Array.isArray(chunk)
                                    ? chunk
                                    : [...(chunk?.correctStudents || []), ...(chunk?.incorrectStudents || [])]
                            ))
                            : [payoutTargets],
                        payoutReceipts.length > 0
                            ? payoutReceipts
                            : (Array.isArray(executionResult?.payoutHashes)
                                ? executionResult.payoutHashes.map((hash) => ({ transactionHash: hash }))
                                : [])
                    );
                    const rewardEntries = (Array.isArray(refreshedRows) ? refreshedRows : [])
                        .filter((row) => {
                            const normalizedStudent = normalizeAddress(row.address);
                            const wasPaidNow = payoutTxMap.has(normalizedStudent);
                            
                            if (gradingMode === "auto") {
                                return submittedStudentAddresses.includes(row.address) && ([1, 2].includes(Number(row.state || 0)) || wasPaidNow);
                            }
                            return (correctStudents.includes(row.address) || incorrectStudents.includes(row.address))
                                && ([1, 2].includes(Number(row.state || 0)) || wasPaidNow);
                        })
                        .map((row) => {
                            const normalizedStudent = normalizeAddress(row.address);
                            const wasPaidNow = payoutTxMap.has(normalizedStudent);
                            const manualDecision = latestGradingMap[row.address];
                            const isAutoCorrect = gradingMode === "auto" && row.answerText === convertFullWidthNumbersToHalf(autoAnswer);
                            
                            const resultState = row.state === 2 || (gradingMode === "manual" && manualDecision === "correct") || (wasPaidNow && gradingMode === "auto" && isAutoCorrect)
                                ? "correct"
                                : row.state === 1 || (gradingMode === "manual" && manualDecision === "incorrect") || (wasPaidNow && gradingMode === "auto" && !isAutoCorrect)
                                    ? "incorrect"
                                    : "pending";
                            
                            let rewardWei = Number(row.reward || 0);
                            if (wasPaidNow && rewardWei === 0 && resultState === "correct") {
                                rewardWei = Math.round(Number(amount || 0) * 10 ** 18);
                            }
                            const rewardTft = rewardWei > 0 ? rewardWei / 10 ** 18 : 0;
                            
                            const txHash = payoutTxMap.get(normalizedStudent)
                                || String(executionResult?.hash2 || "")
                                || "";

                            return {
                                id: [normalizedSourceAddress, id, normalizedStudent, txHash || new Date().toISOString(), resultState].join(":"),
                                quizId: Number(id),
                                sourceAddress: resolvedQuizAddress,
                                quizTitle,
                                studentAddress: row.address,
                                studentName: row.name || "",
                                answerText: row.answerText || "",
                                resultState,
                                rewardTft,
                                rewardWei: String(rewardWei || 0),
                                txHash,
                                actorAddress: access.address || "",
                                mode: gradingMode,
                                contractTypeLabel,
                                paidAt: new Date().toISOString(),
                                confirmed: row.state === 2
                                    ? rewardTft > 0
                                    : row.state === 1,
                            };
                        });
                    if (rewardEntries.length > 0) {
                        await persistRewardPayoutEntriesToServer(rewardEntries);
                        const syncedAfter = await syncRewardPayoutLedgerFromServer().catch(() => []);
                        if (Array.isArray(syncedAfter)) {
                            setRewardPayoutEntries(syncedAfter);
                        }
                    }
                } catch (ledgerError) {
                    console.error("Failed to persist reward payout ledger", ledgerError);
                }
            }
            setExecutionSummary({
                executedAt: new Date().toISOString(),
                gradingMode,
                rewardAmount: Number(amount || 0),
                correctCount,
                incorrectCount,
                submittedCount,
                targetQuizAddress: resolvedQuizAddress,
                contractTypeLabel,
                approvalTx: executionResult?.res?.transactionHash || executionResult?.res?.hash || "",
                approvalStatus: executionResult?.res?.status || "",
                payoutTxs: Array.isArray(executionResult?.payoutReceipts)
                    ? executionResult.payoutReceipts.map((item) => ({
                        hash: item?.transactionHash || item?.hash || "",
                        status: item?.status || "",
                    })).filter((item) => item.hash)
                    : [],
                bonusTx: executionResult?.hash || "",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        loadStudentSubmissions();
        // quiz id changes when another quiz is selected.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, sourceAddress]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const syncedEntries = await syncRewardPayoutLedgerFromServer();
                if (mounted && Array.isArray(syncedEntries)) {
                    setRewardPayoutEntries(syncedEntries);
                }
            } catch (error) {
                console.error(error);
            }
            try {
                const quiz = await Contract.get_quiz_simple(id, sourceAddress);
                if (!mounted) return;
                setQuizTitle(String(quiz?.[2] || `問題 ${id}`));
            } catch (error) {
                if (!mounted) return;
                setQuizTitle(`問題 ${id}`);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [Contract, id, sourceAddress]);

    if (access.isLoading) {
        return <div className="investment-page">権限を確認中です...</div>;
    }

    if (!access.isTeacher) {
        return (<div className="investment-page">この画面は教員・TAのみ利用できます。</div>);
    }

    const submittedCount = studentRows.filter((row) => row.submitted).length;
    const correctCount = studentRows.filter((row) => gradingMap[row.address] === "correct").length;
    const incorrectCount = studentRows.filter((row) => gradingMap[row.address] === "incorrect").length;

    return (
        <div className="investment-page">
            <div className="page-header">
                <h1 className="page-title">💰 採点と報酬管理</h1>
                <p className="page-subtitle">自動判定と手動判定のどちらでも、採点結果に応じて報酬を支払えます</p>
            </div>

            <div className="investment-card">
                <div className="quiz-id-badge">📋 クイズID: {id}</div>

                <div className="glass-card" style={{ padding: "16px", marginBottom: "20px", display: "grid", gap: "8px", color: "#fff" }}>
                    <div style={{ fontWeight: 700 }}>この問題の保存先 quiz.sol</div>
                    <div style={{ wordBreak: "break-all", color: "#ffd27d" }}>{resolvedQuizAddress}</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span className="quiz-indicator" style={{ background: isCurrentQuizContract ? "rgba(76, 175, 80, 0.22)" : "rgba(255, 193, 7, 0.18)", color: "#fff" }}>
                            {contractTypeLabel}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px" }}>
                            報酬配布と追加預託はこの quiz.sol アドレスに対して実行されます。
                        </span>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">判定モード</div>
                    <div className="invest-section-desc">これまでの自動判定も残しつつ、教員による手動判定も使えます</div>
                    <div className="radio-group">
                        <label className={`radio-option ${gradingMode === "manual" ? "selected" : ""}`}>
                            <input type="radio" value="manual" checked={gradingMode === "manual"} onChange={() => setGradingMode("manual")} />
                            ✍ 手動で採点する
                        </label>
                        <label className={`radio-option ${gradingMode === "auto" ? "selected" : ""}`}>
                            <input type="radio" value="auto" checked={gradingMode === "auto"} onChange={() => setGradingMode("auto")} />
                            ⚙ 正解文字列で自動判定する
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">追加預託する報酬額（必要な場合のみ）</div>
                    <div className="invest-section-desc">通常は問題作成時に登録された報酬額で配布します。ここは報酬原資が不足する場合だけ追加してください。</div>
                    <input
                        type="text"
                        className="form-control"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="追加で預けるTFTを入力（未入力なら 0）"
                    />
                    <div className="token-info">
                        <div className="token-info-item">
                            <div className="token-info-label">回答済み学生</div>
                            <div className="token-info-value">{submittedCount}人</div>
                        </div>
                        <div className="token-info-item">
                            <div className="token-info-label">手動で正解判定</div>
                            <div className="token-info-value">{correctCount}人</div>
                        </div>
                        <div className="token-info-item">
                            <div className="token-info-label">手動で不正解判定</div>
                            <div className="token-info-value">{incorrectCount}人</div>
                        </div>
                    </div>
                </div>

                {gradingMode === "auto" ? (
                    <div className="invest-section">
                        <div className="invest-section-title">自動判定用の正解</div>
                        <div className="invest-section-desc">入力した正解と学生の回答を自動照合して、正解者へ報酬を支払います</div>
                        <input
                            type="text"
                            className="form-control"
                            value={autoAnswer}
                            onChange={(event) => setAutoAnswer(event.target.value)}
                            placeholder="正解を入力"
                        />
                    </div>
                ) : (
                    <div className="invest-section">
                        <div className="invest-section-title">手動採点メモ</div>
                        <div className="invest-section-desc">採点後に記録しておきたい正解やメモがあれば入力してください</div>
                        <input
                            type="text"
                            className="form-control"
                            value={confirmAnswer}
                            onChange={(event) => setConfirmAnswer(event.target.value)}
                            placeholder="例: 教員判定済み / 正解は別紙参照"
                        />
                    </div>
                )}

                <div className="invest-section">
                    <div className="invest-section-title">報酬の払い出し</div>
                    <div className="invest-section-desc">採点だけ行うか、このまま報酬まで払い出すかを選択してください</div>
                    <div className="radio-group">
                        <label className={`radio-option ${isNotPayingOut === "true" ? "selected" : ""}`}>
                            <input type="radio" value="true" onChange={(event) => setIsNotPayingOut(event.target.value)} checked={isNotPayingOut === "true"} />
                            ⏳ まだ報酬の払い出しを行わない
                        </label>
                        <label className={`radio-option ${isNotPayingOut === "false" ? "selected" : ""}`}>
                            <input type="radio" value="false" onChange={(event) => setIsNotPayingOut(event.target.value)} checked={isNotPayingOut === "false"} />
                            ✅ 採点結果を確定して報酬を払い出す
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">発表者ボーナス</div>
                    <div className="invest-section-desc">必要なら出題者への追加報酬もこの画面から実行できます</div>
                    <div className="radio-group">
                        <label className={`radio-option ${isNotAddingReward === "true" ? "selected" : ""}`}>
                            <input type="radio" value="true" onChange={(event) => setIsNotAddingReward(event.target.value)} checked={isNotAddingReward === "true"} />
                            ❌ 発表者ボーナスは追加しない
                        </label>
                        <label className={`radio-option ${isNotAddingReward === "false" ? "selected" : ""}`}>
                            <input type="radio" value="false" onChange={(event) => setIsNotAddingReward(event.target.value)} checked={isNotAddingReward === "false"} />
                            🎤 発表者ボーナスを追加する
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">学生ごとの回答一覧</div>
                    <div className="invest-section-desc">手動判定では、この一覧で学生ごとに正解・不正解を付けられます</div>

                    {isLoadingSubmissions ? (
                        <div style={{ color: "white" }}>回答一覧を読み込み中です...</div>
                    ) : loadError ? (
                        <div style={{ color: "#ffd2d2" }}>{loadError}</div>
                    ) : (
                        <div style={{ display: "grid", gap: "12px" }}>
                            {studentRows.map((row) => (
                                <div
                                    key={row.address}
                                    className="glass-card"
                                    style={{ padding: "16px", display: "grid", gap: "10px" }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                        <div>
                                            <div style={{ color: "#fff", fontWeight: 700 }}>
                                                {row.name || "ユーザー未設定"}
                                            </div>
                                            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px", wordBreak: "break-all" }}>
                                                {row.address}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
                                                {formatAnswerState(row.state)}
                                            </span>
                                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
                                                {GRADE_LABEL[gradingMap[row.address] || "pending"]}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ color: "#fff", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {row.submitted ? (row.answerText || "回答内容を取得できませんでした。") : "まだ回答していません。"}
                                    </div>

                                    {gradingMode === "manual" ? (
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "correct" }))}
                                            >
                                                正解にする
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "incorrect" }))}
                                            >
                                                不正解にする
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "pending" }))}
                                            >
                                                判定を保留
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="invest-submit-area">
                    <button className="btn-invest-submit" onClick={handleExecute} disabled={isSubmitting}>
                        {isSubmitting ? "処理中..." : "🚀 採点結果を反映する"}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => navigate("/edit_list")} style={{ marginLeft: "12px" }}>
                        一覧へ戻る
                    </button>
                </div>

                {executionSummary && (
                    <div className="invest-section">
                        <div className="invest-section-title">反映結果の確認</div>
                        <div className="invest-section-desc">採点結果と報酬反映の結果をその場で確認できます</div>
                        <div className="glass-card" style={{ padding: "16px", display: "grid", gap: "10px", color: "#fff" }}>
                            <div>実行時刻: {new Date(executionSummary.executedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</div>
                            <div>送金先 quiz.sol: {executionSummary.targetQuizAddress}</div>
                            <div>契約種別: {executionSummary.contractTypeLabel}</div>
                            <div>判定モード: {executionSummary.gradingMode === "auto" ? "自動判定" : "手動判定"}</div>
                            <div>報酬額: {executionSummary.rewardAmount} TFT / 人</div>
                            <div>正解: {executionSummary.correctCount}人 / 不正解: {executionSummary.incorrectCount}人 / 回答済み: {executionSummary.submittedCount}人</div>
                            {executionSummary.approvalTx && (
                                <div>
                                    承認・準備Tx:
                                    {" "}
                                    <a href={`https://explorer-test.avax.network/c-chain/tx/${executionSummary.approvalTx}`} target="_blank" rel="noreferrer">
                                        {formatTxHash(executionSummary.approvalTx)}
                                    </a>
                                    {" "}
                                    ({executionSummary.approvalStatus === "success" ? "成功" : executionSummary.approvalStatus || "確認待ち"})
                                </div>
                            )}
                            {executionSummary.payoutTxs.length > 0 && (
                                <div>
                                    報酬反映Tx:
                                    <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                                        {executionSummary.payoutTxs.map((item) => (
                                            <a key={item.hash} href={`https://explorer-test.avax.network/c-chain/tx/${item.hash}`} target="_blank" rel="noreferrer">
                                                {formatTxHash(item.hash)} ({item.status === "success" ? "成功" : item.status || "確認待ち"})
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {executionSummary.bonusTx && (
                                <div>
                                    発表者ボーナスTx:
                                    {" "}
                                    <a href={`https://explorer-test.avax.network/c-chain/tx/${executionSummary.bonusTx}`} target="_blank" rel="noreferrer">
                                        {formatTxHash(executionSummary.bonusTx)}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Investment_to_quiz;
