import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useMemo, useRef } from "react";
import Simple_quiz from "./components/quiz_simple";
import Quiz_list from "./components/quiz_list";
import { useAccessControl } from "../../utils/accessControl";
import { toGlobalId } from "../../utils/quizGlobalId";
import { getRegisteredCorrectAnswer } from "../../utils/quizCorrectAnswerStore";
import { getCreatedQuizzes, getDeletedQuizCacheSnapshot, getDeletedQuizzesWithStatus, hasDeletedQuizCache, normalizeDeletedQuizKey, removeCreatedQuiz, saveDeletedQuiz } from "../../utils/liveSignalApi";
import { getPendingCreatedQuizzes, pruneResolvedPendingCreatedQuizzes, subscribePendingCreatedQuizzes, toPendingQuizSimple } from "../../utils/pendingCreatedQuizzes";
import { getBatchAnswerQueue, subscribeBatchAnswerQueue } from "../../utils/batchAnswerQueue";
import { Link } from "react-router-dom";
import { legacy_quiz_addresses, quiz_address } from "../../contract/config";
import "./list_quiz_top.css";

const QUIZ_LIST_PAGE_CACHE_KEY = `web3_quiz_list_page_cache_v1_${normalizeQuizAddress(quiz_address)}`;

function readQuizListPageCache() {
    if (typeof localStorage === "undefined") return null;
    try {
        const parsed = JSON.parse(localStorage.getItem(QUIZ_LIST_PAGE_CACHE_KEY) || "null");
        if (!parsed || typeof parsed !== "object") return null;
        if (!Array.isArray(parsed.quizList)) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function writeQuizListPageCache(payload) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(QUIZ_LIST_PAGE_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error("Failed to persist quiz list page cache", error);
    }
}

function normalizeQuizAddress(value) {
    return String(value || "").trim().toLowerCase();
}

const QUIZ_ADDRESS_ORDER = [quiz_address, ...(legacy_quiz_addresses || [])]
    .map((address) => normalizeQuizAddress(address))
    .filter((address, index, list) => address && list.indexOf(address) === index);

function compareQuizOrder(left, right) {
    const leftAddress = normalizeQuizAddress(left?.sourceAddress || left?.[12] || "");
    const rightAddress = normalizeQuizAddress(right?.sourceAddress || right?.[12] || "");
    const leftAddressIndex = QUIZ_ADDRESS_ORDER.indexOf(leftAddress);
    const rightAddressIndex = QUIZ_ADDRESS_ORDER.indexOf(rightAddress);
    const safeLeftIndex = leftAddressIndex === -1 ? Number.MAX_SAFE_INTEGER : leftAddressIndex;
    const safeRightIndex = rightAddressIndex === -1 ? Number.MAX_SAFE_INTEGER : rightAddressIndex;

    if (safeLeftIndex !== safeRightIndex) {
        return safeLeftIndex - safeRightIndex;
    }

    return Number(right?.[0] || 0) - Number(left?.[0] || 0);
}

function List_quiz_top(props) {
    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);
    const initialListCache = useMemo(() => readQuizListPageCache(), []);

    const now_numRef = useRef(0);
    const [quiz_sum, Set_quiz_sum] = useState(() => {
        if (!initialListCache) return null;
        const cachedSum = Number(initialListCache?.quizSum ?? initialListCache?.quizList?.length ?? 0);
        return Number.isFinite(cachedSum) ? cachedSum : null;
    });
    const [quiz_list, Set_quiz_list] = useState(() => Array.isArray(initialListCache?.quizList) ? initialListCache.quizList : []);
    const [add_num, Set_add_num] = useState(7);
    const [currentEpoch, setCurrentEpoch] = useState(() => Math.floor(Date.now() / 1000));
    const [correctAnswerMap, setCorrectAnswerMap] = useState({});
    const [loadError, setLoadError] = useState("");
    const [deletedQuizMap, setDeletedQuizMap] = useState(() => getDeletedQuizCacheSnapshot());
    const [deletedQuizReady, setDeletedQuizReady] = useState(() => hasDeletedQuizCache());
    const [pendingCreatedQuizzes, setPendingCreatedQuizzes] = useState([]);
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const [batchAnswerCount, setBatchAnswerCount] = useState(() => getBatchAnswerQueue().length);
    const [initialListLoadResolved, setInitialListLoadResolved] = useState(() => Array.isArray(initialListCache?.quizList) && initialListCache.quizList.length > 0);
    const targetRef = useRef(null);
    const quizSumRef = useRef(0);
    const quizListRef = useRef(Array.isArray(initialListCache?.quizList) ? initialListCache.quizList : []);
    const quizSumStateRef = useRef(quiz_sum);
    const getQuizCacheKey = (quiz) => normalizeDeletedQuizKey(`${quiz?.sourceAddress || quiz?.[12] || ""}:${Number(quiz?.[0])}`);

    useEffect(() => {
        quizListRef.current = Array.isArray(quiz_list) ? quiz_list : [];
    }, [quiz_list]);

    useEffect(() => {
        quizSumStateRef.current = quiz_sum;
    }, [quiz_sum]);

    useEffect(() => {
        if (!Array.isArray(quiz_list) || quiz_list.length === 0) return;
        writeQuizListPageCache({
            quizSum: Number(quiz_sum || quiz_list.length || 0),
            quizList: quiz_list.slice(0, 40),
            savedAt: Date.now(),
        });
    }, [quiz_list, quiz_sum]);

    const syncPendingCreatedQuizzes = async () => {
        const localPending = getPendingCreatedQuizzes().map((entry) => toPendingQuizSimple(entry)).filter(Boolean);
        const sharedPendingMap = await getCreatedQuizzes();
        const sharedPending = Object.values(sharedPendingMap || {}).map((entry) => toPendingQuizSimple(entry)).filter(Boolean);
        const mergedPending = [...localPending];
        const mergedKeys = new Set(localPending.map((quiz) => getQuizCacheKey(quiz)));
        sharedPending.forEach((quiz) => {
            const quizKey = getQuizCacheKey(quiz);
            if (!mergedKeys.has(quizKey)) {
                mergedPending.push(quiz);
                mergedKeys.add(quizKey);
            }
        });
        setPendingCreatedQuizzes((current) => {
            const currentKeys = current.map((quiz) => getQuizCacheKey(quiz)).join("|");
            const nextKeys = mergedPending.map((quiz) => getQuizCacheKey(quiz)).join("|");
            return currentKeys === nextKeys ? current : mergedPending;
        });
    };

    const refreshQuizLengthTimerRef = useRef(null);

    const refreshQuizLength = async () => {
        try {
            const data = await cont.get_quiz_lenght();
            const nextLength = parseInt(Number(data), 10) || 0;
            const visibleCount = Array.isArray(quizListRef.current) ? quizListRef.current.length : 0;
            const cachedCount = Array.isArray(initialListCache?.quizList) ? initialListCache.quizList.length : 0;
            const fallbackVisibleCount = Math.max(visibleCount, cachedCount, Number(quizSumStateRef.current || 0));

            if (nextLength <= 0 && fallbackVisibleCount > 0) {
                quizSumRef.current = fallbackVisibleCount;
                now_numRef.current = fallbackVisibleCount;
                if (quizSumStateRef.current == null || Number(quizSumStateRef.current) <= 0) {
                    Set_quiz_sum(fallbackVisibleCount);
                }
                setLoadError("");
                return;
            }

            if (quizSumRef.current !== nextLength) {
                quizSumRef.current = nextLength;
                now_numRef.current = nextLength;
                Set_quiz_sum(nextLength);
                // リストを全消去せずにバックグラウンドで更新する
                // 既存リストがあればそのまま保持し、新しいクイズだけ追加される
                setListRefreshKey((current) => current + 1);
            } else if (quizSumRef.current === 0 && quiz_sum == null) {
                Set_quiz_sum(nextLength);
                now_numRef.current = nextLength;
            }
            setLoadError("");
        } catch (error) {
            console.error("Failed to load quiz length", error);
            if (quizSumStateRef.current == null && (!Array.isArray(quizListRef.current) || quizListRef.current.length === 0)) {
                // quiz_sum を 0 にするのではなく null のままにして
                // キャッシュからの復元チャンスを残す
                const cachedCount = Array.isArray(initialListCache?.quizList) ? initialListCache.quizList.length : 0;
                if (cachedCount > 0) {
                    Set_quiz_sum(cachedCount);
                    now_numRef.current = cachedCount;
                } else {
                    Set_quiz_sum(0);
                    now_numRef.current = 0;
                }
            }
            setLoadError("問題一覧の読み込みに失敗しました。");
        }
    };

    useEffect(() => {
        let mounted = true;
        const syncDeletedQuizzes = async () => {
            try {
                const nextDeletedState = await getDeletedQuizzesWithStatus();
                if (mounted) {
                    setDeletedQuizMap(nextDeletedState?.deletedQuizzes || {});
                    setDeletedQuizReady(Boolean(nextDeletedState?.ready));
                }
            } catch (error) {
                console.error("Failed to load deleted quizzes", error);
            }
        };

        syncPendingCreatedQuizzes();
        syncDeletedQuizzes();
        const timer = window.setInterval(syncDeletedQuizzes, 60000);
        const unsubscribePending = subscribePendingCreatedQuizzes(() => {
            syncPendingCreatedQuizzes();
        });
        const unsubscribeBatchQueue = subscribeBatchAnswerQueue((nextQueue) => {
            setBatchAnswerCount(Array.isArray(nextQueue) ? nextQueue.length : 0);
        });
        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                syncDeletedQuizzes();
                syncPendingCreatedQuizzes();
                setBatchAnswerCount(getBatchAnswerQueue().length);
            }
        };
        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);
        return () => {
            mounted = false;
            window.clearInterval(timer);
            unsubscribePending();
            unsubscribeBatchQueue();
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
        };
    }, []);

    const handleDeleteQuiz = async (quiz) => {
        const quizKey = getQuizCacheKey(quiz);
        const title = quiz?.[2] || "このクイズ";
        if (!window.confirm(`「${title}」を一覧から非表示にします。全ユーザーのクイズ一覧に反映されます。続けますか。`)) {
            return;
        }

        const address = await cont.get_address();
        const deletedByLabel = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "teacher";
        const result = await saveDeletedQuiz(quizKey, {
            deletedAt: new Date().toISOString(),
            deletedBy: address || "",
            deletedByLabel,
            sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
            quizId: Number(quiz?.[0]),
        });
        if (result?.offline) {
            alert("削除状態をこの端末には保存しましたが、共有サーバーへの同期に失敗しました。他の学生へ反映されない可能性があります。少し待ってからもう一度削除操作をしてください。");
        }

        setDeletedQuizMap((current) => ({
            ...current,
            [quizKey]: {
                deletedAt: new Date().toISOString(),
                deletedBy: address || "",
                deletedByLabel,
                sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
                quizId: Number(quiz?.[0]),
            },
        }));
        Set_quiz_list((current) => current.filter((entry) => getQuizCacheKey(entry) !== quizKey));
    };

    useEffect(() => {
        refreshQuizLength();

        // デバウンス付きで visibilitychange/focus を処理（連続発火防止）
        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                if (refreshQuizLengthTimerRef.current) {
                    window.clearTimeout(refreshQuizLengthTimerRef.current);
                }
                refreshQuizLengthTimerRef.current = window.setTimeout(() => {
                    refreshQuizLengthTimerRef.current = null;
                    refreshQuizLength();
                    syncPendingCreatedQuizzes();
                }, 800);
            }
        };

        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);
        window.addEventListener("pending-created-quizzes-updated", refreshQuizLength);

        return () => {
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
            window.removeEventListener("pending-created-quizzes-updated", refreshQuizLength);
            if (refreshQuizLengthTimerRef.current) {
                window.clearTimeout(refreshQuizLengthTimerRef.current);
            }
        };
        // cont is stable for this page lifecycle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cont]);

    useEffect(() => {
        if (!access.address) return;
        if (quiz_sum == null) return;
        // 既にリストデータがある場合は全リセットしない
        const hasExistingList = Array.isArray(quizListRef.current) && quizListRef.current.length > 0;
        if (!hasExistingList) {
            now_numRef.current = quizSumRef.current || Number(quiz_sum) || 0;
            setInitialListLoadResolved(false);
        }
        setListRefreshKey((current) => current + 1);
    }, [access.address, quiz_sum]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setCurrentEpoch(Math.floor(Date.now() / 1000));
        }, 30000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        pruneResolvedPendingCreatedQuizzes(quiz_list);
        const pendingKeys = new Set(pendingCreatedQuizzes.map((quiz) => getQuizCacheKey(quiz)));
        quiz_list.forEach((quiz) => {
            if (!Array.isArray(quiz)) return;
            const quizKey = getQuizCacheKey(quiz);
            if (pendingKeys.has(quizKey)) {
                removeCreatedQuiz(quizKey).catch(() => {});
            }
        });
        syncPendingCreatedQuizzes();
    }, [pendingCreatedQuizzes, quiz_list]);

    useEffect(() => {
        const expiredWithoutAnswer = quiz_list.filter((quiz) => {
            const quizKey = getQuizCacheKey(quiz);
            const deadline = Number(quiz?.[6] || 0);
            return deadline > 0 && currentEpoch > deadline && !correctAnswerMap[quizKey];
        });

        if (!expiredWithoutAnswer.length) return;

        let cancelled = false;

        (async () => {
            const nextEntries = await Promise.all(
                expiredWithoutAnswer.map(async (quiz) => {
                    const quizId = Number(quiz?.[0]);
                    const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
                    const quizKey = getQuizCacheKey(quiz);
                    const localAnswer = getRegisteredCorrectAnswer(quizId, sourceAddress);
                    if (localAnswer) {
                        return [quizKey, localAnswer];
                    }

                    const answer = await cont.get_revealed_correct_answer(quizId, sourceAddress);
                    return [quizKey, answer];
                })
            );

            if (cancelled) return;

            setCorrectAnswerMap((current) => {
                const next = { ...current };
                nextEntries.forEach(([quizId, answer]) => {
                    if (answer) {
                        next[quizId] = answer;
                    }
                });
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [cont, correctAnswerMap, currentEpoch, quiz_list]);

    const visibleQuizKeys = new Set(quiz_list.map((quiz) => getQuizCacheKey(quiz)));
    const mergedQuizList = [
        ...pendingCreatedQuizzes.filter((quiz) => !visibleQuizKeys.has(getQuizCacheKey(quiz))),
        ...quiz_list,
    ];
    const filteredQuizList = mergedQuizList
        .filter((quiz) => !deletedQuizMap[getQuizCacheKey(quiz)])
        .filter((quiz) => {
            const localId = Number(quiz?.[0]);
            const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
            return toGlobalId(localId, sourceAddress) !== -1;
        })
        .sort(compareQuizOrder);
    const hasRenderableQuizList = filteredQuizList.length > 0;
    const shouldShowSyncBanner = !deletedQuizReady;

    if (quiz_sum != null) {
        return (
            <div className="quiz-list-page animate-fadeIn">
                <div className="quiz-list-header">
                    <h1 className="heading-xl">クイズ一覧</h1>
                    <p style={{ color: "#ffffff", opacity: 0.9 }}>出題されたクイズに回答してトークンを獲得しよう</p>
                </div>

                {access.canAnswerQuiz && (
                    <div className="glass-card batch-answer-banner">
                        <div>
                            <div className="batch-answer-banner-title">まとめて解答して最後に一括送信</div>
                            <div className="batch-answer-banner-note">
                                各問題ページで回答を一時保存し、最後にまとめて送信できます。現在 {batchAnswerCount} 件保存中です。
                            </div>
                        </div>
                        <Link to="/batch_answers" className="btn-primary-custom" style={{ textDecoration: "none" }}>
                            まとめて解答を確認
                        </Link>
                    </div>
                )}

                <Quiz_list
                    cont={cont}
                    add_num={add_num}
                    Set_add_num={Set_add_num}
                    quiz_sum={quiz_sum}
                    Set_quiz_sum={Set_quiz_sum}
                    quiz_list={quiz_list}
                    Set_quiz_list={Set_quiz_list}
                    targetRef={targetRef}
                    now_numRef={now_numRef}
                    setLoadError={setLoadError}
                    refreshKey={listRefreshKey}
                    onInitialLoadResolved={() => setInitialListLoadResolved(true)}
                />

                <div className="quiz-list-items">
                    {loadError ? (
                        <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff" }}>
                            <div style={{ fontWeight: 700, marginBottom: "10px" }}>{loadError}</div>
                            <button
                                className="btn-primary-custom"
                                onClick={() => window.location.reload()}
                            >
                                再読み込み
                            </button>
                        </div>
                    ) : null}
                    {shouldShowSyncBanner ? (
                        <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff" }}>
                            <div style={{ fontWeight: 700, marginBottom: "10px" }}>削除済み問題の同期中です...</div>
                            <div style={{ color: "rgba(255,255,255,0.8)" }}>
                                教員側で非表示にした問題を各端末へ反映しています。同期中でも問題一覧は先に表示します。
                            </div>
                        </div>
                    ) : null}
                    {filteredQuizList.map((quiz, index) => (
                        <div key={`${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}>
                            <Simple_quiz
                                quiz={quiz}
                                canAnswerQuiz={access.canAnswerQuiz}
                                accessLoading={access.isLoading}
                                isConnected={access.isConnected}
                                isTeacher={access.isTeacher}
                                currentEpoch={currentEpoch}
                                correctAnswer={correctAnswerMap[getQuizCacheKey(quiz)] || ""}
                                onDeleteQuiz={handleDeleteQuiz}
                            />
                        </div>
                    ))}
                    {!loadError && !hasRenderableQuizList && deletedQuizReady && initialListLoadResolved ? (
                        <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff" }}>
                            <div style={{ fontWeight: 700, marginBottom: "10px" }}>表示できる問題がまだありません</div>
                            <div style={{ color: "rgba(255,255,255,0.8)", marginBottom: "12px" }}>
                                ブロックチェーンとの通信に問題が発生した可能性があります。再読み込みをお試しください。
                            </div>
                            <button
                                className="btn-primary-custom"
                                onClick={() => window.location.reload()}
                            >
                                再読み込み
                            </button>
                        </div>
                    ) : null}
                </div>

                {!loadError && (
                    <div ref={targetRef} className="quiz-loading">
                        <div className="skeleton skeleton-card"></div>
                        <div className="skeleton skeleton-card"></div>
                    </div>
                )}
            </div>
        );
    } else {
        return (
            <div className="quiz-list-page">
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
            </div>
        );
    }
}
export default List_quiz_top;
