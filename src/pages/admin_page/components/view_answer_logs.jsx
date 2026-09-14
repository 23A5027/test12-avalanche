import React, { useMemo } from "react";
import { ACTION_TYPES, formatActionLabel, formatDateTime, getActivityLogs } from "../../../utils/activityLog";
import "./activity_logs.css";

function View_answer_logs() {
    const logs = useMemo(
        () =>
            [
                ...getActivityLogs(ACTION_TYPES.ANSWER_VIEWED),
                ...getActivityLogs(ACTION_TYPES.ANSWER_STARTED),
                ...getActivityLogs(ACTION_TYPES.ANSWER_SUBMITTED),
                ...getActivityLogs(ACTION_TYPES.ANSWER_SUBMIT_FAILED),
            ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        []
    );

    const submittedLogs = logs.filter((log) => log.action === ACTION_TYPES.ANSWER_SUBMITTED);
    const avgSolveTime = submittedLogs.length
        ? Math.round(submittedLogs.reduce((sum, log) => sum + Number(log.solvingDurationSeconds || 0), 0) / submittedLogs.length)
        : 0;

    return (
        <div className="log-section">
            <h3 className="section-title">解答ログ</h3>
            <p className="section-desc">問題閲覧、解答開始、送信結果、解答時間を確認できます。</p>

            <div className="log-summary-grid">
                <div className="log-summary-card"><div className="log-summary-label">総件数</div><div className="log-summary-value">{logs.length}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">送信完了</div><div className="log-summary-value">{submittedLogs.length}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">平均解答時間</div><div className="log-summary-value">{avgSolveTime}秒</div></div>
            </div>

            {logs.length === 0 ? (
                <div className="log-empty">このブラウザには解答ログがありません。</div>
            ) : (
                <div className="results-table-wrap">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>操作</th>
                                <th>問題</th>
                                <th>アドレス</th>
                                <th>閲覧開始</th>
                                <th>解答開始</th>
                                <th>送信時刻</th>
                                <th>総経過時間(秒)</th>
                                <th>解答時間(秒)</th>
                                <th>解答内容 / エラー</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td>{formatActionLabel(log.action)}</td>
                                    <td>{log.quizTitle || `問題 ${log.quizId || "-"}`}</td>
                                    <td className="address-cell">{log.address || "-"}</td>
                                    <td>{formatDateTime(log.openedAt || (log.action === ACTION_TYPES.ANSWER_VIEWED ? log.createdAt : null))}</td>
                                    <td>{formatDateTime(log.startedAt || (log.action === ACTION_TYPES.ANSWER_STARTED ? log.createdAt : null))}</td>
                                    <td>{formatDateTime(log.submittedAt)}</td>
                                    <td>{log.totalDurationSeconds ?? "-"}</td>
                                    <td>{log.solvingDurationSeconds ?? "-"}</td>
                                    <td className="log-message">{log.answer || log.errorMessage || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default View_answer_logs;
