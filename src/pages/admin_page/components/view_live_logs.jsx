import React, { useMemo } from "react";
import { ACTION_TYPES, formatActionLabel, formatDateTime, getActivityLogs } from "../../../utils/activityLog";
import "./activity_logs.css";

function View_live_logs() {
    const logs = useMemo(
        () => [...getActivityLogs(ACTION_TYPES.LIVE_COMMENT), ...getActivityLogs(ACTION_TYPES.LIVE_SUPERCHAT)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        []
    );

    const commentCount = logs.filter((log) => log.action === ACTION_TYPES.LIVE_COMMENT).length;
    const superchatCount = logs.filter((log) => log.action === ACTION_TYPES.LIVE_SUPERCHAT).length;

    return (
        <div className="log-section">
            <h3 className="section-title">ライブログ</h3>
            <p className="section-desc">ライブコメントとスーパーチャットの時刻・内容を確認できます。</p>

            <div className="log-summary-grid">
                <div className="log-summary-card"><div className="log-summary-label">総件数</div><div className="log-summary-value">{logs.length}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">コメント数</div><div className="log-summary-value">{commentCount}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">スーパーチャット数</div><div className="log-summary-value">{superchatCount}</div></div>
            </div>

            {logs.length === 0 ? (
                <div className="log-empty">このブラウザにはライブログがありません。</div>
            ) : (
                <div className="results-table-wrap">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>時刻</th>
                                <th>種類</th>
                                <th>アドレス</th>
                                <th>金額</th>
                                <th>内容</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td>{formatDateTime(log.createdAt)}</td>
                                    <td>{formatActionLabel(log.action)}</td>
                                    <td className="address-cell">{log.address || "-"}</td>
                                    <td>{log.amount || "-"}</td>
                                    <td className="log-message">{log.content || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default View_live_logs;
