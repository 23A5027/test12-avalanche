import React, { useEffect, useMemo, useState } from "react";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { legacy_quiz_addresses, quiz_address } from "../../../contract/config";
import { keccak256, toHex, encodePacked } from "viem";
import { getMergedActivityLogs, syncSharedActivityLogs } from "../../../utils/activityLog";
import { getRewardPayoutEntries, syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";

const AMOY_EXPLORER_TX_BASE = "https://explorer-test.avax.network/c-chain/tx/";
const UI_YIELD_MS = 0;

export function buildExplorerTxUrl(txHash) {
    return txHash ? `${AMOY_EXPLORER_TX_BASE}${txHash}` : "";
}

export function buildAnswerExportRows(answers = [], selectedQuiz = null, selectedQuizTitle = "") {
    return (answers || []).map((item, index) => ({
        no: index + 1,
        quizId: selectedQuiz ? selectedQuiz.split(":").slice(-1)[0] : "",
        quizTitle: selectedQuizTitle || "",
        sourceAddress: item.sourceAddress || (selectedQuiz ? selectedQuiz.split(":").slice(0, -1).join(":") : ""),
        walletAddress: item.address || "",
        answer: item.answer || "未回答",
        answerHash: item.hash || "",
        submitted: item.submitted ? "true" : "false",
        state: Number(item.state || 0),
        answerTime: Number(item.answerTime || 0),
        attemptCount: Number(item.attemptCount || 0),
        rewardTft: Number(item.reward || 0) / 10 ** 18,
        txHash: item.txHash || "",
        txUrl: buildExplorerTxUrl(item.txHash || ""),
        verificationStatus: item.verificationStatus || "",
    }));
}

export function buildRewardPayoutExportRows(entries = []) {
    return entries.map((entry) => ({
        quizId: entry.quizId,
        quizTitle: entry.quizTitle,
        walletAddress: entry.studentAddress,
        studentName: entry.studentName || "",
        result: entry.resultState,
        rewardTft: entry.rewardTft,
        txHash: entry.txHash || "",
        txUrl: buildExplorerTxUrl(entry.txHash || ""),
        paidAt: entry.paidAt,
        mode: entry.mode,
        contract: entry.contractTypeLabel,
        confirmed: entry.confirmed !== false ? "true" : "false",
    }));
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeCsv(value) {
    const normalized = String(value ?? "");
    if (!/[",\n]/.test(normalized)) return normalized;
    return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function yieldToUi() {
    return new Promise((resolve) => {
        setTimeout(resolve, UI_YIELD_MS);
    });
}

async function runChunked(items, chunkSize, mapper) {
    const safeChunkSize = Math.max(1, Number(chunkSize || 1));
    const results = [];
    for (let index = 0; index < items.length; index += safeChunkSize) {
        const chunk = items.slice(index, index + safeChunkSize);
        const chunkResults = await Promise.all(chunk.map((item, chunkIndex) => mapper(item, index + chunkIndex)));
        results.push(...chunkResults);
    }
    return results;
}

function buildAnswerLogKey(address = "", quizId = "", sourceAddress = "") {
    return `${normalizeAddress(address)}:${String(sourceAddress || "").toLowerCase()}:${String(quizId)}`;
}

/**
 * 回答ハッシュ(bytes32)から、選択肢リスト(answer_data)を照合して元の回答文字列を復元する。
 * スマートコントラクト側では keccak256(abi.encodePacked(_answer)) でハッシュを保存しているため、
 * 同じ方式でハッシュを生成して照合する。
 */
function decodeAnswerHash(hash, answerOptions) {
    // ハッシュが空(0x000...000)の場合は未回答
    if (!hash || hash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        return "";
    }

    // 各選択肢のハッシュを生成して照合
    for (const option of answerOptions) {
        const trimmed = option.trim();
        if (!trimmed) continue;
        try {
            const optionHash = keccak256(encodePacked(["string"], [trimmed]));
            if (optionHash === hash) {
                return trimmed;
            }
        } catch (e) {
            // ignore
        }
    }

    // 記述式の場合はハッシュの先頭8文字を表示
    return `(ハッシュ: ${hash.slice(0, 10)}…)`;
}

function View_answers() {
    const contract = new Contracts_MetaMask();

    const [quizCount, setQuizCount] = useState(0);
    const [selectedQuiz, setSelectedQuiz] = useState(null);
    const [quizList, setQuizList] = useState([]);
    const [answers, setAnswers] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingAnswers, setLoadingAnswers] = useState(false);
    const [exportingAllAnswers, setExportingAllAnswers] = useState(false);
    const [allAnswerExportStatus, setAllAnswerExportStatus] = useState("");
    const [sharedLogs, setSharedLogs] = useState(() => getMergedActivityLogs());
    const [rewardPayoutEntries, setRewardPayoutEntries] = useState(() => getRewardPayoutEntries());

    useEffect(() => {
        let mounted = true;

        const refreshLogs = async () => {
            let merged = getMergedActivityLogs();
            let payoutLedger = getRewardPayoutEntries();
            try {
                const nextMerged = await syncSharedActivityLogs();
                if (Array.isArray(nextMerged)) {
                    merged = nextMerged;
                }
            } catch (error) {
                console.error("Failed to sync shared activity logs", error);
            }
            try {
                const nextPayoutLedger = await syncRewardPayoutLedgerFromServer();
                if (Array.isArray(nextPayoutLedger)) {
                    payoutLedger = nextPayoutLedger;
                }
            } catch (error) {
                console.error("Failed to sync reward payout ledger", error);
            }
            if (!mounted) return;
            setSharedLogs(Array.isArray(merged) ? merged : getMergedActivityLogs());
            setRewardPayoutEntries(Array.isArray(payoutLedger) ? payoutLedger : getRewardPayoutEntries());
        };

        const handleSharedUpdate = () => {
            setSharedLogs(getMergedActivityLogs());
        };

        refreshLogs();
        window.addEventListener("activity-logs-shared-updated", handleSharedUpdate);
        window.addEventListener("storage", handleSharedUpdate);
        return () => {
            mounted = false;
            window.removeEventListener("activity-logs-shared-updated", handleSharedUpdate);
            window.removeEventListener("storage", handleSharedUpdate);
        };
    }, []);

    const answerLogMap = useMemo(() => {
        const map = new Map();
        (Array.isArray(sharedLogs) ? sharedLogs : [])
            .filter((log) => log?.action === "answer_submitted")
            .forEach((log) => {
                const key = buildAnswerLogKey(log.address || log.actor || "", log.quizId || "", log.sourceAddress || "");
                if (!key || map.has(key)) return;
                map.set(key, log);
            });
        return map;
    }, [sharedLogs]);

    const selectedQuizTitle = useMemo(() => {
        const selectedRef = quizList.find((item) => `${item.sourceAddress || ""}:${item.id}` === selectedQuiz);
        if (!selectedRef) return "";
        return selectedRef.title || `問題 ${selectedRef.id}`;
    }, [quizList, selectedQuiz]);

    const selectedQuizSourceAddress = useMemo(() => {
        const selectedRef = quizList.find((item) => `${item.sourceAddress || ""}:${item.id}` === selectedQuiz);
        return selectedRef?.sourceAddress || "";
    }, [quizList, selectedQuiz]);

    const selectedQuizContractType = useMemo(() => {
        const normalizedSelected = normalizeAddress(selectedQuizSourceAddress || quiz_address);
        if (normalizedSelected === normalizeAddress(quiz_address)) {
            return "現在コントラクト";
        }
        if (legacy_quiz_addresses.some((address) => normalizeAddress(address) === normalizedSelected)) {
            return "旧コントラクト";
        }
        return "参照先未判定";
    }, [selectedQuizSourceAddress]);

    const selectedQuizRewardPayoutEntries = useMemo(() => {
        const quizId = selectedQuiz ? Number(selectedQuiz.split(":").slice(-1)[0]) : null;
        return (Array.isArray(rewardPayoutEntries) ? rewardPayoutEntries : []).filter((entry) => {
            if (quizId != null && Number(entry.quizId) !== quizId) return false;
            if (selectedQuizSourceAddress && normalizeAddress(entry.sourceAddress) !== normalizeAddress(selectedQuizSourceAddress)) return false;
            return true;
        });
    }, [rewardPayoutEntries, selectedQuiz, selectedQuizSourceAddress]);

    const latestRewardPayoutByStudent = useMemo(() => {
        const map = new Map();
        selectedQuizRewardPayoutEntries.forEach((entry) => {
            const key = normalizeAddress(entry.studentAddress);
            if (!key || map.has(key)) return;
            map.set(key, entry);
        });
        return map;
    }, [selectedQuizRewardPayoutEntries]);

    const exportAnswerRows = useMemo(
        () => buildAnswerExportRows(answers || [], selectedQuiz, selectedQuizTitle),
        [answers, selectedQuiz, selectedQuizTitle]
    );

    const exportRewardPayoutRows = useMemo(
        () => buildRewardPayoutExportRows(selectedQuizRewardPayoutEntries),
        [selectedQuizRewardPayoutEntries]
    );

    const handleExportAnswersJson = () => {
        downloadTextFile(
            `answers_${selectedQuizTitle || "quiz"}.json`,
            JSON.stringify(exportAnswerRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const handleExportAnswersCsv = () => {
        const rows = [
            ["No", "Quiz ID", "Quiz Title", "Source Address", "Wallet Address", "Answer", "Answer Hash", "Submitted", "State", "Answer Time", "Attempt Count", "Reward TFT", "Tx Hash", "Tx URL", "Verification Status"],
            ...exportAnswerRows.map((row) => [
                row.no,
                row.quizId,
                row.quizTitle,
                row.sourceAddress,
                row.walletAddress,
                row.answer,
                row.answerHash,
                row.submitted,
                row.state,
                row.answerTime,
                row.attemptCount,
                row.rewardTft,
                row.txHash,
                row.txUrl,
                row.verificationStatus,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
        downloadTextFile(
            `answers_${selectedQuizTitle || "quiz"}.csv`,
            csv,
            "text/csv;charset=utf-8"
        );
    };

    const collectAllAnswerExportRows = async () => {
        const students = await contract.get_student_list();
        const latestAnswerLogs = (getMergedActivityLogs() || [])
            .filter((log) => log?.action === "answer_submitted")
            .reduce((map, log) => {
                const key = buildAnswerLogKey(log.address || log.actor || "", log.quizId || "", log.sourceAddress || "");
                if (!key || map.has(key)) return map;
                map.set(key, log);
                return map;
            }, new Map());

        const rows = [];
        const quizzes = Array.isArray(quizList) ? quizList : [];
        for (let quizIndex = 0; quizIndex < quizzes.length; quizIndex += 1) {
            const quizRef = quizzes[quizIndex];
            const quizId = Number(quizRef?.id || 0);
            const sourceAddress = quizRef?.sourceAddress || "";
            const quizTitle = quizRef?.title || `問題 ${quizId}`;
            setAllAnswerExportStatus(`回答一覧を集計中... ${quizIndex + 1}/${quizzes.length} 問`);
            await yieldToUi();
            const quizData = await contract.get_quiz(quizId, sourceAddress).catch(() => null);
            const answerData = quizData?.[6] || "";
            const answerOptions = String(answerData).split(",");
            const answerType = Number(quizData?.[13] || 0);
            const answerMap = await contract.get_students_answer_hash_list(students, quizId, sourceAddress).catch(() => ({}));

            const perStudent = await runChunked(Array.isArray(students) ? students : [], 8, async (student) => {
                const hash = answerMap?.[student];
                const detail = await contract.get_student_answer_detail(student, quizId, sourceAddress).catch(() => null);
                const submitted = Boolean(detail?.submitted);
                let decodedAnswer = String(detail?.answerText || "").trim();

                if (!decodedAnswer && answerType === 0) {
                    decodedAnswer = decodeAnswerHash(hash, answerOptions);
                } else if (!decodedAnswer && hash && hash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                    decodedAnswer = `(ハッシュ: ${hash.slice(0, 10)}…)`;
                }

                if (!decodedAnswer && submitted) {
                    decodedAnswer = "(回答済み)";
                }

                const answerLog = answerLogMap.get(buildAnswerLogKey(student, quizId, sourceAddress))
                    || latestAnswerLogs.get(buildAnswerLogKey(student, quizId, sourceAddress))
                    || [...latestAnswerLogs.values()].find((log) =>
                        normalizeAddress(log.address || log.actor || "") === normalizeAddress(student)
                        && String(log.quizId || "") === String(quizId)
                    );

                return {
                    address: student,
                    sourceAddress,
                    answer: decodedAnswer,
                    hash: hash || "",
                    state: Number(detail?.state || 0),
                    reward: Number(detail?.reward || 0),
                    submitted,
                    answerTime: Number(detail?.answerTime || 0),
                    attemptCount: Number(detail?.attemptCount || 0),
                    txHash: String(answerLog?.txHash || ""),
                    verificationStatus: String(answerLog?.verificationStatus || (submitted ? "onchain_submitted" : "")),
                };
            });

            rows.push(...buildAnswerExportRows(perStudent, `${sourceAddress}:${quizId}`, quizTitle));
            await yieldToUi();
        }

        return rows;
    };

    const handleExportAllAnswersJson = async () => {
        setExportingAllAnswers(true);
        setAllAnswerExportStatus("全問題の回答一覧を準備中...");
        try {
            const allRows = await collectAllAnswerExportRows();
            downloadTextFile(
                "all_quiz_answers.json",
                JSON.stringify(allRows, null, 2),
                "application/json;charset=utf-8"
            );
            setAllAnswerExportStatus(`JSON を出力しました（${allRows.length}件）`);
        } finally {
            setExportingAllAnswers(false);
        }
    };

    const handleExportAllAnswersCsv = async () => {
        setExportingAllAnswers(true);
        setAllAnswerExportStatus("全問題の回答一覧を準備中...");
        try {
            const allRows = await collectAllAnswerExportRows();
            const rows = [
                ["No", "Quiz ID", "Quiz Title", "Source Address", "Wallet Address", "Answer", "Answer Hash", "Submitted", "State", "Answer Time", "Attempt Count", "Reward TFT", "Tx Hash", "Tx URL", "Verification Status"],
                ...allRows.map((row) => [
                    row.no,
                    row.quizId,
                    row.quizTitle,
                    row.sourceAddress,
                    row.walletAddress,
                    row.answer,
                    row.answerHash,
                    row.submitted,
                    row.state,
                    row.answerTime,
                    row.attemptCount,
                    row.rewardTft,
                    row.txHash,
                    row.txUrl,
                    row.verificationStatus,
                ]),
            ];
            const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
            downloadTextFile(
                "all_quiz_answers.csv",
                csv,
                "text/csv;charset=utf-8"
            );
            setAllAnswerExportStatus(`CSV を出力しました（${allRows.length}件）`);
        } finally {
            setExportingAllAnswers(false);
        }
    };

    const handleExportRewardPayoutJson = () => {
        downloadTextFile(
            `reward_payouts_${selectedQuizTitle || "quiz"}.json`,
            JSON.stringify(exportRewardPayoutRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const handleExportRewardPayoutCsv = () => {
        const rows = [
            ["Quiz ID", "Quiz Title", "Wallet Address", "Student Name", "Result", "Reward TFT", "Tx Hash", "Tx URL", "Paid At", "Mode", "Contract", "Confirmed"],
            ...exportRewardPayoutRows.map((entry) => [
                entry.quizId,
                entry.quizTitle,
                entry.walletAddress,
                entry.studentName,
                entry.result,
                entry.rewardTft,
                entry.txHash,
                entry.txUrl,
                entry.paidAt,
                entry.mode,
                entry.contract,
                entry.confirmed,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
        downloadTextFile(
            `reward_payouts_${selectedQuizTitle || "quiz"}.csv`,
            csv,
            "text/csv;charset=utf-8"
        );
    };

    // クイズ一覧を取得
    useEffect(() => {
        async function fetchQuizList() {
            try {
                const list = await contract.get_all_quiz_simple_list();
                const normalized = (Array.isArray(list) ? list : []).map((q) => ({
                    id: Number(q?.[0] || 0),
                    title: q?.[2] || `問題 ${q?.[0] || 0}`,
                    respondents: Number(q?.[8]) || 0,
                    sourceAddress: q?.sourceAddress || q?.[12] || "",
                }));
                setQuizCount(normalized.length);
                setQuizList(normalized);
            } catch (e) {
                console.error("Failed to fetch quiz list", e);
            } finally {
                setLoading(false);
            }
        }
        fetchQuizList();
    }, []);

    // 選択されたクイズの回答一覧を取得
    const fetchAnswers = async (quizRef) => {
        const quizId = Number(quizRef?.id || 0);
        const sourceAddress = quizRef?.sourceAddress || "";
        setSelectedQuiz(`${sourceAddress}:${quizId}`);
        setLoadingAnswers(true);
        setAnswers(null);
        try {
            // クイズの詳細を取得（選択肢データ answer_data を含む）
            const quizData = await contract.get_quiz(quizId, sourceAddress);
            // get_quiz の返り値: [id, owner, title, explanation, thumbnail_url, content, answer_data, ...]
            const answerData = quizData[6] || ""; // answer_data (カンマ区切りの選択肢)
            const answerOptions = answerData.split(",");
            const answerType = Number(quizData[13]); // answer_type: 0=選択式, 1=記述式
            const rewardTft = Number(quizData[10] || 0) / 10 ** 18;

            const latestAnswerLogs = (getMergedActivityLogs() || [])
                .filter((log) => log?.action === "answer_submitted")
                .reduce((map, log) => {
                    const key = buildAnswerLogKey(log.address || log.actor || "", log.quizId || "", log.sourceAddress || "");
                    if (!key || map.has(key)) return map;
                    map.set(key, log);
                    return map;
                }, new Map());

            // 生徒一覧を取得
            const students = await contract.get_student_list();
            if (students && students.length > 0) {
                // 各生徒の回答ハッシュを取得
                const answerMap = await contract.get_students_answer_hash_list(students, quizId, sourceAddress);
                
                const result = [];
                for (const student of students) {
                    const hash = answerMap[student];
                    const detail = await contract.get_student_answer_detail(student, quizId, sourceAddress);
                    const submitted = Boolean(detail?.submitted);
                    let decodedAnswer = String(detail?.answerText || "").trim();

                    if (!decodedAnswer && answerType === 0) {
                        // 選択式: ハッシュを選択肢と照合
                        decodedAnswer = decodeAnswerHash(hash, answerOptions);
                    } else if (!decodedAnswer) {
                        // 記述式: ハッシュのみ表示（復元不可能）
                        if (hash && hash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                            decodedAnswer = `(ハッシュ: ${hash.slice(0, 10)}…)`;
                        }
                    }

                    if (!decodedAnswer && submitted) {
                        decodedAnswer = "(回答済み)";
                    }

                    const answerLog = answerLogMap.get(buildAnswerLogKey(student, quizId, sourceAddress))
                        || latestAnswerLogs.get(buildAnswerLogKey(student, quizId, sourceAddress))
                        || [...latestAnswerLogs.values()].find((log) =>
                            normalizeAddress(log.address || log.actor || "") === normalizeAddress(student)
                            && String(log.quizId || "") === String(quizId)
                        );
                    const txHash = String(answerLog?.txHash || "");
                    const verificationStatus = String(answerLog?.verificationStatus || (submitted ? "onchain_submitted" : ""));

                    result.push({
                        address: student,
                        answer: decodedAnswer,
                        hash: hash,
                        state: Number(detail?.state || 0),
                        reward: Number(detail?.reward || 0),
                        result: Boolean(detail?.result),
                        submitted,
                        answerTime: Number(detail?.answerTime || 0),
                        attemptCount: Number(detail?.attemptCount || 0),
                        rewardPreviewTft: Number(detail?.attemptCount || 0) > 1 ? rewardTft / 2 : rewardTft,
                        txHash,
                        verificationStatus,
                    });
                }
                setAnswers(result);
            } else {
                setAnswers([]);
            }
        } catch (e) {
            console.error("Failed to fetch answers", e);
            setAnswers([]);
        } finally {
            setLoadingAnswers(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.7)" }}>
                <div className="skeleton skeleton-card" style={{ height: "200px" }}></div>
            </div>
        );
    }

    return (
        <div>
            <h3 className="section-title">📋 問題別 回答一覧</h3>
            <p className="section-desc">各問題に対するユーザーの回答を確認できます（選択式は回答を復元、記述式はハッシュを表示）</p>

            {/* Quiz Selector */}
            <div style={{ marginBottom: "var(--space-6)" }}>
                <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                    <button className="btn-action" onClick={handleExportAllAnswersCsv} disabled={exportingAllAnswers || loading}>
                        {exportingAllAnswers ? "集計中..." : "📤 全問題の回答一覧を CSV 出力"}
                    </button>
                    <button className="btn-action" onClick={handleExportAllAnswersJson} disabled={exportingAllAnswers || loading}>
                        📤 全問題の回答一覧を JSON 出力
                    </button>
                </div>
                {allAnswerExportStatus ? (
                    <div className="section-desc" style={{ marginTop: "-4px", marginBottom: "12px", color: "#d5e2ff" }}>
                        {allAnswerExportStatus}
                    </div>
                ) : null}
                <label style={{ color: "#ffffff", fontWeight: "600", display: "block", marginBottom: "var(--space-2)" }}>
                    問題を選択してください（全 {quizCount} 問）
                </label>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "var(--space-3)",
                    maxHeight: "300px",
                    overflowY: "auto",
                    padding: "var(--space-2)"
                }}>
                    {quizList.map((q) => (
                        <button
                            key={`${q.sourceAddress || "default"}-${q.id}`}
                            onClick={() => fetchAnswers(q)}
                            style={{
                                padding: "12px 16px",
                                borderRadius: "var(--radius-sm)",
                                border: selectedQuiz === `${q.sourceAddress || ""}:${q.id}` ? "2px solid var(--accent-blue)" : "1px solid rgba(255,255,255,0.15)",
                                background: selectedQuiz === `${q.sourceAddress || ""}:${q.id}` ? "rgba(30, 136, 229, 0.2)" : "rgba(255,255,255,0.05)",
                                color: "#ffffff",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.2s ease",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <span style={{ fontWeight: "500", fontSize: "14px" }}>
                                #{q.id} {String(q.title || "").length > 20 ? String(q.title || "").slice(0, 20) + "…" : String(q.title || "")}
                            </span>
                            <span style={{
                                fontSize: "12px",
                                background: "rgba(255,255,255,0.1)",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                color: "rgba(255,255,255,0.7)"
                            }}>
                                {q.respondents}人回答
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Answer Table */}
            {selectedQuiz !== null && (
                <div>
                    <h4 style={{ color: "#ffffff", fontWeight: "600", marginBottom: "var(--space-3)" }}>
                        📝 {selectedQuizTitle ? `${selectedQuizTitle} の回答一覧` : `問題 ${selectedQuiz || ""} の回答一覧`}
                    </h4>
                    <div
                        className="glass-card"
                        style={{
                            padding: "16px",
                            marginBottom: "16px",
                            display: "grid",
                            gap: "8px",
                            color: "#fff",
                        }}
                    >
                        <div style={{ fontWeight: 700 }}>この問題の保存先 quiz.sol</div>
                        <div style={{ wordBreak: "break-all", color: "#ffd27d" }}>{selectedQuizSourceAddress || quiz_address}</div>
                        <div style={{ color: "rgba(255,255,255,0.78)" }}>契約種別: {selectedQuizContractType}</div>
                    </div>

                    {loadingAnswers ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.6)" }}>
                            読み込み中...
                        </div>
                    ) : answers && answers.length > 0 ? (
                        <div className="results-table-wrap">
                            <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                                <button className="btn-action" onClick={handleExportAnswersCsv}>📤 回答一覧を CSV 出力</button>
                                <button className="btn-action" onClick={handleExportAnswersJson}>📤 回答一覧を JSON 出力</button>
                                <button className="btn-action" onClick={handleExportRewardPayoutCsv}>📤 回答報酬履歴を CSV 出力</button>
                                <button className="btn-action" onClick={handleExportRewardPayoutJson}>📤 回答報酬履歴を JSON 出力</button>
                            </div>
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: "50px" }}>#</th>
                                        <th>ウォレットアドレス</th>
                                        <th>回答内容</th>
                                        <th>試行回数</th>
                                        <th>保存確認</th>
                                        <th>Tx Hash</th>
                                        <th>判定</th>
                                        <th>報酬</th>
                                        <th>報酬Tx</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {answers.map((item, index) => (
                                        <tr key={index}>
                                            <td>{index + 1}</td>
                                            <td className="address-cell" style={{ fontSize: "13px" }}>
                                                {item.address
                                                    ? item.address.slice(0, 8) + "…" + item.address.slice(-6)
                                                    : "-"}
                                            </td>
                                            <td style={{
                                                color: item.answer ? "#ffffff" : "rgba(255,255,255,0.3)",
                                                fontWeight: item.answer ? "500" : "400",
                                            }}>
                                                {item.answer || "未回答"}
                                            </td>
                                            <td>{item.attemptCount || 0}</td>
                                            <td>
                                                {item.verificationStatus === "receipt_confirmed"
                                                    ? "receipt確認済み"
                                                    : item.verificationStatus === "verified_after_receipt_timeout"
                                                        ? "on-chain再確認済み"
                                                        : item.submitted
                                                            ? "回答保存済み"
                                                            : "-"}
                                            </td>
                                            <td style={{ fontSize: "12px" }}>
                                                {item.txHash
                                                    ? `${item.txHash.slice(0, 10)}…${item.txHash.slice(-8)}`
                                                    : "-"}
                                            </td>
                                            <td>
                                                {item.state === 2 ? "正解" : item.state === 1 ? "不正解" : item.submitted ? "回答済み" : "未回答"}
                                            </td>
                                            <td>
                                                {Number(item.reward || 0) > 0
                                                    ? `${Number(item.reward || 0) / 10 ** 18} TFT`
                                                    : item.attemptCount > 0
                                                        ? `予定 ${item.rewardPreviewTft} TFT`
                                                        : "-"}
                                            </td>
                                            <td style={{ fontSize: "12px" }}>
                                                {latestRewardPayoutByStudent.get(normalizeAddress(item.address))?.txHash
                                                    ? `${latestRewardPayoutByStudent.get(normalizeAddress(item.address)).txHash.slice(0, 10)}…${latestRewardPayoutByStudent.get(normalizeAddress(item.address)).txHash.slice(-8)}`
                                                    : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* 統計サマリー */}
                            <div style={{
                                marginTop: "var(--space-4)",
                                padding: "var(--space-3)",
                                background: "rgba(255,255,255,0.05)",
                                borderRadius: "var(--radius-sm)",
                                display: "flex",
                                gap: "var(--space-6)",
                                color: "rgba(255,255,255,0.8)",
                                fontSize: "14px"
                            }}>
                                <span>👥 全生徒: <strong style={{ color: "#fff" }}>{answers.length}人</strong></span>
                                <span>✅ 回答済: <strong style={{ color: "#4caf50" }}>{answers.filter((a) => a.submitted).length}人</strong></span>
                                <span>⬜ 未回答: <strong style={{ color: "#ff9800" }}>{answers.filter((a) => !a.submitted).length}人</strong></span>
                                <span>🔁 複数回答: <strong style={{ color: "#ffd27d" }}>{answers.filter((a) => Number(a.attemptCount || 0) > 1).length}人</strong></span>
                            </div>

                            <div className="glass-card" style={{ marginTop: "16px", padding: "16px", color: "#fff" }}>
                                <div style={{ fontWeight: 700, marginBottom: "10px" }}>回答報酬の付与履歴</div>
                                {selectedQuizRewardPayoutEntries.length === 0 ? (
                                    <div style={{ color: "rgba(255,255,255,0.72)" }}>この問題の報酬付与履歴はまだありません。</div>
                                ) : (
                                    <div style={{ display: "grid", gap: "10px" }}>
                                        {selectedQuizRewardPayoutEntries.map((entry) => (
                                            <div key={entry.id} style={{ background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>{entry.studentName || entry.studentAddress}</div>
                                                        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px", wordBreak: "break-all" }}>{entry.studentAddress}</div>
                                                    </div>
                                                    <div style={{ textAlign: "right" }}>
                                                        <div>{entry.resultState === "correct" ? "正解報酬" : entry.resultState === "incorrect" ? "不正解確定" : "保留"}</div>
                                                        <div style={{ color: "#ffd27d" }}>{Number(entry.rewardTft || 0)} TFT</div>
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: "8px", color: "rgba(255,255,255,0.82)", fontSize: "13px", display: "grid", gap: "4px" }}>
                                                    <div>実行時刻: {entry.paidAt ? new Date(entry.paidAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "-"}</div>
                                                    <div>判定モード: {entry.mode === "auto" ? "自動判定" : entry.mode === "manual" ? "手動判定" : "-"}</div>
                                                    <div>契約種別: {entry.contractTypeLabel || "-"}</div>
                                                    <div>
                                                        Tx:
                                                        {" "}
                                                        {entry.txHash ? (
                                                            <a href={`https://explorer-test.avax.network/c-chain/tx/${entry.txHash}`} target="_blank" rel="noreferrer">
                                                                {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-8)}
                                                            </a>
                                                        ) : (
                                                            "記録なし"
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.5)" }}>
                            回答データがありません
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default View_answers;
