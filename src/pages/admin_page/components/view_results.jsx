import React, { useState, useEffect } from "react";
import { CSVLink } from "react-csv";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { ACTION_TYPES, appendActivityLog, getActivityLogs } from "../../../utils/activityLog";
import { buildExtendedCsvData, getCourseEnhancementSnapshot } from "../../../utils/courseEnhancements";
import { convertTftToPoint, normalizeTftAmount } from "../../../utils/quizRewardRate";
import { getRewardPayoutEntries, syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";
import { parseQuizContentMeta } from "../../../utils/quizContentMeta";

function getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeAnswerForAudit(value) {
    const full = "０１２３４５６７８９";
    const half = "0123456789";
    return String(value || "")
        .trim()
        .replace(/[０-９]/g, (char) => half[full.indexOf(char)] || char);
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

function buildBalanceMapKey(address = "") {
    return String(address || "").trim().toLowerCase();
}

function Create_csvlink(props) {
    return (
        <div className="csv-download-area">
            <CSVLink filename={`students_data_${getCurrentDateTime()}.csv`} data={props.cont[0]}>
                📥 学生の成績データをダウンロード
            </CSVLink>
            <CSVLink filename={`quizs_data_${getCurrentDateTime()}.csv`} data={props.cont[1]}>
                📥 小テストの統計データをダウンロード
            </CSVLink>
            <CSVLink filename={`lecture_summary_${getCurrentDateTime()}.csv`} data={props.cont[2]}>
                📥 出席・反応を含む集計CSVをダウンロード
            </CSVLink>
            <CSVLink filename={`reaction_history_${getCurrentDateTime()}.csv`} data={props.cont[3]}>
                📥 理解度リアクションCSVをダウンロード
            </CSVLink>
        </div>
    );
}

function View_result(props) {
    let contract = new Contracts_MetaMask();
    const [results, setResults] = useState([]);
    const [registeredStudents, setRegisteredStudents] = useState([]);
    const [studentBalanceMap, setStudentBalanceMap] = useState({});
    const [data_for_survey_users, setData_for_survey_users] = useState(null);
    const [data_for_survey_quizs, setData_for_survey_quizs] = useState(null);
    const [usersData, setUsersData] = useState(null);
    const [quizsData, setQuizsData] = useState(null);
    const [extendedGradeData, setExtendedGradeData] = useState(null);
    const [reactionCsvData, setReactionCsvData] = useState(null);
    const [csvdownloader, setCsvdownloader] = useState(false);
    const [scoreAuditRows, setScoreAuditRows] = useState([]);
    const [scoreAuditCsvData, setScoreAuditCsvData] = useState(null);
    const [isAuditingScores, setIsAuditingScores] = useState(false);
    const [scoreAuditStatus, setScoreAuditStatus] = useState("");
    const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
    const [lastBalanceSyncAt, setLastBalanceSyncAt] = useState("");
    const [balanceRefreshError, setBalanceRefreshError] = useState("");

    const handle_export_csv = () => {
        if (!Array.isArray(data_for_survey_users) || !data_for_survey_users.length || !Array.isArray(data_for_survey_quizs) || !data_for_survey_quizs.length) {
            return;
        }
        const users_data = [
            ["user", "create_quiz_count", "web3_quiz_score_tft", "answer_count", "actual_tft_balance_live", "actual_ttt_balance_live", "actual_pol_balance_live", "point"]
        ];
        for (let i = 0; i < data_for_survey_users.length; i++) {
            const address = data_for_survey_users[i].user;
            const balances = studentBalanceMap[String(address || "").toLowerCase()] || {};
            const scoreTft = normalizeTftAmount(data_for_survey_users[i].result);
            users_data.push([
                address,
                Number(data_for_survey_users[i].create_quiz_count).toString(),
                scoreTft.toString(),
                Number(data_for_survey_users[i].answer_count).toString(),
                Number(balances.tft || 0).toFixed(4),
                Number(balances.ttt || 0).toFixed(4),
                Number(balances.pol || 0).toFixed(6),
                convertTftToPoint(Number(scoreTft || 0)).toFixed(1),
            ]);
        }

        const quizs_data = [
            Object.keys(data_for_survey_quizs[0])
        ];
        for (let i = 0; i < data_for_survey_quizs.length; i++) {
            quizs_data.push([
                (Number(data_for_survey_quizs[i].reward) / (10 ** 18)).toString(), 
                Number(data_for_survey_quizs[i].respondent_count).toString()
            ]);
        }

        const snapshot = getCourseEnhancementSnapshot();
        const extended = buildExtendedCsvData({
            results,
            logs: getActivityLogs(),
            boardLogs: snapshot.boardLogs,
            reactionHistory: snapshot.reactionHistory,
            studentBalanceMap,
        });

        setUsersData(users_data);
        setQuizsData(quizs_data);
        setExtendedGradeData(extended.gradeRows);
        setReactionCsvData(extended.reactionRows);
        setCsvdownloader(true);
        appendActivityLog(ACTION_TYPES.EXPORT_GRADES, {
            page: "admin",
            studentRows: users_data.length - 1,
            quizRows: quizs_data.length - 1,
        });
    };

    async function get_data_for_survey() {
        await syncRewardPayoutLedgerFromServer().catch(() => []);
        setData_for_survey_users(await contract.get_data_for_survey_users());
        setData_for_survey_quizs(await contract.get_data_for_survey_quizs());
    }

    async function loadStudentBalances(addresses = [], options = {}) {
        const targets = Array.isArray(addresses)
            ? addresses.map((address) => String(address || "").trim()).filter(Boolean)
            : [];
        if (!targets.length) {
            setLastBalanceSyncAt(new Date().toISOString());
            return;
        }
        const forceRefresh = Boolean(options?.force);
        setIsRefreshingBalances(true);
        setBalanceRefreshError("");
        const nextMap = forceRefresh ? { ...studentBalanceMap } : { ...studentBalanceMap };
        await runChunked(targets, 6, async (item) => {
            const address = String(item || "").trim();
            const cacheKey = buildBalanceMapKey(address);
            if (!forceRefresh && nextMap[cacheKey]) return;
            const [tft, ttt, pol] = await Promise.all([
                contract.get_token_balance(address).catch(() => 0),
                contract.get_ttt_balance(address).catch(() => 0),
                contract.get_pol_balance(address).catch(() => 0),
            ]);
            nextMap[cacheKey] = {
                tft: Number(tft || 0),
                ttt: Number(ttt || 0),
                pol: Number(pol || 0),
            };
        }).catch((error) => {
            console.error("Failed to refresh student balances", error);
            setBalanceRefreshError("トークン残高の更新に失敗しました。少し待って再試行してください。");
        });
        setStudentBalanceMap(nextMap);
        setLastBalanceSyncAt(new Date().toISOString());
        setIsRefreshingBalances(false);
    }

    async function loadRegisteredStudents() {
        try {
            const students = await contract.get_student_list();
            const normalized = Array.isArray(students)
                ? students.map((address) => String(address || "").trim()).filter(Boolean)
                : [];
            setRegisteredStudents(normalized);
            return normalized;
        } catch (error) {
            console.error("Failed to load registered students", error);
            setRegisteredStudents([]);
            return [];
        }
    }

    async function runScoreAudit() {
        setIsAuditingScores(true);
        setScoreAuditStatus("Web3小テストの得点整合性を確認中です...");
        try {
            await syncRewardPayoutLedgerFromServer().catch(() => []);
            const payoutEntries = getRewardPayoutEntries();
            const payoutMap = new Map();
            payoutEntries
                .filter((entry) => entry?.confirmed !== false && String(entry?.resultState || "") === "correct")
                .forEach((entry) => {
                    const key = `${normalizeAddress(entry?.sourceAddress)}:${Number(entry?.quizId || 0)}:${normalizeAddress(entry?.studentAddress)}`;
                    payoutMap.set(key, Number(entry?.rewardTft || 0));
                });

            const nextResults = Array.isArray(results) ? results : [];
            const students = nextResults
                .map((item) => String(item?.student || "").trim())
                .filter(Boolean);
            const scoreMap = new Map(nextResults.map((item) => [normalizeAddress(item?.student), Number(item?.result || 0)]));
            const quizList = await contract.get_all_quiz_simple_list().catch(() => []);

            const auditMap = new Map(
                students.map((student) => [
                    normalizeAddress(student),
                    {
                        address: student,
                        actualScoreTft: Number(scoreMap.get(normalizeAddress(student)) || 0),
                        expectedScoreTft: 0,
                        correctCount: 0,
                        settledCorrectCount: 0,
                        missingRewardCount: 0,
                        halfRewardCount: 0,
                        mismatchNotes: [],
                    },
                ])
            );

            const quizzesWithAnswers = await runChunked(
                Array.isArray(quizList) ? quizList : [],
                4,
                async (quiz) => {
                    const quizId = Number(quiz?.[0] || 0);
                    const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
                    const quizTitle = String(quiz?.[2] || `問題 ${quizId}`);
                    const rewardTft = Number(quiz?.[7] || 0) / 10 ** 18;
                    const fullQuiz = await contract.get_quiz(quizId, sourceAddress).catch(() => null);
                    const quizMeta = parseQuizContentMeta(fullQuiz?.[5] || "");
                    const revealedCorrect = await contract.get_revealed_correct_answer(quizId, sourceAddress).catch(() => "");
                    const confirmAnswerData = await contract.get_confirm_answer(quizId, sourceAddress).catch(() => ["", false]);
                    const correctAnswer = normalizeAnswerForAudit(revealedCorrect || confirmAnswerData?.[0] || "");
                    return {
                        quizId,
                        sourceAddress,
                        quizTitle,
                        rewardTft,
                        correctAnswer,
                        allowMultipleAnswers: Boolean(quizMeta.allowMultipleAnswers),
                    };
                }
            );

            for (const quiz of quizzesWithAnswers) {
                if (!quiz.correctAnswer) continue;
                const perStudentDetails = await runChunked(
                    students,
                    8,
                    async (student) => {
                        const detail = await contract.get_student_answer_detail(student, quiz.quizId, quiz.sourceAddress).catch(() => null);
                        return { student, detail };
                    }
                );

                perStudentDetails.forEach(({ student, detail }) => {
                    if (!detail?.submitted) return;
                    const normalizedStudent = normalizeAddress(student);
                    const row = auditMap.get(normalizedStudent);
                    if (!row) return;

                    const answerText = normalizeAnswerForAudit(detail?.answerText);
                    const isCorrect = answerText && answerText === quiz.correctAnswer;
                    if (!isCorrect) return;

                    const attemptCount = Number(detail?.attemptCount || 0);
                    const shouldApplyHalfReward = Boolean(quiz.allowMultipleAnswers) && attemptCount > 1;
                    const expectedRewardTft = shouldApplyHalfReward ? quiz.rewardTft / 2 : quiz.rewardTft;
                    const rewardFromDetail = Number(detail?.reward || 0) / 10 ** 18;
                    const payoutKey = `${normalizeAddress(quiz.sourceAddress)}:${quiz.quizId}:${normalizedStudent}`;
                    const rewardFromLedger = Number(payoutMap.get(payoutKey) || 0);
                    const settledRewardTft = rewardFromDetail > 0 ? rewardFromDetail : rewardFromLedger;

                    row.correctCount += 1;
                    row.expectedScoreTft += Number(expectedRewardTft || 0);
                    if (shouldApplyHalfReward) {
                        row.halfRewardCount += 1;
                    }

                    if (settledRewardTft > 0) {
                        row.settledCorrectCount += 1;
                    } else {
                        row.missingRewardCount += 1;
                        row.mismatchNotes.push(`#${quiz.quizId} ${quiz.quizTitle}: 正解だが報酬配布記録なし`);
                    }

                    if (settledRewardTft > 0 && Math.abs(settledRewardTft - expectedRewardTft) > 0.0001) {
                        row.mismatchNotes.push(
                            `#${quiz.quizId} ${quiz.quizTitle}: 期待 ${expectedRewardTft} TFT / 配布記録 ${settledRewardTft} TFT`
                        );
                    }
                });
            }

            const nextAuditRows = Array.from(auditMap.values())
                .map((row) => {
                    const differenceTft = Number((row.actualScoreTft - row.expectedScoreTft).toFixed(4));
                    const status = row.missingRewardCount > 0
                        ? "未配布あり"
                        : Math.abs(differenceTft) > 0.0001
                            ? (differenceTft > 0 ? "過大計上の可能性" : "未反映の可能性")
                            : "一致";
                    return {
                        ...row,
                        differenceTft,
                        actualPoint: Number(convertTftToPoint(row.actualScoreTft).toFixed(2)),
                        expectedPoint: Number(convertTftToPoint(row.expectedScoreTft).toFixed(2)),
                        status,
                    };
                })
                .sort((left, right) => {
                    const severity = (row) => (
                        row.status === "未配布あり" ? 3
                            : row.status === "過大計上の可能性" || row.status === "未反映の可能性" ? 2
                                : 1
                    );
                    return severity(right) - severity(left)
                        || right.differenceTft - left.differenceTft
                        || right.expectedScoreTft - left.expectedScoreTft;
                });

            setScoreAuditRows(nextAuditRows);
            setScoreAuditCsvData([
                [
                    "address",
                    "actual_score_tft",
                    "actual_point",
                    "expected_score_tft",
                    "expected_point",
                    "difference_tft",
                    "correct_count",
                    "settled_correct_count",
                    "missing_reward_count",
                    "half_reward_count",
                    "status",
                    "notes",
                ],
                ...nextAuditRows.map((row) => [
                    row.address,
                    Number(row.actualScoreTft || 0).toFixed(4),
                    Number(row.actualPoint || 0).toFixed(2),
                    Number(row.expectedScoreTft || 0).toFixed(4),
                    Number(row.expectedPoint || 0).toFixed(2),
                    Number(row.differenceTft || 0).toFixed(4),
                    Number(row.correctCount || 0).toString(),
                    Number(row.settledCorrectCount || 0).toString(),
                    Number(row.missingRewardCount || 0).toString(),
                    Number(row.halfRewardCount || 0).toString(),
                    row.status,
                    row.mismatchNotes.join(" / "),
                ]),
            ]);
            setScoreAuditStatus(`監査完了: 要確認 ${nextAuditRows.filter((row) => row.status !== "一致").length}人 / 全 ${nextAuditRows.length}人`);
        } catch (error) {
            console.error("Failed to audit score consistency", error);
            setScoreAuditStatus("得点整合性の監査に失敗しました。");
        } finally {
            setIsAuditingScores(false);
        }
    }

    useEffect(() => {
        get_data_for_survey();
        Promise.all([
            props.cont.get_results().catch(() => []),
            loadRegisteredStudents(),
        ]).then(async ([result, students]) => {
            console.log(result);
            const nextResults = Array.isArray(result) ? result : [];
            setResults(nextResults);
            const scoreAddresses = nextResults.map((item) => String(item?.student || "").trim()).filter(Boolean);
            const allTargets = Array.from(new Set([...(Array.isArray(students) ? students : []), ...scoreAddresses]));
            await loadStudentBalances(allTargets, { force: true });
        });
    }, []);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const scoreAddresses = (Array.isArray(results) ? results : []).map((item) => String(item?.student || "").trim()).filter(Boolean);
            const allTargets = Array.from(new Set([...(Array.isArray(registeredStudents) ? registeredStudents : []), ...scoreAddresses]));
            if (allTargets.length > 0) {
                loadStudentBalances(allTargets, { force: true });
            }
        }, 20000);

        return () => window.clearInterval(intervalId);
    }, [results, registeredStudents]);

    const scoreMap = new Map((Array.isArray(results) ? results : []).map((item) => [normalizeAddress(item?.student), Number(item?.result || 0)]));
    const balanceRows = Array.from(new Set([...(Array.isArray(registeredStudents) ? registeredStudents : []), ...(Array.isArray(results) ? results.map((item) => String(item?.student || "").trim()) : [])]))
        .filter(Boolean)
        .map((address) => ({
            address,
            scoreTft: Number(scoreMap.get(normalizeAddress(address)) || 0),
            balances: studentBalanceMap[normalizeAddress(address)] || {},
        }))
        .sort((left, right) => {
            const leftTft = Number(left.balances?.tft || 0);
            const rightTft = Number(right.balances?.tft || 0);
            return rightTft - leftTft || right.scoreTft - left.scoreTft || String(left.address).localeCompare(String(right.address));
        });

    return (
        <div>
            <h3 className="section-title">📊 生徒の成績</h3>
            <p className="section-desc">スマートコントラクト上の成績データを閲覧・エクスポートできます</p>

            <div className="row">
                <button className="btn-action" onClick={() => handle_export_csv()}>
                    📤 成績データのCSVファイルを出力
                </button>
                <button className="btn-action" onClick={() => runScoreAudit()} disabled={isAuditingScores || results.length === 0}>
                    {isAuditingScores ? "得点整合性を監査中..." : "🔍 得点整合性を監査"}
                </button>
                {csvdownloader === true && <Create_csvlink cont={[usersData, quizsData, extendedGradeData, reactionCsvData]} />}
                {Array.isArray(scoreAuditCsvData) && scoreAuditCsvData.length > 1 && (
                    <CSVLink filename={`score_audit_${getCurrentDateTime()}.csv`} data={scoreAuditCsvData}>
                        📥 得点整合性監査CSVをダウンロード
                    </CSVLink>
                )}
            </div>
            {scoreAuditStatus ? (
                <div className="section-desc" style={{ marginTop: "10px", color: "#d5e2ff" }}>
                    {scoreAuditStatus}
                </div>
            ) : null}

            <h3 className="section-title" style={{ marginTop: "28px" }}>🪙 登録学生の現在トークン残高</h3>
            <p className="section-desc">
                登録学生全員の現在残高を約20秒ごとに更新します。講義中の配布確認や残高確認に使えます。
            </p>
            <div className="row">
                <button
                    className="btn-action"
                    onClick={() => loadStudentBalances(balanceRows.map((row) => row.address), { force: true })}
                    disabled={isRefreshingBalances || balanceRows.length === 0}
                >
                    {isRefreshingBalances ? "残高を更新中..." : "🔄 今すぐ残高を更新"}
                </button>
            </div>
            {lastBalanceSyncAt ? (
                <div className="section-desc" style={{ marginTop: "10px", color: "#d5e2ff" }}>
                    最終更新: {new Date(lastBalanceSyncAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </div>
            ) : null}
            {balanceRefreshError ? (
                <div className="section-desc" style={{ marginTop: "10px", color: "#ffd5d5" }}>
                    {balanceRefreshError}
                </div>
            ) : null}

            <div className="results-table-wrap">
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ウォレットアドレス</th>
                            <th>Web3小テスト得点</th>
                            <th>実TFT残高</th>
                            <th>実TTT残高</th>
                            <th>実AVAX残高</th>
                        </tr>
                    </thead>
                    <tbody>
                        {balanceRows.map((row, index) => (
                            <tr key={`balance-${row.address}`}>
                                <td>{index + 1}</td>
                                <td className="address-cell">{row.address}</td>
                                <td className="score-cell">{convertTftToPoint(Number(row.scoreTft || 0)).toFixed(1)}点</td>
                                <td className="score-cell">{Number(row.balances.tft || 0).toFixed(4)} TFT</td>
                                <td className="score-cell">{Number(row.balances.ttt || 0).toFixed(4)} TTT</td>
                                <td className="score-cell">{Number(row.balances.pol || 0).toFixed(6)} AVAX</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="results-table-wrap">
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ウォレットアドレス</th>
                            <th>得点</th>
                            <th>実TFT残高</th>
                            <th>実TTT残高</th>
                            <th>実AVAX残高</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((item, index) => {
                            const balances = studentBalanceMap[String(item.student || "").toLowerCase()] || {};
                            return (
                                <tr key={index}>
                                    <td>{index + 1}</td>
                                    <td className="address-cell">{item.student}</td>
                                    <td className="score-cell">{convertTftToPoint(Number(item.result || 0)).toFixed(1)}点</td>
                                    <td className="score-cell">{Number(balances.tft || 0).toFixed(4)} TFT</td>
                                    <td className="score-cell">{Number(balances.ttt || 0).toFixed(4)} TTT</td>
                                    <td className="score-cell">{Number(balances.pol || 0).toFixed(6)} AVAX</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {scoreAuditRows.length > 0 && (
                <>
                    <h3 className="section-title" style={{ marginTop: "28px" }}>🧮 Web3小テスト得点監査</h3>
                    <p className="section-desc">
                        Web3小テストの正解と設定報酬だけを基準に、現在の得点と配布状況を比較しています。複数回答で正解した問題は半額として計算します。
                    </p>
                    <div className="results-table-wrap">
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th>ウォレットアドレス</th>
                                    <th>現在得点TFT</th>
                                    <th>期待TFT</th>
                                    <th>差分TFT</th>
                                    <th>正解数</th>
                                    <th>配布確認済み</th>
                                    <th>未配布候補</th>
                                    <th>半額適用</th>
                                    <th>状態</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scoreAuditRows.map((row) => (
                                    <React.Fragment key={`audit-${row.address}`}>
                                        <tr>
                                            <td className="address-cell">{row.address}</td>
                                            <td className="score-cell">{Number(row.actualScoreTft || 0).toFixed(4)} TFT / {Number(row.actualPoint || 0).toFixed(2)}点</td>
                                            <td className="score-cell">{Number(row.expectedScoreTft || 0).toFixed(4)} TFT / {Number(row.expectedPoint || 0).toFixed(2)}点</td>
                                            <td className="score-cell">{Number(row.differenceTft || 0).toFixed(4)} TFT</td>
                                            <td>{row.correctCount}</td>
                                            <td>{row.settledCorrectCount}</td>
                                            <td>{row.missingRewardCount}</td>
                                            <td>{row.halfRewardCount}</td>
                                            <td>{row.status}</td>
                                        </tr>
                                        {row.mismatchNotes.length > 0 && (
                                            <tr>
                                                <td colSpan={9} style={{ textAlign: "left", color: "#ffe7a3", fontSize: "13px", whiteSpace: "pre-wrap" }}>
                                                    {row.mismatchNotes.join("\n")}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

export default View_result;
