import { useState, useEffect, useMemo } from "react";
import { Contracts_MetaMask } from "../../contract/contracts";
import { getCourseEnhancementSnapshot } from "../../utils/courseEnhancements";
import { syncRewardPayoutLedgerFromServer } from "../../utils/rewardPayoutLedger";
import { convertTftToPoint, normalizeTftAmount } from "../../utils/quizRewardRate";
import "./ranking.css";

function Ranking() {
    const [results, setResults] = useState(null);
    const [myAddress, setMyAddress] = useState(null);
    const [myRank, setMyRank] = useState(null);
    const [myScore, setMyScore] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rankingMode, setRankingMode] = useState("score");
    const [boardRanking, setBoardRanking] = useState([]);

    const cont = useMemo(() => new Contracts_MetaMask(), []);

    useEffect(() => {
        async function loadData() {
            try {
                await syncRewardPayoutLedgerFromServer().catch(() => []);
                const addr = await cont.get_address();
                setMyAddress(addr);

                // 全生徒の成績を取得（学生のアドレスとスコア）
                const studentResults = await cont.get_results();
                
                if (studentResults && studentResults.length > 0) {
                    // スコアでソート（降順）
                    const sorted = [...studentResults].sort((a, b) => {
                        return Number(b.result) - Number(a.result);
                    });
                    setResults(sorted);

                    // 自分のスコアとランクを計算
                    const myResult = sorted.find(
                        r => r.student && r.student.toLowerCase() === addr.toLowerCase()
                    );
                    if (myResult) {
                        setMyScore(convertTftToPoint(Number(myResult.result || 0)));
                        const idx = sorted.findIndex(
                            r => r.student && r.student.toLowerCase() === addr.toLowerCase()
                        );
                        setMyRank(idx + 1);
                    }
                }

                const snapshot = getCourseEnhancementSnapshot();
                const boardCounts = new Map();
                snapshot.boardLogs
                    .filter((item) => item.status === "visible")
                    .forEach((item) => {
                        const user = String(item.user || "");
                        boardCounts.set(user, (boardCounts.get(user) || 0) + 1);
                    });
                setBoardRanking(
                    [...boardCounts.entries()]
                        .map(([user, count]) => ({ user, count }))
                        .sort((a, b) => b.count - a.count)
                );
            } catch (err) {
                console.error("Ranking load error:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const MEDALS = ["🥇", "🥈", "🥉"];

    if (loading) {
        return (
            <div className="ranking-page">
                <div className="page-header">
                    <h1 className="page-title">🏆 ランキング</h1>
                    <p className="page-subtitle">読み込み中...</p>
                </div>
                <div className="ranking-skeleton">
                    {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className="skeleton-stat-card">
                            <div className="skeleton-line" style={{ width: "80%" }}></div>
                            <div className="skeleton-line" style={{ width: "40%" }}></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="ranking-page">
                <div className="page-header">
                    <h1 className="page-title">🏆 ランキング</h1>
                    <p className="page-subtitle">まだランキングデータがありません</p>
                </div>
            </div>
        );
    }

    const top3 = results.slice(0, 3);
    const visibleRanking = rankingMode === "score" ? results : boardRanking;

    return (
        <div className="ranking-page">
            <div className="page-header">
                <h1 className="page-title">🏆 ランキング</h1>
                <p className="page-subtitle">総合スコアと講義参加の両方を切り替えて確認できます</p>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
                <button className={`admin-tab-btn ${rankingMode === "score" ? "active" : ""}`} onClick={() => setRankingMode("score")}>
                    総合スコア
                </button>
                <button className={`admin-tab-btn ${rankingMode === "board" ? "active" : ""}`} onClick={() => setRankingMode("board")}>
                    掲示板参加
                </button>
            </div>

            {/* My Rank Card */}
            {rankingMode === "score" && myRank !== null && (
                <div className="my-rank-card">
                    <div className="my-rank-left">
                        <span style={{ fontSize: "1.5rem" }}>🎯</span>
                        <div>
                            <div className="my-rank-label">あなたの順位</div>
                            <div className="my-rank-value">{myRank}位 / {results.length}人</div>
                        </div>
                    </div>
                    <div className="my-rank-score">{myScore?.toFixed(1)} pts</div>
                </div>
            )}

            {/* Top 3 Podium */}
            {rankingMode === "score" && top3.length >= 3 && (
                <div className="podium-section">
                    {[1, 0, 2].map(idx => (
                        <div key={idx} className={`podium-item ${idx === 0 ? 'first' : idx === 1 ? 'second' : 'third'}`}>
                            <div className="podium-medal">{MEDALS[idx]}</div>
                            <div className="podium-bar">
                                <div className="podium-score">
                                    {convertTftToPoint(Number(top3[idx].result || 0)).toFixed(1)}
                                </div>
                                <div className="podium-label">
                                    {top3[idx].student 
                                        ? `${top3[idx].student.slice(0, 6)}...` 
                                        : "---"}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Full Ranking List */}
            <div className="ranking-list-card">
                {visibleRanking.map((item, index) => {
                    if (rankingMode === "board") {
                        return (
                            <div key={`${item.user}_${index}`} className="ranking-row">
                                <div className="rank-number">{index < 3 ? MEDALS[index] : index + 1}</div>
                                <div className="rank-info">
                                    <div className="rank-address">{item.user || "匿名"}</div>
                                </div>
                                <div className="rank-score">{item.count} posts</div>
                            </div>
                        );
                    }
                    const isMe = myAddress && item.student && 
                        item.student.toLowerCase() === myAddress.toLowerCase();
                    const score = convertTftToPoint(Number(item.result || 0));
                    
                    return (
                        <div key={index} className={`ranking-row ${isMe ? 'highlight' : ''}`}>
                            <div className="rank-number">
                                {index < 3 ? MEDALS[index] : index + 1}
                            </div>
                            <div className="rank-info">
                                <div className="rank-address">
                                    {isMe ? "👤 あなた" : item.student}
                                </div>
                            </div>
                            <div className="rank-score">{normalizeTftAmount(item.result).toFixed(1)} TFT / {score.toFixed(1)} pts</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default Ranking;
