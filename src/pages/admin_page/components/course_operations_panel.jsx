import React, { useEffect, useMemo, useState } from "react";
import { ACTION_TYPES, appendActivityLog, formatDateTime, getActivityLogs } from "../../../utils/activityLog";
import { buildFraudAlerts, buildWeaknessSummary, getCourseEnhancementSnapshot } from "../../../utils/courseEnhancements";

function HeatCell({ value, label }) {
    const opacity = Math.min(1, 0.15 + value / 20);
    return (
        <div
            title={`${label}: ${value}`}
            style={{
                minHeight: "64px",
                borderRadius: "14px",
                padding: "10px",
                background: `rgba(34, 211, 238, ${opacity})`,
                color: "#fff",
                display: "flex",
                alignItems: "end",
                justifyContent: "space-between",
                gap: "8px",
            }}
        >
            <span style={{ fontSize: "12px", opacity: 0.9 }}>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function Course_operations_panel({ cont }) {
    const [students, setStudents] = useState([]);
    const [quizzes, setQuizzes] = useState([]);
    const [snapshot, setSnapshot] = useState(() => getCourseEnhancementSnapshot());
    const [showAllWeakness, setShowAllWeakness] = useState(false);

    useEffect(() => {
        appendActivityLog(ACTION_TYPES.ADMIN_TA_HELPER_VIEWED, { page: "admin", panel: "course_operations" });
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const [studentList, nextQuizzes] = await Promise.all([
                    cont?.get_student_list?.(),
                    cont?.get_all_quiz_simple_list?.(),
                ]);
                if (!active) return;
                setStudents(Array.isArray(studentList) ? studentList : []);
                if (!active) return;
                setQuizzes(Array.isArray(nextQuizzes) ? nextQuizzes : []);
                setSnapshot(getCourseEnhancementSnapshot());
            } catch (error) {
                console.error("Failed to load course operations panel", error);
            }
        };
        load();
        const interval = window.setInterval(() => {
            setSnapshot(getCourseEnhancementSnapshot());
        }, 3000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [cont]);

    const unansweredQuizzes = useMemo(() => quizzes
        .map((quiz) => ({
            id: Number(quiz?.[0] || 0),
            title: quiz?.[2] || "-",
            respondents: Number(quiz?.[8] || 0),
            limit: Number(quiz?.[9] || students.length || 0),
        }))
        .sort((a, b) => (a.respondents / Math.max(a.limit, 1)) - (b.respondents / Math.max(b.limit, 1)))
        .slice(0, 6), [quizzes, students.length]);

    const topQuestions = useMemo(() => snapshot.boardLogs
        .filter((item) => item.messageKind === "question" && item.status === "visible")
        .sort((a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0))
        .slice(0, 5), [snapshot.boardLogs]);

    const weaknessSummary = useMemo(
        () => buildWeaknessSummary({ quizzes, logs: getActivityLogs(), reactionHistory: snapshot.reactionHistory }),
        [quizzes, snapshot.reactionHistory]
    );

    const fraudAlerts = useMemo(() => buildFraudAlerts(getActivityLogs()), [snapshot]);
    const blockedComments = snapshot.boardLogs.filter((item) => item.status === "blocked").slice(0, 8);
    const scheduleItems = quizzes
        .map((quiz) => {
            const now = Math.floor(Date.now() / 1000);
            const start = Number(quiz?.[5] || 0);
            const deadline = Number(quiz?.[6] || 0);
            let state = "公開中";
            if (now < start) state = "公開予約";
            if (now > deadline) state = "締切済み";
            return {
                id: Number(quiz?.[0] || 0),
                title: quiz?.[2] || "-",
                start,
                deadline,
                state,
            };
        })
        .sort((a, b) => a.start - b.start);

    return (
        <div style={{ display: "grid", gap: "20px" }}>
            <div className="analytics-grid">
                <div className="analytics-card"><div className="analytics-label">登録学生</div><div className="analytics-value">{students.length}</div></div>
                <div className="analytics-card"><div className="analytics-label">公開中の課題</div><div className="analytics-value">{scheduleItems.filter((item) => item.state === "公開中").length}</div></div>
                <div className="analytics-card"><div className="analytics-label">要確認コメント</div><div className="analytics-value">{blockedComments.length}</div></div>
                <div className="analytics-card"><div className="analytics-label">不正検知候補</div><div className="analytics-value">{fraudAlerts.length}</div></div>
            </div>

            <div className="analytics-workspace">
                <div className="analytics-log-list glass-card">
                    <div className="analytics-panel-header"><strong>TA補助画面</strong><span>未回答 / 要監視 / 注目質問</span></div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">未回答が多い課題</div>
                        <div className="analytics-mini-table">
                            {unansweredQuizzes.map((item) => (
                                <div key={item.id} className="analytics-mini-row">
                                    <span>#{item.id} {item.title}</span>
                                    <strong>{item.respondents}/{item.limit}</strong>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">支持の多い質問</div>
                        <div className="analytics-mini-table">
                            {topQuestions.length === 0 ? <div className="analytics-empty">まだ質問はありません。</div> : topQuestions.map((item) => (
                                <div key={item.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                    <span style={{ maxWidth: "80%" }}>{item.text}</span>
                                    <strong>{item.likeCount || 0}</strong>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">ブロックされたコメント</div>
                        <div className="analytics-mini-table">
                            {blockedComments.length === 0 ? <div className="analytics-empty">直近のブロックはありません。</div> : blockedComments.map((item) => (
                                <div key={item.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                    <span style={{ maxWidth: "78%" }}>{item.text || "(本文なし)"}</span>
                                    <strong>{item.reason || "blocked"}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="analytics-log-detail glass-card">
                    <div className="analytics-panel-header"><strong>学習分析と運営補助</strong><span>弱点 / ヒートマップ / 予約公開</span></div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">弱点分析ダッシュボード</div>
                        <div className="results-table-wrap">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th>課題</th>
                                        <th>回答率</th>
                                        <th>回答数</th>
                                        <th>平均解答秒</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(showAllWeakness ? weaknessSummary.quizzes : weaknessSummary.quizzes.slice(0, 8)).map((item) => (
                                        <tr key={item.quizId}>
                                            <td>#{item.quizId} {item.title}</td>
                                            <td>{item.responseRate}%</td>
                                            <td>{item.respondents}</td>
                                            <td>{item.avgDurationLabel}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {weaknessSummary.quizzes.length > 8 ? (
                            <button
                                type="button"
                                className="btn-action"
                                style={{ marginTop: "12px" }}
                                onClick={() => setShowAllWeakness((current) => !current)}
                            >
                                {showAllWeakness ? "問題一覧を折りたたむ" : `すべての問題を表示 (${weaknessSummary.quizzes.length}件)`}
                            </button>
                        ) : null}
                    </div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">理解度ヒートマップ</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                            {snapshot.reactionHistory.slice(0, 8).map((session) => (
                                <HeatCell
                                    key={session.id}
                                    label={session.label || formatDateTime(session.startedAt)}
                                    value={(session.reactions?.repeat || 0) + (session.reactions?.slow || 0)}
                                />
                            ))}
                            {snapshot.reactionHistory.length === 0 ? <div className="analytics-empty">リアクション履歴がまだありません。</div> : null}
                        </div>
                    </div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">課題ごとの公開 / 非公開予約</div>
                        <div className="analytics-mini-table">
                            {scheduleItems.map((item) => (
                                <div key={item.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                    <span style={{ maxWidth: "65%" }}>#{item.id} {item.title}</span>
                                    <strong>{item.state}</strong>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="analytics-detail-block">
                        <div className="analytics-label">不正検知補助</div>
                        <div className="analytics-mini-table">
                            {fraudAlerts.length === 0 ? <div className="analytics-empty">異常候補は検出されていません。</div> : fraudAlerts.map((item) => (
                                <div key={item.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                    <span>{item.title}</span>
                                    <strong>{item.level}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Course_operations_panel;
