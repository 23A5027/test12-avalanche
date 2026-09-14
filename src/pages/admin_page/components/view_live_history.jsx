import React, { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "../../../utils/activityLog";
import { getBoardLogs, subscribeToBoardLogs } from "../../../utils/boardModerationLog";
import "./activity_logs.css";

const REACTION_HISTORY_KEY = "board_reaction_history_snapshot_v1";

function getReactionHistorySnapshot() {
    try {
        const raw = localStorage.getItem(REACTION_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
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

function View_live_history() {
    const [logs, setLogs] = useState(() => getBoardLogs());
    const [reactionHistory, setReactionHistory] = useState(() => getReactionHistorySnapshot());
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    useEffect(() => {
        const sync = () => setLogs(getBoardLogs());
        const unsubscribe = subscribeToBoardLogs(sync);
        sync();
        return unsubscribe;
    }, []);

    useEffect(() => {
        const sync = () => setReactionHistory(getReactionHistorySnapshot());
        window.addEventListener("storage", sync);
        window.addEventListener("board-reaction-history-updated", sync);
        sync();
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("board-reaction-history-updated", sync);
        };
    }, []);

    const filteredLogs = useMemo(() => {
        const query = search.trim().toLowerCase();
        return logs.filter((item) => {
            if (statusFilter !== "all" && item.status !== statusFilter) return false;
            if (!query) return true;

            const haystack = [
                item.user,
                item.text,
                item.reason,
                ...(item.categories || []),
            ].join(" ").toLowerCase();

            return haystack.includes(query);
        });
    }, [logs, search, statusFilter]);

    const visibleCount = logs.filter((item) => item.status === "visible").length;
    const blockedCount = logs.filter((item) => item.status === "blocked").length;
    const superchatCount = logs.filter((item) => item.type === "superchat" && item.status === "visible").length;
    const questionCount = logs.filter((item) => item.messageKind === "question" && item.status === "visible").length;

    const exportBoardRows = useMemo(() => (
        filteredLogs.map((item) => ({
            createdAt: formatDateTime(item.createdAt),
            status: item.status === "blocked" ? "ブロック" : "表示済み",
            type: item.type === "superchat" ? "スーパーチャット" : "コメント",
            messageKind: item.messageKind === "question" ? "質問" : "通常",
            user: item.isAnonymous ? "匿名質問" : (item.user || "-"),
            amount: item.type === "superchat" ? `${item.amount || 0} TTT` : "-",
            likeCount: item.likeCount || 0,
            text: item.text || "-",
            reason: item.reason || "-",
            categories: item.categories?.join(", ") || "-",
        }))
    ), [filteredLogs]);

    const handleExportBoardJson = () => {
        downloadTextFile(
            "board_moderation_logs.json",
            JSON.stringify(exportBoardRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const handleExportBoardCsv = () => {
        const rows = [
            ["時刻", "状態", "種類", "投稿形式", "ユーザー", "金額", "支持", "本文", "理由", "カテゴリ"],
            ...exportBoardRows.map((row) => [
                row.createdAt,
                row.status,
                row.type,
                row.messageKind,
                row.user,
                row.amount,
                row.likeCount,
                row.text,
                row.reason,
                row.categories,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
        downloadTextFile("board_moderation_logs.csv", csv, "text/csv;charset=utf-8");
    };

    return (
        <div className="log-section">
            <h3 className="section-title">掲示板監視</h3>
            <p className="section-desc">
                掲示板で共有されたコメント、質問、支持数、不適切コメント候補を確認できます。
            </p>

            <div className="log-summary-grid">
                <div className="log-summary-card"><div className="log-summary-label">総記録数</div><div className="log-summary-value">{logs.length}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">表示済み</div><div className="log-summary-value">{visibleCount}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">ブロック</div><div className="log-summary-value">{blockedCount}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">スーパーチャット</div><div className="log-summary-value">{superchatCount}</div></div>
                <div className="log-summary-card"><div className="log-summary-label">質問</div><div className="log-summary-value">{questionCount}</div></div>
            </div>

            <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                <button className="btn-action" onClick={handleExportBoardCsv}>📤 掲示板監視を CSV 出力</button>
                <button className="btn-action" onClick={handleExportBoardJson}>📤 掲示板監視を JSON 出力</button>
            </div>

            <div className="glass-card" style={{ padding: "16px", marginBottom: "16px" }}>
                <h4 className="section-title" style={{ marginBottom: "12px" }}>授業別リアクション履歴</h4>
                {reactionHistory.length === 0 ? (
                    <div className="log-empty">まだ授業別リアクション履歴はありません。</div>
                ) : (
                    <div className="results-table-wrap">
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th>授業名</th>
                                    <th>開始</th>
                                    <th>終了</th>
                                    <th>総押下</th>
                                    <th>わかった</th>
                                    <th>もう一度</th>
                                    <th>ゆっくり</th>
                                    <th>速い</th>
                                    <th>最近の押下ログ</th>
                                    <th>時間帯ごとの集計</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reactionHistory.map((session) => (
                                    <tr key={session.id}>
                                        <td>{session.label || "-"}</td>
                                        <td>{formatDateTime(session.startedAt)}</td>
                                        <td>{formatDateTime(session.endedAt)}</td>
                                        <td>{session.totalReactionCount || 0}</td>
                                        <td>{session.reactions?.understood || 0}</td>
                                        <td>{session.reactions?.repeat || 0}</td>
                                        <td>{session.reactions?.slow || 0}</td>
                                        <td>{session.reactions?.fast || 0}</td>
                                        <td className="log-message">
                                            {(session.recentReactionEvents || []).length === 0
                                                ? "-"
                                                : session.recentReactionEvents
                                                    .slice(-5)
                                                    .map((event) => `${formatDateTime(event.at)} ${event.displayName || "-"}: ${event.reaction}`)
                                                    .join(" / ")}
                                        </td>
                                        <td className="log-message">
                                            {(session.reactionTimeline || []).length === 0
                                                ? "-"
                                                : session.reactionTimeline
                                                    .slice(-8)
                                                    .map((bucket) => `${formatDateTime(bucket.time)} わかった${bucket.understood} もう一度${bucket.repeat} ゆっくり${bucket.slow} 速い${bucket.fast} 合計${bucket.total}`)
                                                    .join(" / ")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="glass-card" style={{ padding: "16px", marginBottom: "16px", display: "grid", gap: "12px" }}>
                <input
                    className="form-control-custom"
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ユーザー名、本文、理由で検索"
                />
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className={`admin-tab-btn ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>すべて</button>
                    <button className={`admin-tab-btn ${statusFilter === "visible" ? "active" : ""}`} onClick={() => setStatusFilter("visible")}>表示済み</button>
                    <button className={`admin-tab-btn ${statusFilter === "blocked" ? "active" : ""}`} onClick={() => setStatusFilter("blocked")}>ブロック</button>
                </div>
            </div>

            {filteredLogs.length === 0 ? (
                <div className="log-empty">該当する掲示板ログはありません。</div>
            ) : (
                <div className="results-table-wrap">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>時刻</th>
                                <th>状態</th>
                                <th>種類</th>
                                <th>投稿形式</th>
                                <th>ユーザー</th>
                                <th>金額</th>
                                <th>支持</th>
                                <th>本文</th>
                                <th>理由 / カテゴリ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map((item) => (
                                <tr key={item.id}>
                                    <td>{formatDateTime(item.createdAt)}</td>
                                    <td>{item.status === "blocked" ? "ブロック" : "表示済み"}</td>
                                    <td>{item.type === "superchat" ? "スーパーチャット" : "コメント"}</td>
                                    <td>{item.messageKind === "question" ? "質問" : "通常"}</td>
                                    <td>{item.isAnonymous ? "匿名質問" : (item.user || "-")}</td>
                                    <td>{item.type === "superchat" ? `${item.amount || 0} TTT` : "-"}</td>
                                    <td>{item.likeCount || 0}</td>
                                    <td className="log-message">{item.text || "-"}</td>
                                    <td className="log-message">
                                        {item.reason || "-"}
                                        {item.categories?.length ? ` / ${item.categories.join(", ")}` : ""}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default View_live_history;
