import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { getAnnouncements, subscribeAnnouncements } from "../../utils/courseEnhancements";
import { useAccessControl } from "../../utils/accessControl";
import { convertTftToPoint } from "../../utils/quizRewardRate";
import { getDeletedQuizzes, normalizeDeletedQuizKey } from "../../utils/liveSignalApi";
import { syncRewardPayoutLedgerFromServer } from "../../utils/rewardPayoutLedger";
import "./dashboard.css";

function Dashboard() {
    const [address, setAddress] = useState(null);
    const [balance, setBalance] = useState(null);
    const [rank, setRank] = useState(null);
    const [scoreTft, setScoreTft] = useState(0);
    const [quizTotal, setQuizTotal] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [announcements, setAnnouncements] = useState(() => getAnnouncements().slice(0, 3));

    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);

    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            try {
                setLoadError("");
                await syncRewardPayoutLedgerFromServer().catch(() => []);
                const addr = access.address || cont.get_last_known_address?.() || await cont.get_address();
                if (cancelled) return;
                setAddress(addr || "");

                const [balanceResult, quizLengthResult, userResult] = await Promise.allSettled([
                    addr ? cont.get_token_balance(addr) : Promise.resolve(0),
                    cont.get_quiz_lenght(),
                    addr ? cont.get_user_data(addr) : Promise.resolve(["", "", 0, false]),
                ]);

                if (cancelled) return;

                const bal = balanceResult.status === "fulfilled" ? balanceResult.value : 0;
                const quizLength = quizLengthResult.status === "fulfilled" ? Number(quizLengthResult.value || 0) : 0;
                const user = userResult.status === "fulfilled" ? userResult.value : ["", "", 0, false];

                setBalance(Number(bal || 0));
                setQuizTotal(quizLength);
                setUserData(user || ["", "", 0, false]);
                setLoading(false);

                // 全クイズ参照は重いので、表示後に同期する
                Promise.all([cont.getQuizInventory(), getDeletedQuizzes()])
                    .then(([inventory, deletedQuizzes]) => {
                        if (cancelled) return;
                        const visibleQuizTotal = (Array.isArray(inventory) ? inventory : []).filter((quiz) => {
                            const quizKey = normalizeDeletedQuizKey(`${quiz?.address || ""}:${Number(quiz?.id)}`);
                            return !deletedQuizzes?.[quizKey];
                        }).length;
                        setQuizTotal(visibleQuizTotal);
                    })
                    .catch((error) => {
                        console.error("Failed to sync deleted quizzes on dashboard", error);
                    });

                Promise.all([
                    cont.get_quiz_reward_tft(addr || ""),
                ])
                    .then(([nextScoreTft]) => {
                        if (cancelled) return;
                        const normalizedScore = Number(nextScoreTft || 0);
                        setScoreTft(normalizedScore);
                        if (normalizedScore <= 0) {
                            setRank(0);
                            return;
                        }
                        return cont.get_rank(normalizedScore).then((nextRank) => {
                            if (!cancelled) {
                                setRank(Number(nextRank || 0));
                            }
                        });
                    })
                    .catch((error) => {
                        console.error("Dashboard rank load error:", error);
                    });
            } catch (err) {
                console.error("Dashboard load error:", err);
                if (!cancelled) {
                    setLoadError("ダッシュボードの読み込みに失敗しました。再読み込みしてください。");
                    setBalance(0);
                    setScoreTft(0);
                    setQuizTotal(0);
                    setUserData(["", "", 0, false]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        loadData();

        return () => {
            cancelled = true;
        };
    }, [access.address, cont]);

    useEffect(() => {
        const sync = () => setAnnouncements(getAnnouncements().slice(0, 3));
        const unsubscribe = subscribeAnnouncements(sync);
        sync();
        return unsubscribe;
    }, []);

    const shortAddress = address
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : "---";

    const pointScore = convertTftToPoint(scoreTft);

    if (loading) {
        return (
            <div className="dashboard-page">
                <div className="page-header">
                    <h1 className="page-title">📊 ダッシュボード</h1>
                    <p className="page-subtitle">読み込み中...</p>
                </div>
                <div className="dashboard-skeleton">
                    <div className="skeleton-stat-grid">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="skeleton-stat-card">
                                <div className="skeleton-line" style={{ width: "30%" }}></div>
                                <div className="skeleton-line large"></div>
                                <div className="skeleton-line" style={{ width: "60%" }}></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <div className="page-header">
                <h1 className="page-title">📊 ダッシュボード</h1>
                <p className="page-subtitle">あなたの学習状況の概要</p>
            </div>

            {loadError ? (
                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)", color: "#fff" }}>
                    <div style={{ fontWeight: 700 }}>{loadError}</div>
                </div>
            ) : null}

            {/* Welcome Card */}
            <div className="welcome-card">
                <div className="welcome-avatar">👤</div>
                <div className="welcome-info">
                    <h2>ようこそ！</h2>
                    <span className="welcome-address">{address}</span>
                    <div style={{ color: "rgba(255,255,255,0.7)", marginTop: "6px" }}>利用区分: {access.roleLabel}</div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card cyan">
                    <div className="stat-card-icon">💰</div>
                    <div className="stat-card-value">
                        {balance !== null ? balance.toFixed(2) : "---"}
                    </div>
                    <div className="stat-card-label">TFT トークン残高</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-card-icon">🏆</div>
                    <div className="stat-card-value">
                        {rank !== null ? `${rank}位` : "---"}
                    </div>
                    <div className="stat-card-label">全体ランキング</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-card-icon">📝</div>
                    <div className="stat-card-value">
                        {quizTotal !== null ? quizTotal : "---"}
                    </div>
                    <div className="stat-card-label">クイズ総数</div>
                </div>

                <div className="stat-card yellow">
                    <div className="stat-card-icon">⭐</div>
                    <div className="stat-card-value">
                        {pointScore > 0 ? pointScore.toFixed(1) : "0"}
                    </div>
                    <div className="stat-card-label">獲得点数</div>
                </div>
            </div>

            {/* Quick Actions */}
            <h3 className="section-header">クイックアクション</h3>
            <div className="quick-actions">
                <Link to="/list_quiz" className="action-card">
                    <div className="action-icon cyan">📋</div>
                    <span className="action-text">クイズに挑戦</span>
                </Link>

                <Link to="/ranking" className="action-card">
                    <div className="action-icon purple">🏅</div>
                    <span className="action-text">ランキングを見る</span>
                </Link>

                {access.isTeacher && (
                    <Link to="/create_quiz" className="action-card">
                        <div className="action-icon green">✏️</div>
                        <span className="action-text">クイズを作成</span>
                    </Link>
                )}

                <Link to={`/user_page/${address}`} className="action-card">
                    <div className="action-icon yellow">👤</div>
                    <span className="action-text">マイページ</span>
                </Link>
            </div>

            <h3 className="section-header">授業内お知らせ</h3>
            <div className="glass-card" style={{ padding: "var(--space-5)" }}>
                {announcements.length === 0 ? (
                    <div style={{ color: "rgba(255,255,255,0.7)" }}>現在表示中のお知らせはありません。</div>
                ) : (
                    <div style={{ display: "grid", gap: "14px" }}>
                        {announcements.map((item) => (
                            <div key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
                                <div style={{ fontWeight: 700, color: "#fff" }}>{item.title}</div>
                                <div style={{ color: "rgba(255,255,255,0.8)", marginTop: "6px", whiteSpace: "pre-wrap" }}>{item.body}</div>
                                <div style={{ color: "rgba(255,255,255,0.55)", marginTop: "6px", fontSize: "13px" }}>
                                    {new Date(item.createdAt).toLocaleString("ja-JP")} / {item.author}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
