import React, { useMemo, useState } from "react";
import {
    ACTION_TYPES,
    appendActivityLog,
    formatActionLabel,
    formatDateTime,
    getMergedActivityLogs,
    syncSharedActivityLogs,
} from "../../../utils/activityLog";
import { getBoardLogs } from "../../../utils/boardModerationLog";
import { getCourseEnhancementSnapshot } from "../../../utils/courseEnhancements";
import {
    getGrantLedgerEntries,
    isGrantActive,
    isGrantReserved,
    normalizeGrantRecord,
    syncGrantLedgerFromServer,
} from "../../../utils/tokenGrantLedger";
import {
    getRewardPayoutEntries,
    syncRewardPayoutLedgerFromServer,
} from "../../../utils/rewardPayoutLedger";
import { convertTftToPoint, normalizeTftAmount } from "../../../utils/quizRewardRate";
import { createSectionedCsv, downloadTextFile, downloadWorkbookXml } from "../../../utils/platformExport";

const AMOY_EXPLORER_TX_BASE = "https://explorer-test.avax.network/c-chain/tx/";
const AMOY_EXPLORER_ADDRESS_BASE = "https://explorer-test.avax.network/c-chain/address/";

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function getTimestampLabel() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function toStateLabel(state) {
    if (Number(state) === 2) return "正解済み";
    if (Number(state) === 1) return "不正解済み";
    if (Number(state) === 3) return "回答済み";
    return "未回答";
}

function toVerificationLabel(status = "", submitted = false) {
    if (status === "receipt_confirmed") return "receipt確認済み";
    if (status === "verified_after_receipt_timeout") return "on-chain再確認済み";
    if (submitted) return "回答保存済み";
    return "-";
}

function buildTokenGrantRows(grantLedgerEntries = [], studentMetaMap = new Map()) {
    const rows = [];
    (Array.isArray(grantLedgerEntries) ? grantLedgerEntries : []).forEach((entry) => {
        ["answer_pol", "answer_thanks_tft", "board_ttt"].forEach((assetKey) => {
            const record = normalizeGrantRecord(entry?.status?.[assetKey]);
            if (!record) return;
            const studentMeta = studentMetaMap.get(normalizeAddress(entry.address)) || {};
            const history = Array.isArray(record.history) ? record.history : [];
            history.forEach((historyEntry, index) => {
                rows.push({
                    address: entry.address,
                    student_name: studentMeta.name || "",
                    student_id: studentMeta.studentId || "",
                    asset: assetKey === "answer_pol" ? "AVAX" : assetKey === "answer_thanks_tft" ? "TFT" : "TTT",
                    current_status: isGrantActive(record) ? "付与済み" : isGrantReserved(record) ? "送金処理中" : "未付与",
                    current_amount: record.amount ?? "",
                    current_tx_hash: record.txHash || "",
                    current_tx_url: record.txHash ? `${AMOY_EXPLORER_TX_BASE}${record.txHash}` : "",
                    current_granted_at: record.grantedAt || "",
                    history_index: index + 1,
                    history_type: historyEntry?.type || "grant",
                    amount: historyEntry?.amount ?? "",
                    timestamp: historyEntry?.at || "",
                    tx_hash: historyEntry?.txHash || "",
                    tx_url: historyEntry?.txHash ? `${AMOY_EXPLORER_TX_BASE}${historyEntry.txHash}` : "",
                    source: historyEntry?.source || "",
                    confirmed: historyEntry?.confirmed !== false ? "true" : "false",
                    active: historyEntry?.active !== false ? "true" : "false",
                });
            });
        });
    });
    return rows;
}

function buildRewardPayoutRows(rewardPayoutEntries = [], studentMetaMap = new Map()) {
    return (Array.isArray(rewardPayoutEntries) ? rewardPayoutEntries : []).map((entry) => {
        const studentMeta = studentMetaMap.get(normalizeAddress(entry.studentAddress)) || {};
        return {
            quiz_id: Number(entry.quizId || 0),
            quiz_title: entry.quizTitle || "",
            source_address: entry.sourceAddress || "",
            student_address: entry.studentAddress || "",
            student_name: entry.studentName || studentMeta.name || "",
            student_id: studentMeta.studentId || "",
            answer_text: entry.answerText || "",
            result_state: entry.resultState || "",
            reward_tft: Number(entry.rewardTft || 0),
            reward_wei: entry.rewardWei || "",
            tx_hash: entry.txHash || "",
            tx_url: entry.txHash ? `${AMOY_EXPLORER_TX_BASE}${entry.txHash}` : "",
            actor_address: entry.actorAddress || "",
            mode: entry.mode || "",
            contract_type: entry.contractTypeLabel || "",
            paid_at: entry.paidAt || "",
            confirmed: entry.confirmed !== false ? "true" : "false",
        };
    });
}

function Platform_export_panel({ cont }) {
    const [isExporting, setIsExporting] = useState(false);
    const [statusText, setStatusText] = useState("");
    const [lastSummary, setLastSummary] = useState(null);

    const helperText = useMemo(() => (
        "成績、全問題の回答一覧、クイズ情報、トークン付与履歴、回答報酬履歴、掲示板監視、分析ログ、理解度リアクションなどを1回でまとめて出力できます。"
    ), []);

    async function collectExportDataset() {
        setStatusText("共有ログと付与履歴を同期中...");
        await Promise.allSettled([
            syncSharedActivityLogs(),
            syncGrantLedgerFromServer(),
            syncRewardPayoutLedgerFromServer(),
        ]);

        setStatusText("学生・教員・クイズ一覧を取得中...");
        const [students, teachers, quizList, results] = await Promise.all([
            cont.get_student_list().catch(() => []),
            cont.get_teachers().catch(() => []),
            cont.get_all_quiz_simple_list().catch(() => []),
            cont.get_results().catch(() => []),
        ]);

        const normalizedStudents = Array.isArray(students) ? students : [];
        const normalizedTeachers = Array.isArray(teachers) ? teachers : [];
        const normalizedQuizList = Array.isArray(quizList) ? quizList : [];
        const normalizedResults = Array.isArray(results) ? results : [];

        setStatusText("学生プロフィールを整理中...");
        const resultMap = new Map(
            normalizedResults.map((row) => [normalizeAddress(row.student), Number(row.result || 0)])
        );
        const studentRows = await Promise.all(
            normalizedStudents.map(async (address, index) => {
                const userData = await cont.get_user_data(address).catch(() => ["", "", 0, false]);
                const tft = resultMap.get(normalizeAddress(address)) ?? normalizeTftAmount(userData?.[2] || 0);
                return {
                    student_id: `USER-${String(index + 1).padStart(3, "0")}`,
                    address,
                    address_url: `${AMOY_EXPLORER_ADDRESS_BASE}${address}`,
                    name: String(userData?.[0] || ""),
                    image_url: String(userData?.[1] || ""),
                    web3_quiz_score_tft: tft,
                    web3_quiz_score_point: Number(convertTftToPoint(Number(tft || 0)).toFixed(1)),
                };
            })
        );
        const studentBalanceMap = new Map();
        await Promise.all(
            studentRows.map(async (student) => {
                const address = student.address;
                const [actualTftBalance, actualTttBalance, actualPolBalance] = await Promise.all([
                    cont.get_token_balance(address).catch(() => 0),
                    cont.get_ttt_balance(address).catch(() => 0),
                    cont.get_pol_balance(address).catch(() => 0),
                ]);
                studentBalanceMap.set(normalizeAddress(address), {
                    tft: Number(actualTftBalance || 0),
                    ttt: Number(actualTttBalance || 0),
                    pol: Number(actualPolBalance || 0),
                });
            })
        );
        studentRows.forEach((student) => {
            const balances = studentBalanceMap.get(normalizeAddress(student.address)) || {};
            student.actual_tft_balance = Number(balances.tft || 0);
            student.actual_ttt_balance = Number(balances.ttt || 0);
            student.actual_pol_balance = Number(balances.pol || 0);
        });
        const studentMetaMap = new Map(studentRows.map((row) => [normalizeAddress(row.address), row]));

        const teacherRows = await Promise.all(
            normalizedTeachers.map(async (address, index) => {
                const userData = await cont.get_user_data(address).catch(() => ["", "", 0, false]);
                return {
                    teacher_id: `TEACHER-${String(index + 1).padStart(3, "0")}`,
                    address,
                    address_url: `${AMOY_EXPLORER_ADDRESS_BASE}${address}`,
                    name: String(userData?.[0] || ""),
                    image_url: String(userData?.[1] || ""),
                };
            })
        );

        setStatusText("クイズ詳細を取得中...");
        const quizRows = await Promise.all(
            normalizedQuizList.map(async (quiz, index) => {
                const quizId = Number(quiz?.[0] || 0);
                const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
                const quizDetail = await cont.get_quiz(quizId, sourceAddress).catch(() => quiz);
                const revealedAnswer = await cont.get_revealed_correct_answer(quizId, sourceAddress).catch(() => "");
                const confirmAnswerData = await cont.get_confirm_answer(quizId, sourceAddress).catch(() => ["", false]);
                return {
                    quiz_order: index + 1,
                    quiz_id: quizId,
                    source_address: sourceAddress,
                    owner: quizDetail?.[1] || "",
                    title: quizDetail?.[2] || "",
                    explanation: quizDetail?.[3] || "",
                    thumbnail_url: quizDetail?.[4] || "",
                    content: quizDetail?.[5] || "",
                    answer_data: quizDetail?.[6] || "",
                    create_time_epoch: Number(quizDetail?.[7] || 0),
                    start_time_epoch: Number(quizDetail?.[8] || 0),
                    time_limit_epoch: Number(quizDetail?.[9] || 0),
                    reward_wei: Number(quizDetail?.[10] || 0),
                    reward_tft: Number(quizDetail?.[10] || 0) / 10 ** 18,
                    respondent_count: Number(quizDetail?.[11] || 0),
                    respondent_limit: Number(quizDetail?.[12] || 0),
                    answer_type: Number(quizDetail?.[13] || 0),
                    registered_correct_answer: String(quizDetail?.[14] || ""),
                    payment_completed: quizDetail?.[15] ? "true" : "false",
                    revealed_correct_answer: String(revealedAnswer || ""),
                    confirm_answer: String(confirmAnswerData?.[0] || ""),
                    confirm_answer_visible: confirmAnswerData?.[1] ? "true" : "false",
                };
            })
        );

        setStatusText("全問題の回答一覧を収集中...");
        const answerRows = [];
        for (const quiz of quizRows) {
            for (const student of studentRows) {
                const detail = await cont.get_student_answer_detail(student.address, quiz.quiz_id, quiz.source_address).catch(() => null);
                answerRows.push({
                    quiz_id: quiz.quiz_id,
                    quiz_title: quiz.title,
                    source_address: quiz.source_address,
                    student_address: student.address,
                    student_name: student.name,
                    student_id: student.student_id,
                    submitted: detail?.submitted ? "true" : "false",
                    answer_text: String(detail?.answerText || ""),
                    state: Number(detail?.state || 0),
                    state_label: toStateLabel(detail?.state),
                    answer_time: Number(detail?.answerTime || 0),
                    reward_wei: Number(detail?.reward || 0),
                    reward_tft: Number(detail?.reward || 0) / 10 ** 18,
                    result: detail?.result ? "true" : "false",
                    attempt_count: Number(detail?.attemptCount || 0),
                });
            }
        }

        setStatusText("履歴・ログを整形中...");
        const activityRows = getMergedActivityLogs().map((log) => ({
            id: log.id,
            created_at: log.createdAt || "",
            action: log.action || "",
            action_label: formatActionLabel(log.action),
            actor: log.actor || "",
            address: log.address || "",
            route: log.route || "",
            quiz_id: log.quizId || "",
            source_address: log.sourceAddress || "",
            tx_hash: log.txHash || "",
            verification_status: log.verificationStatus || "",
            page: log.page || "",
            message: log.message || "",
            detail_json: JSON.stringify(log),
        }));

        const snapshot = getCourseEnhancementSnapshot();
        const boardRows = (snapshot.boardLogs || getBoardLogs()).map((item) => ({
            created_at: item.createdAt || "",
            status: item.status || "",
            type: item.type || "",
            message_kind: item.messageKind || "",
            user: item.user || "",
            amount_ttt: Number(item.amount || 0),
            like_count: Number(item.likeCount || 0),
            text: item.text || "",
            reason: item.reason || "",
            categories: Array.isArray(item.categories) ? item.categories.join(", ") : "",
        }));
        const reactionRows = (snapshot.reactionHistory || []).map((item) => ({
            session_id: item.id || "",
            label: item.label || "",
            started_at: item.startedAt || "",
            ended_at: item.endedAt || "",
            total_reaction_count: Number(item.totalReactionCount || 0),
            understood: Number(item.reactions?.understood || 0),
            repeat: Number(item.reactions?.repeat || 0),
            slow: Number(item.reactions?.slow || 0),
            fast: Number(item.reactions?.fast || 0),
        }));
        const announcementRows = (snapshot.announcements || []).map((item) => ({
            id: item.id || "",
            title: item.title || "",
            body: item.body || "",
            links: Array.isArray(item.links) ? item.links.join(" | ") : "",
            created_at: item.createdAt || "",
            author: item.author || "",
            pinned: item.pinned !== false ? "true" : "false",
        }));
        const practiceRows = (snapshot.practiceAttempts || []).map((item) => ({
            id: item.id || "",
            quiz_id: item.quizId || "",
            address: item.address || "",
            answer: item.answer || "",
            is_correct: item.isCorrect ? "true" : "false",
            mode: item.mode || "",
            created_at: item.createdAt || "",
            title: item.title || "",
        }));

        const grantRows = buildTokenGrantRows(getGrantLedgerEntries(), studentMetaMap);
        const rewardPayoutRows = buildRewardPayoutRows(getRewardPayoutEntries(), studentMetaMap);
        const gradeRows = studentRows.map((student) => ({
            student_id: student.student_id,
            student_name: student.name,
            student_address: student.address,
            web3_quiz_score_tft: student.web3_quiz_score_tft,
            web3_quiz_score_point: student.web3_quiz_score_point,
            actual_tft_balance_live: Number(student.actual_tft_balance || 0),
            actual_ttt_balance_live: Number(student.actual_ttt_balance || 0),
            actual_pol_balance_live: Number(student.actual_pol_balance || 0),
        }));

        return {
            students: studentRows,
            teachers: teacherRows,
            grades: gradeRows,
            quizzes: quizRows,
            answers: answerRows,
            tokenGrants: grantRows,
            rewardPayouts: rewardPayoutRows,
            activityLogs: activityRows,
            boardLogs: boardRows,
            reactionHistory: reactionRows,
            announcements: announcementRows,
            practiceAttempts: practiceRows,
        };
    }

    async function handleExportAll(format) {
        setIsExporting(true);
        setLastSummary(null);
        try {
            const dataset = await collectExportDataset();
            const sheets = [
                { name: "Students", rows: dataset.students },
                { name: "Teachers", rows: dataset.teachers },
                { name: "Grades", rows: dataset.grades },
                { name: "Quizzes", rows: dataset.quizzes },
                { name: "Answers", rows: dataset.answers },
                { name: "TokenGrants", rows: dataset.tokenGrants },
                { name: "RewardPayouts", rows: dataset.rewardPayouts },
                { name: "ActivityLogs", rows: dataset.activityLogs },
                { name: "BoardLogs", rows: dataset.boardLogs },
                { name: "Reactions", rows: dataset.reactionHistory },
                { name: "Announcements", rows: dataset.announcements },
                { name: "Practice", rows: dataset.practiceAttempts },
            ];
            const stamp = getTimestampLabel();

            if (format === "excel") {
                downloadWorkbookXml(`platform_export_${stamp}.xls`, sheets);
            } else if (format === "json") {
                downloadTextFile(
                    `platform_export_${stamp}.json`,
                    JSON.stringify(dataset, null, 2),
                    "application/json;charset=utf-8"
                );
            } else {
                downloadTextFile(
                    `platform_export_${stamp}.csv`,
                    createSectionedCsv(sheets),
                    "text/csv;charset=utf-8"
                );
            }

            appendActivityLog(ACTION_TYPES.EXPORT_ANALYTICS, {
                page: "admin",
                format,
                students: dataset.students.length,
                quizzes: dataset.quizzes.length,
                answers: dataset.answers.length,
            });

            setLastSummary({
                exportedAt: new Date().toISOString(),
                students: dataset.students.length,
                teachers: dataset.teachers.length,
                quizzes: dataset.quizzes.length,
                answers: dataset.answers.length,
                tokenGrants: dataset.tokenGrants.length,
                rewardPayouts: dataset.rewardPayouts.length,
                activityLogs: dataset.activityLogs.length,
                boardLogs: dataset.boardLogs.length,
            });
            setStatusText("出力が完了しました。");
        } catch (error) {
            console.error("Failed to export platform dataset", error);
            setStatusText("全体出力に失敗しました。少し待ってから再試行してください。");
            alert(error?.message || "全体出力に失敗しました。");
        } finally {
            setIsExporting(false);
        }
    }

    return (
        <div>
            <h3 className="section-title">📦 全体出力</h3>
            <p className="section-desc">{helperText}</p>

            <div className="token-grant-card">
                <div className="token-grant-card-title">一括ダウンロード</div>
                <div className="token-grant-card-desc">
                    Excel は複数シート、CSV はセクション区切り、JSON は階層構造でまとめて出力します。
                </div>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isExporting} onClick={() => handleExportAll("excel")}>
                        {isExporting ? "集計中..." : "📥 全体を Excel で出力"}
                    </button>
                    <button className="btn-action" type="button" disabled={isExporting} onClick={() => handleExportAll("csv")}>
                        📤 全体を CSV で出力
                    </button>
                    <button className="btn-action" type="button" disabled={isExporting} onClick={() => handleExportAll("json")}>
                        📤 全体を JSON で出力
                    </button>
                </div>
                <div className="token-grant-card-desc" style={{ marginTop: "12px", color: "#d5e2ff" }}>
                    {statusText || "クイズ・回答・成績・トークン付与・回答報酬・掲示板監視・分析ログなどをまとめて出力できます。"}
                </div>
            </div>

            {lastSummary && (
                <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                    <div className="token-grant-card-title">直近の出力件数</div>
                    <div className="token-grant-status-list detailed">
                        <div className="token-grant-status-badge detailed">出力時刻: {formatDateTime(lastSummary.exportedAt)}</div>
                        <div className="token-grant-status-badge detailed">学生: {lastSummary.students}件</div>
                        <div className="token-grant-status-badge detailed">教員: {lastSummary.teachers}件</div>
                        <div className="token-grant-status-badge detailed">問題: {lastSummary.quizzes}件</div>
                        <div className="token-grant-status-badge detailed">回答: {lastSummary.answers}件</div>
                        <div className="token-grant-status-badge detailed">トークン付与履歴: {lastSummary.tokenGrants}件</div>
                        <div className="token-grant-status-badge detailed">回答報酬履歴: {lastSummary.rewardPayouts}件</div>
                        <div className="token-grant-status-badge detailed">分析ログ: {lastSummary.activityLogs}件</div>
                        <div className="token-grant-status-badge detailed">掲示板監視: {lastSummary.boardLogs}件</div>
                    </div>
                </div>
            )}

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">出力対象</div>
                <div className="token-grant-card-desc">
                    学生一覧、教員一覧、成績、全問題、全回答、トークン付与履歴、回答報酬履歴、分析ログ、掲示板監視、理解度リアクション、授業内お知らせ、練習モード履歴
                </div>
            </div>
        </div>
    );
}

export default Platform_export_panel;
