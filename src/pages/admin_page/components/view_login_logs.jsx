import React, { useMemo } from "react";
import { ACTION_TYPES, formatActionLabel, formatDateTime, getActivityLogs } from "../../../utils/activityLog";
import "./activity_logs.css";

function View_login_logs() {
    const logs = useMemo(
        () => [...getActivityLogs(ACTION_TYPES.LOGIN_SUCCESS), ...getActivityLogs(ACTION_TYPES.LOGIN_FAILURE)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        []
    );

    const successCount = logs.filter((log) => log.action === ACTION_TYPES.LOGIN_SUCCESS).length;
    const failureCount = logs.filter((log) => log.action === ACTION_TYPES.LOGIN_FAILURE).length;

    return (
        <div className="log-section">
            <h3 className="section-title">ログインログ</h3>
            <p className="section-desc">このブラウザでのウォレット接続成功・失敗履歴です。</p>

            <div className="log-summary-grid">
                <div className="log-summary-card"><div className="log-summary-label">総件数</div><div className="log-summary-value">{logs.length}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">成功</div><div className="log-summary-value">{successCount}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">失敗</div><div className="log-summary-value">{failureCount}</div></div>
            </div>

            {logs.length === 0 ? (
                <div className="log-empty">このブラウザにはログインログがありません。</div>
            ) : (
                <div className="results-table-wrap">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>時刻</th>
                                <th>操作</th>
                                <th>アドレス</th>
                                <th>ウォレット</th>
                                <th>エラー</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td>{formatDateTime(log.createdAt)}</td>
                                    <td>{formatActionLabel(log.action)}</td>
                                    <td className="address-cell">{log.address || "-"}</td>
                                    <td>{log.wallet || "-"}</td>
                                    <td className="log-message">{log.errorMessage || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default View_login_logs;
