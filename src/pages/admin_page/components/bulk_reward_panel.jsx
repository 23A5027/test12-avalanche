/* global BigInt */
import React, { useEffect, useMemo, useState } from "react";
import { legacy_quiz_addresses, quiz_address } from "../../../contract/config";
import { getRewardPayoutEntries, persistRewardPayoutEntriesToServer, syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";
import { useAccessControl } from "../../../utils/accessControl";

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

function normalizeAnswerText(value) {
    return String(value || "").trim();
}

function getContractTypeLabel(sourceAddress) {
    const normalizedSource = normalizeAddress(sourceAddress || quiz_address);
    if (normalizedSource === normalizeAddress(quiz_address)) return "現在コントラクト";
    if (legacy_quiz_addresses.some((address) => normalizeAddress(address) === normalizedSource)) return "旧コントラクト";
    return "参照先未判定";
}

function formatTxHash(hash) {
    if (!hash) return "-";
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function Bulk_reward_panel({ cont }) {
    const access = useAccessControl(cont);
    const [students, setStudents] = useState([]);
    const [studentNameMap, setStudentNameMap] = useState({});
    const [quizRows, setQuizRows] = useState([]);
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusText, setStatusText] = useState("");
    const [executionRows, setExecutionRows] = useState([]);
    const [rewardPayoutEntries, setRewardPayoutEntries] = useState(() => getRewardPayoutEntries());

    async function validateRewardPayoutEntries(entries = []) {
        const normalizedEntries = Array.isArray(entries) ? entries : [];
        const uniqueHashes = Array.from(new Set(
            normalizedEntries
                .filter((entry) => entry?.confirmed !== false && entry?.txHash)
                .map((entry) => String(entry.txHash))
        ));

        const txStatusMap = new Map();
        await Promise.all(uniqueHashes.map(async (txHash) => {
            const status = await cont.get_transaction_receipt_status?.(txHash).catch(() => "");
            txStatusMap.set(txHash, String(status || ""));
        }));

        return normalizedEntries.filter((entry) => {
            if (entry?.confirmed === false) return false;
            const txHash = String(entry?.txHash || "");
            if (!txHash) return true;
            return txStatusMap.get(txHash) === "success";
        });
    }

    async function buildQuizRow(quiz, studentAddresses, nextStudentNameMap, confirmedRewardEntries = rewardPayoutEntries) {
        const quizId = Number(quiz?.[0] || 0);
        const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
        const title = String(quiz?.[2] || `問題 ${quizId}`);
        const rewardTft = Number(quiz?.[7] || 0) / 10 ** 18;
        const correctAnswer = await cont.get_revealed_correct_answer(quizId, sourceAddress).catch(() => "");
        const normalizedCorrectAnswer = normalizeAnswerText(correctAnswer);
        const hasCorrectAnswer = normalizedCorrectAnswer.length > 0;

        const details = await Promise.all(
            (Array.isArray(studentAddresses) ? studentAddresses : []).map(async (student) => {
                const detail = await cont.get_student_answer_detail(student, quizId, sourceAddress).catch(() => null);
                const normalizedAnswerText = normalizeAnswerText(detail?.answerText);
                return {
                    address: student,
                    name: nextStudentNameMap[normalizeAddress(student)]?.name || "",
                    submitted: Boolean(detail?.submitted),
                    state: Number(detail?.state || 0),
                    answerText: normalizedAnswerText,
                    reward: Number(detail?.reward || 0),
                    isCorrectByAnswer: hasCorrectAnswer && normalizedAnswerText === normalizedCorrectAnswer,
                };
            })
        );

        const ledgerKeys = new Set(
            (Array.isArray(confirmedRewardEntries) ? confirmedRewardEntries : [])
                .filter((entry) => entry?.confirmed !== false && String(entry?.resultState || "") === "correct")
                .map((e) => `${normalizeAddress(e.sourceAddress)}:${e.quizId}:${normalizeAddress(e.studentAddress)}`)
        );

        const pendingStudents = details.filter((detail) => {
            if (!isRewardSettlementPending(detail)) {
                return false;
            }

            const ledgerPaid = ledgerKeys.has(`${normalizeAddress(sourceAddress)}:${quizId}:${normalizeAddress(detail.address)}`);
            if (ledgerPaid || Number(detail?.reward || 0) > 0) {
                return false;
            }

            if (!hasCorrectAnswer) {
                return true;
            }

            return Boolean(detail?.isCorrectByAnswer);
        });

        const settledStudents = details.filter((detail) => {
            if ([1, 2].includes(Number(detail?.state || 0))) {
                return true;
            }

            const ledgerPaid = ledgerKeys.has(`${normalizeAddress(sourceAddress)}:${quizId}:${normalizeAddress(detail.address)}`);
            if (ledgerPaid || Number(detail?.reward || 0) > 0) {
                return true;
            }

            if (!hasCorrectAnswer || !Boolean(detail?.submitted)) {
                return false;
            }

            return !detail.isCorrectByAnswer;
        });
        return {
            key: `${sourceAddress}:${quizId}`,
            quizId,
            sourceAddress,
            title,
            rewardTft,
            correctAnswer,
            contractTypeLabel: getContractTypeLabel(sourceAddress),
            pendingCount: pendingStudents.length,
            pendingStudents,
            settledCount: settledStudents.length,
            settledStudents,
        };
    }

    const eligibleRows = useMemo(
        () => quizRows.filter((row) => row.pendingStudents.length > 0 && row.correctAnswer),
        [quizRows]
    );
    const completedRows = useMemo(
        () => quizRows.filter((row) => row.pendingCount === 0 && row.settledCount > 0),
        [quizRows]
    );
    const incompleteRows = useMemo(
        () => quizRows.filter((row) => row.pendingCount > 0 || row.settledCount === 0),
        [quizRows]
    );
    const payoutSummaryByQuiz = useMemo(() => {
        const summary = new Map();
        (Array.isArray(rewardPayoutEntries) ? rewardPayoutEntries : []).forEach((entry) => {
            const key = `${normalizeAddress(entry?.sourceAddress || "")}:${Number(entry?.quizId || 0)}`;
            if (!summary.has(key)) {
                summary.set(key, {
                    txHashes: [],
                    txHashSet: new Set(),
                    confirmedCount: 0,
                    payoutCount: 0,
                });
            }
            const current = summary.get(key);
            current.payoutCount += 1;
            if (entry?.confirmed !== false) {
                current.confirmedCount += 1;
            }
            const txHash = String(entry?.txHash || "");
            if (txHash && !current.txHashSet.has(txHash)) {
                current.txHashSet.add(txHash);
                current.txHashes.push(txHash);
            }
        });
        return summary;
    }, [rewardPayoutEntries]);

    function getQuizPayoutSummary(row) {
        return payoutSummaryByQuiz.get(`${normalizeAddress(row?.sourceAddress || "")}:${Number(row?.quizId || 0)}`) || null;
    }

    async function loadStudents() {
        const studentAddresses = await cont.get_student_list().catch(() => []);
        const normalizedStudents = Array.isArray(studentAddresses) ? studentAddresses : [];
        const profileEntries = await Promise.all(
            normalizedStudents.map(async (student, index) => {
                const userData = await cont.get_user_data(student).catch(() => ["", "", 0, false]);
                return [
                    normalizeAddress(student),
                    {
                        name: String(userData?.[0] || ""),
                        studentId: `USER-${String(index + 1).padStart(3, "0")}`,
                    },
                ];
            })
        );
        setStudents(normalizedStudents);
        setStudentNameMap(Object.fromEntries(profileEntries));
        return { students: normalizedStudents, studentNameMap: Object.fromEntries(profileEntries) };
    }

    async function loadQuizzes(studentAddresses = students, nextStudentNameMap = studentNameMap) {
        setIsLoading(true);
        setStatusText("問題と未確定回答を確認中...");
        try {
            const quizList = await cont.get_all_quiz_simple_list().catch(() => []);
            let payoutLedger = getRewardPayoutEntries();
            try {
                const syncedPayoutLedger = await syncRewardPayoutLedgerFromServer();
                if (Array.isArray(syncedPayoutLedger)) {
                    payoutLedger = syncedPayoutLedger;
                }
            } catch (ledgerError) {
                console.error(ledgerError);
            }
            const confirmedPayoutLedger = await validateRewardPayoutEntries(payoutLedger);
            const rows = await Promise.all(
                (Array.isArray(quizList) ? quizList : []).map((quiz) => buildQuizRow(quiz, studentAddresses, nextStudentNameMap, confirmedPayoutLedger))
            );

            setQuizRows(rows);
            setRewardPayoutEntries(confirmedPayoutLedger);
            setSelectedKeys((current) => current.filter((key) => rows.some((row) => row.key === key)));
            setStatusText("");
        } catch (error) {
            console.error(error);
            setStatusText("一括報酬配布対象の読み込みに失敗しました。");
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        let mounted = true;
        (async () => {
            const loaded = await loadStudents();
            if (!mounted) return;
            await loadQuizzes(loaded.students, loaded.studentNameMap);
        })();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function toggleSelection(key) {
        setSelectedKeys((current) => (
            current.includes(key)
                ? current.filter((item) => item !== key)
                : [...current, key]
        ));
    }

    async function executeBatch(targetRows) {
        if (!targetRows.length) {
            alert("一括配布できる問題がありません。");
            return;
        }

        const confirmationMessage = [
            `全 ${targetRows.length} 問に対して、未確定回答だけへ一括で報酬配布します。`,
            `正解が取得できる問題だけを対象にし、すでに確定済みの回答には再送しません。`,
            "",
            ...targetRows.slice(0, 10).map((row) => `#${row.quizId} ${row.title} / 未確定 ${row.pendingCount}件 / ${row.contractTypeLabel}`),
            targetRows.length > 10 ? `...ほか ${targetRows.length - 10} 問` : "",
            "",
            "この内容で続行しますか？",
        ].filter(Boolean).join("\n");

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        setIsSubmitting(true);
        setExecutionRows([]);
        setStatusText("一括報酬配布を実行中...");

        try {
            await syncRewardPayoutLedgerFromServer().catch(() => []);
            const nextExecutionRows = [];

            for (const row of targetRows) {
                try {
                    const refreshedRow = await buildQuizRow(
                        [row.quizId, "", row.title, "", "", 0, 0, BigInt(Math.round(row.rewardTft * 10 ** 18)), 0, 0, 0, false, row.sourceAddress],
                        students,
                        studentNameMap,
                        rewardPayoutEntries
                    );
                    if (refreshedRow.pendingCount === 0) {
                        nextExecutionRows.push({
                            key: row.key,
                            quizId: row.quizId,
                            title: row.title,
                            sourceAddress: row.sourceAddress,
                            contractTypeLabel: row.contractTypeLabel,
                            pendingCount: 0,
                            payoutTxCount: 0,
                            payoutTxHashes: [],
                            status: "skipped_completed",
                        });
                        continue;
                    }

                    setStatusText(`問題 #${row.quizId} を配布中...`);
                    const pendingAddresses = refreshedRow.pendingStudents.map((student) => student.address);
                    const result = await cont.settle_quiz_rewards_auto_existing(
                        refreshedRow.quizId,
                        refreshedRow.correctAnswer,
                        pendingAddresses,
                        refreshedRow.sourceAddress
                    );

                    const refreshedDetails = await Promise.all(
                        pendingAddresses.map(async (studentAddress) => {
                            const detail = await cont.get_student_answer_detail(studentAddress, refreshedRow.quizId, refreshedRow.sourceAddress).catch(() => null);
                            return {
                                address: studentAddress,
                                detail,
                            };
                        })
                    );

                    const payoutTxMap = buildChunkTxMap(
                        Array.isArray(result?.payoutChunks) && result.payoutChunks.length > 0
                            ? result.payoutChunks
                            : [pendingAddresses],
                        Array.isArray(result?.payoutReceipts)
                            ? result.payoutReceipts
                            : (Array.isArray(result?.payoutHashes)
                                ? result.payoutHashes.map((hash) => ({ transactionHash: hash }))
                                : [])
                    );

                    const rewardEntries = refreshedDetails
                        .filter(({ address, detail }) => {
                            const normalizedStudent = normalizeAddress(address);
                            const wasPaidNow = payoutTxMap.has(normalizedStudent);
                            return [1, 2].includes(Number(detail?.state || 0)) || wasPaidNow;
                        })
                        .map(({ address, detail }) => {
                            const normalizedStudent = normalizeAddress(address);
                            const wasPaidNow = payoutTxMap.has(normalizedStudent);
                            const isCorrectAuto = detail?.answerText === refreshedRow.correctAnswer;

                            const state = wasPaidNow 
                                ? (isCorrectAuto ? 2 : 1) 
                                : Number(detail?.state || 0);

                            let rewardWei = Number(detail?.reward || 0);
                            if (wasPaidNow && rewardWei === 0 && state === 2) {
                                rewardWei = Math.round((refreshedRow.rewardTft || 0) * 10 ** 18);
                            }
                            const rewardTft = rewardWei > 0 ? rewardWei / 10 ** 18 : 0;
                            
                            return {
                                id: [normalizeAddress(refreshedRow.sourceAddress), refreshedRow.quizId, normalizedStudent, payoutTxMap.get(normalizedStudent) || new Date().toISOString(), state].join(":"),
                                quizId: refreshedRow.quizId,
                                sourceAddress: refreshedRow.sourceAddress,
                                quizTitle: refreshedRow.title,
                                studentAddress: address,
                                studentName: studentNameMap[normalizedStudent]?.name || "",
                                answerText: String(detail?.answerText || ""),
                                resultState: state === 2 ? "correct" : state === 1 ? "incorrect" : "pending",
                                rewardTft,
                                rewardWei: String(rewardWei || 0),
                                txHash: payoutTxMap.get(normalizeAddress(address)) || "",
                                actorAddress: access.address || "",
                                mode: "bulk_auto",
                                contractTypeLabel: refreshedRow.contractTypeLabel,
                                paidAt: new Date().toISOString(),
                                confirmed: state === 2 ? rewardTft > 0 : state === 1,
                            };
                        });

                    if (rewardEntries.length > 0) {
                        const mergedEntries = await persistRewardPayoutEntriesToServer(rewardEntries);
                        const confirmedEntries = await validateRewardPayoutEntries(Array.isArray(mergedEntries) ? mergedEntries : getRewardPayoutEntries());
                        setRewardPayoutEntries(confirmedEntries);
                    }

                    nextExecutionRows.push({
                        key: row.key,
                        quizId: refreshedRow.quizId,
                        title: refreshedRow.title,
                        sourceAddress: refreshedRow.sourceAddress,
                        contractTypeLabel: refreshedRow.contractTypeLabel,
                        pendingCount: refreshedRow.pendingCount,
                        payoutTxCount: Array.isArray(result?.payoutReceipts) ? result.payoutReceipts.length : 0,
                        payoutTxHashes: Array.isArray(result?.payoutReceipts)
                            ? result.payoutReceipts.map((item) => item?.transactionHash || item?.hash || "").filter(Boolean)
                            : [],
                        status: "success",
                    });
                } catch (error) {
                    console.error(error);
                    nextExecutionRows.push({
                        key: row.key,
                        quizId: row.quizId,
                        title: row.title,
                        sourceAddress: row.sourceAddress,
                        contractTypeLabel: row.contractTypeLabel,
                        pendingCount: row.pendingCount,
                        payoutTxCount: 0,
                        payoutTxHashes: [],
                        status: "failed",
                        error: error?.shortMessage || error?.message || "batch_reward_failed",
                    });
                }
            }

            setExecutionRows(nextExecutionRows);
            await loadQuizzes(students, studentNameMap);
            setStatusText("一括報酬配布が完了しました。");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (access.isLoading) {
        return <div className="admin-not-authorized">権限を確認中です...</div>;
    }

    if (!access.isTeacher) {
        return <div className="admin-not-authorized">この画面は教員アカウント専用です。</div>;
    }

    return (
        <div>
            <h3 className="section-title">💸 全問題一括報酬配布</h3>
            <p className="section-desc">
                正解が取得できて、未確定回答が残っている問題だけをまとめて自動配布します。すでに確定済みの回答には再送しません。
            </p>

            <div className="token-grant-card">
                <div className="token-grant-card-title">一括配布対象</div>
                <div className="token-grant-card-desc">
                    {isLoading ? "対象問題を読み込み中です..." : `未完了 ${eligibleRows.length} 問 / 配布完了 ${completedRows.length} 問 / 全 ${quizRows.length} 問`}
                </div>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isLoading || isSubmitting} onClick={() => loadQuizzes(students, studentNameMap)}>
                        再読み込み
                    </button>
                    <button className="btn-action" type="button" disabled={isLoading || isSubmitting || eligibleRows.length === 0} onClick={() => setSelectedKeys(eligibleRows.map((row) => row.key))}>
                        対象を全選択
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isLoading || isSubmitting} onClick={() => setSelectedKeys([])}>
                        選択解除
                    </button>
                    <button className="btn-action" type="button" disabled={isLoading || isSubmitting || selectedKeys.length === 0} onClick={() => executeBatch(quizRows.filter((row) => selectedKeys.includes(row.key)))}>
                        選択した問題を一括配布
                    </button>
                    <button className="btn-action" type="button" disabled={isLoading || isSubmitting || eligibleRows.length === 0} onClick={() => executeBatch(eligibleRows)}>
                        全対象問題を一括配布
                    </button>
                </div>
                {statusText && (
                    <div className="token-grant-card-desc" style={{ marginTop: "12px", color: "#d5e2ff" }}>
                        {statusText}
                    </div>
                )}
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">未完了の問題</div>
                <div className="token-grant-card-desc">未確定回答が残っている問題だけを表示します。ここに出ていない問題は一括配布の対象外です。</div>
            </div>

            <div className="results-table-wrap" style={{ marginTop: "var(--space-4)" }}>
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>選択</th>
                            <th>問題</th>
                            <th>保存先 quiz.sol</th>
                            <th>契約種別</th>
                            <th>1人あたり報酬</th>
                            <th>未確定回答</th>
                            <th>正解取得</th>
                        </tr>
                    </thead>
                    <tbody>
                        {incompleteRows.map((row) => {
                            const selectable = row.pendingStudents.length > 0 && row.correctAnswer;
                            return (
                                <tr key={row.key}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedKeys.includes(row.key)}
                                            disabled={!selectable || isSubmitting}
                                            onChange={() => toggleSelection(row.key)}
                                        />
                                    </td>
                                    <td>#{row.quizId} {row.title}</td>
                                    <td style={{ fontSize: "12px", wordBreak: "break-all" }}>{row.sourceAddress || quiz_address}</td>
                                    <td>{row.contractTypeLabel}</td>
                                    <td>{row.rewardTft} TFT</td>
                                    <td>{row.pendingCount}件</td>
                                    <td>{row.correctAnswer ? "取得済み" : "未取得"}</td>
                                </tr>
                            );
                        })}
                        {incompleteRows.length === 0 && (
                            <tr>
                                <td colSpan={7}>未完了の問題はありません。</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">報酬配布が完了した問題</div>
                <div className="token-grant-card-desc">未確定回答が残っていないため、この一覧からは再送できません。</div>
            </div>

            <div className="results-table-wrap" style={{ marginTop: "var(--space-4)" }}>
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>問題</th>
                            <th>保存先 quiz.sol</th>
                            <th>契約種別</th>
                            <th>1人あたり報酬</th>
                            <th>配布完了数</th>
                            <th>報酬Tx</th>
                            <th>状態</th>
                        </tr>
                    </thead>
                    <tbody>
                        {completedRows.map((row) => {
                            const payoutSummary = getQuizPayoutSummary(row);
                            return (
                                <tr key={`${row.key}:completed`}>
                                    <td>#{row.quizId} {row.title}</td>
                                    <td style={{ fontSize: "12px", wordBreak: "break-all" }}>{row.sourceAddress || quiz_address}</td>
                                    <td>{row.contractTypeLabel}</td>
                                    <td>{row.rewardTft} TFT</td>
                                    <td>{payoutSummary?.confirmedCount || row.settledCount}件</td>
                                    <td style={{ fontSize: "12px" }}>
                                        {payoutSummary?.txHashes?.length ? (
                                            <div style={{ display: "grid", gap: "6px" }}>
                                                {payoutSummary.txHashes.map((hash) => (
                                                    <a key={hash} href={`https://explorer-test.avax.network/c-chain/tx/${hash}`} target="_blank" rel="noreferrer" className="token-grant-link">
                                                        {formatTxHash(hash)}
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            "記録なし"
                                        )}
                                    </td>
                                    <td>配布完了</td>
                                </tr>
                            );
                        })}
                        {completedRows.length === 0 && (
                            <tr>
                                <td colSpan={7}>まだ配布完了の問題はありません。</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {executionRows.length > 0 && (
                <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                    <div className="token-grant-card-title">実行結果</div>
                    <div className="token-grant-ledger-list">
                        {executionRows.map((row) => (
                            <div key={row.key} className="token-grant-ledger-item">
                                <div className="token-grant-card-desc" style={{ fontWeight: 700 }}>
                                    #{row.quizId} {row.title}
                                </div>
                                <div className="token-grant-card-desc">
                                    状態: {row.status === "success" ? "配布完了" : row.status === "skipped_completed" ? "すでに配布完了" : `失敗 (${row.error || "-"})`}
                                </div>
                                <div className="token-grant-card-desc">
                                    保存先: {row.sourceAddress} / {row.contractTypeLabel}
                                </div>
                                <div className="token-grant-card-desc">
                                    未確定回答: {row.pendingCount}件 / 配布Tx: {row.payoutTxCount}件
                                </div>
                                {row.payoutTxHashes.length > 0 && (
                                    <div className="token-grant-card-desc">
                                        {row.payoutTxHashes.map((hash) => (
                                            <div key={hash}>
                                                <a href={`https://explorer-test.avax.network/c-chain/tx/${hash}`} target="_blank" rel="noreferrer" className="token-grant-link">
                                                    {formatTxHash(hash)}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Bulk_reward_panel;
