import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import "./user_page.css";
import History_list from "./component/history_list";
import User_card from "./component/user_card";
import { useRef } from "react";
import { buildBadgeSet, getCourseEnhancementSnapshot } from "../../utils/courseEnhancements";
import { bootstrap_teacher_addresses, token_address, ttt_token_address } from "../../contract/config";
import { MAX_TFT_PER_LECTURE, MAX_TFT_TOTAL, QUIZ_RATE_OPTIONS, TOTAL_LECTURE_COUNT, TFT_PER_POINT } from "../../utils/quizRewardRate";
import { buildAnswerQuizPath, buildAnswerQuizState, rememberQuizSource } from "../../utils/quizLinks";
import { syncRewardPayoutLedgerFromServer } from "../../utils/rewardPayoutLedger";

const BALANCE_CACHE_SCOPE = [token_address, ttt_token_address]
    .map((value) => String(value || "").toLowerCase())
    .join("_");
const BALANCE_CACHE_KEY = `user_page_balance_cache_v1_${BALANCE_CACHE_SCOPE}`;

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function isBootstrapTeacherAddress(address) {
    const normalizedTarget = normalizeAddress(address);
    if (!normalizedTarget) return false;
    return (bootstrap_teacher_addresses || []).some(
        (teacherAddress) => normalizeAddress(teacherAddress) === normalizedTarget
    );
}

function readBalanceCache() {
    try {
        return JSON.parse(localStorage.getItem(BALANCE_CACHE_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

function writeBalanceCache(address, nextValues) {
    const current = readBalanceCache();
    current[normalizeAddress(address)] = {
        ...(current[normalizeAddress(address)] || {}),
        ...nextValues,
    };
    localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(current));
}

function getCachedBalances(address) {
    const cache = readBalanceCache();
    return cache[normalizeAddress(address)] || {};
}

function buildReviewItemsFromSources({ reviewQuizIds = [], reviewQuizzes = [], practiceAttempts = [] }) {
    const practiceMap = new Map();
    practiceAttempts.forEach((item) => {
        const quizId = String(item.quizId || "");
        if (!quizId || practiceMap.has(quizId)) return;
        if (item.isCorrect) return;
        practiceMap.set(quizId, item);
    });

    const reviewItems = [];
    const addedKeys = new Set();

    reviewQuizzes.forEach((quiz) => {
        const quizId = String(Number(quiz?.[0] ?? ""));
        if (!quizId || addedKeys.has(quizId)) return;
        addedKeys.add(quizId);
        reviewItems.push({
            quizId,
            sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
            title: quiz?.[2] || `問題 ${quizId}`,
            reason: reviewQuizIds.includes(Number(quizId)) ? "不正解だった問題" : "練習モードで再確認が必要",
        });
    });

    practiceMap.forEach((attempt, quizId) => {
        if (addedKeys.has(quizId)) return;
        reviewItems.push({
            quizId,
            sourceAddress: "",
            title: attempt.title || `問題 ${quizId}`,
            reason: "練習モードで再確認が必要",
        });
    });

    return reviewItems;
}

function User_page(props) {
    const { address } = useParams();

    const [icons, SetIcons] = useState(null);
    const [user_name, Setuser_name] = useState(null);
    const [result, SetResult] = useState(null);
    const [token, Set_token] = useState(null);
    const [state, Set_state] = useState(null);
    const [rank, setRank] = useState(null);
    const [num_of_student, setNum_of_student] = useState(null);
    const [history_sum, Set_history_sum] = useState(null);
    const [tttBalance, setTttBalance] = useState(0);
    const [roleInfo, setRoleInfo] = useState({ key: "guest", label: "未登録" });
    const [registrationInfo, setRegistrationInfo] = useState({ registered: false, addedBy: "", addedAt: 0 });
    const [connectedAddress, setConnectedAddress] = useState("");
    const [loadError, setLoadError] = useState("");
    const [reviewItems, setReviewItems] = useState([]);
    const [badges, setBadges] = useState([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const now_numRef = useRef(0);
    const targetRef = useRef(null);

    const cont = useMemo(() => props.cont || new Contracts_MetaMask(), [props.cont]);
    const [history_list, Set_history_list] = useState([]);

    const loadInitialData = async () => {
        try {
            setLoadError("");
            setIsPageLoading(true);
            await syncRewardPayoutLedgerFromServer().catch(() => []);
            Set_history_list([]);
            setReviewItems([]);

            const cachedBalances = getCachedBalances(address);
            if (cachedBalances.token != null) {
                Set_token(cachedBalances.token);
            }
            if (cachedBalances.tttBalance != null) {
                setTttBalance(cachedBalances.tttBalance);
            }

            const snapshot = getCourseEnhancementSnapshot();
            const ownLogs = snapshot.activityLogs.filter((log) => String(log.actor || log.address || "").toLowerCase() === String(address || "").toLowerCase());
            const ownPractice = snapshot.practiceAttempts.filter((item) => String(item.address || "").toLowerCase() === String(address || "").toLowerCase());
            setBadges(buildBadgeSet({ logs: ownLogs, boardLogs: snapshot.boardLogs, practiceAttempts: ownPractice }));

            const [
                nextTokenBalance,
                nextTttBalance,
                nextScoreTft,
                user,
                nextRoleInfo,
                nextRegistrationInfo,
                nextConnectedAddress,
                historyLength,
                studentCount,
            ] = await Promise.all([
                cont.get_token_balance(address),
                cont.get_ttt_balance(address),
                cont.get_quiz_reward_tft(address),
                cont.get_user_data(address),
                cont.getUserRole(address),
                cont.getRegistrationDetails(address),
                cont.get_address(),
                cont.get_user_history_len(address),
                cont.get_num_of_students(),
            ]);

            const resolvedTokenBalance = nextTokenBalance ?? cachedBalances.token ?? token ?? 0;
            const resolvedTttBalance = nextTttBalance ?? cachedBalances.tttBalance ?? tttBalance ?? 0;
            Set_token(Number(resolvedTokenBalance || 0));
            setTttBalance(Number(resolvedTttBalance || 0));
            writeBalanceCache(address, {
                token: Number(resolvedTokenBalance || 0),
                tttBalance: Number(resolvedTttBalance || 0),
                updatedAt: new Date().toISOString(),
            });

            let [user_name, image, nextResultWei, state] = user || ["", "", 0, false];
            const bootstrapTeacher = isBootstrapTeacherAddress(address);
            Setuser_name(user_name);
            SetIcons(image);
            SetResult(Number(nextScoreTft || 0));
            setNum_of_student(Number(studentCount || 0));
            Set_state(state);
            setRoleInfo(
                bootstrapTeacher
                    ? { key: "teacher", label: "教員" }
                    : (nextRoleInfo || { key: "guest", label: "未登録" })
            );
            setRegistrationInfo(
                bootstrapTeacher
                    ? { registered: true, addedBy: address, addedAt: 0 }
                    : (nextRegistrationInfo || { registered: false, addedBy: "", addedAt: 0 })
            );
            setConnectedAddress(nextConnectedAddress || "");

            Set_history_sum(Number(historyLength || 0));
            now_numRef.current = Number(historyLength || 0);
        } catch (error) {
            console.error("Failed to load user page", error);
            Set_history_sum(0);
            now_numRef.current = 0;
            setLoadError("マイページの読み込みに失敗しました。通信状態を確認して再読み込みしてください。");
        } finally {
            setIsPageLoading(false);
        }
    };

    useEffect(() => {
        loadInitialData();
        // address changes when another profile page is opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    useEffect(() => {
        let cancelled = false;

        async function loadDeferredData() {
            try {
                const snapshot = getCourseEnhancementSnapshot();
                const ownPractice = snapshot.practiceAttempts.filter((item) => String(item.address || "").toLowerCase() === String(address || "").toLowerCase());
                const practiceIncorrectQuizIds = ownPractice
                    .filter((item) => !item.isCorrect)
                    .map((item) => Number(item.quizId))
                    .filter((quizId) => Number.isFinite(quizId));

                const [reviewQuizIds, nextRank] = await Promise.all([
                    cont.getReviewQuizIds(address),
                    Number(result || 0) > 0 ? cont.get_rank(Number(result || 0)) : Promise.resolve(0),
                ]);
                const targetQuizIds = [...new Set([...(Array.isArray(reviewQuizIds) ? reviewQuizIds : []), ...practiceIncorrectQuizIds])];
                const reviewQuizzes = await Promise.all(
                    targetQuizIds.slice(0, 30).map((quizId) => cont.get_quiz_simple(quizId))
                );

                if (cancelled) return;
                setRank(nextRank || 0);
                setReviewItems(buildReviewItemsFromSources({
                    reviewQuizIds: Array.isArray(reviewQuizIds) ? reviewQuizIds : [],
                    reviewQuizzes: reviewQuizzes.filter((quiz) => Array.isArray(quiz) && (quiz?.[2] || quiz?.[1] || quiz?.[5])),
                    practiceAttempts: ownPractice,
                }));
            } catch (error) {
                console.error("Failed to load deferred user page data", error);
            }
        }

        if (!isPageLoading) {
            loadDeferredData();
        }

        return () => {
            cancelled = true;
        };
    }, [address, cont, isPageLoading, result]);

    if (isPageLoading) {
        return (
            <div className="user-page">
                <div className="skeleton skeleton-card" style={{ height: "200px" }}></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
            </div>
        );
    }

    if (history_sum != null) {
        return (
            <div className="user-page animate-fadeIn">
                <div className="user-page-header">
                    <h1 className="heading-xl">マイページ</h1>
                </div>

                <User_card
                    address={address}
                    icons={icons}
                    user_name={user_name}
                    token={token}
                    result={result}
                    state={state}
                    rank={rank}
                    num_of_student={num_of_student}
                    tttBalance={tttBalance}
                    roleInfo={roleInfo}
                    registrationInfo={registrationInfo}
                    connectedAddress={connectedAddress}
                    cont={cont}
                />

                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>Web3小テストの配点レート</h2>
                    <div style={{ color: "rgba(255,255,255,0.8)", lineHeight: 1.8 }}>
                        {QUIZ_RATE_OPTIONS.map((item) => item.label).join(" / ")}
                        <br />
                        1点 = {TFT_PER_POINT}TFT
                        <br />
                        1講義あたり最大 {MAX_TFT_PER_LECTURE}TFT、全{TOTAL_LECTURE_COUNT}回で最大 {MAX_TFT_TOTAL}TFT
                    </div>
                </div>

                {loadError ? (
                    <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)", color: "#fff" }}>
                        <div style={{ fontWeight: 700, marginBottom: "10px" }}>{loadError}</div>
                        <button className="btn-primary-custom" onClick={() => window.location.reload()}>
                            再読み込み
                        </button>
                    </div>
                ) : null}

                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>実績バッジ</h2>
                    {badges.length === 0 ? (
                        <div style={{ color: "rgba(255,255,255,0.7)" }}>まだバッジはありません。解答、質問、練習を進めると表示されます。</div>
                    ) : (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {badges.map((badge) => (
                                <div key={badge.id} className="badge-status" style={{ padding: "8px 12px" }}>
                                    {badge.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>復習リスト</h2>
                    {reviewItems.length === 0 ? (
                        <div style={{ color: "rgba(255,255,255,0.7)" }}>いまのところ復習候補はありません。</div>
                    ) : (
                        <div style={{ display: "grid", gap: "12px" }}>
                            {reviewItems.map((item) => (
                                <Link
                                    key={item.quizId}
                                    to={buildAnswerQuizPath(item.quizId, item.sourceAddress || "", { practice: true })}
                                    state={buildAnswerQuizState(item.sourceAddress || "")}
                                    onClick={() => rememberQuizSource(item.quizId, item.sourceAddress || "")}
                                    className="glass-card"
                                    style={{ padding: "12px 16px", textDecoration: "none", color: "#fff" }}
                                >
                                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                                    <div style={{ color: "rgba(255,255,255,0.75)", marginTop: "4px" }}>{item.reason}</div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <History_list
                    cont={cont}
                    history_sum={history_sum}
                    Set_history_sum={Set_history_sum}
                    history_list={history_list}
                    Set_history_list={Set_history_list}
                    targetRef={targetRef}
                    now_numRef={now_numRef}
                    address={address}
                />

                <div className="token-history">
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-4)" }}>
                        📊 トークン履歴
                    </h2>
                    <div className="timeline stagger-children">
                        {history_list.map((history, index) => {
                            return <div key={index}>{history}</div>;
                        })}
                    </div>
                    <div ref={targetRef} className="quiz-loading">
                        <div className="skeleton skeleton-card"></div>
                    </div>
                </div>
            </div>
        );
    } else {
        return (
            <div className="user-page">
                <div className="skeleton skeleton-card" style={{ height: "200px" }}></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
            </div>
        );
    }
}

export default User_page;
