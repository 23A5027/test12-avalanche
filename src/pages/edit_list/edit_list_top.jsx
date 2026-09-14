import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useRef, useMemo } from "react";
import Simple_quiz from "./components/quiz_simple";
import Quiz_list from "./components/quiz_list";
import { useAccessControl } from "../../utils/accessControl";
import { getCreatedQuizzes, getDeletedQuizCacheSnapshot, getDeletedQuizzesWithStatus, hasDeletedQuizCache, normalizeDeletedQuizKey, removeCreatedQuiz, removeDeletedQuiz, saveDeletedQuiz } from "../../utils/liveSignalApi";
import { getPendingCreatedQuizzes, pruneResolvedPendingCreatedQuizzes, subscribePendingCreatedQuizzes, toPendingQuizSimple } from "../../utils/pendingCreatedQuizzes";
import { legacy_quiz_addresses, quiz_address } from "../../contract/config";
import "./edit_list_top.css";

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

function Edit_list_top(props) {
    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);

    const now_numRef = useRef(0);
    const [quiz_sum, Set_quiz_sum] = useState(null);
    const [quiz_list, Set_quiz_list] = useState([]);
    const [add_num, Set_add_num] = useState(7);
    const [loadError, setLoadError] = useState("");
    const [deletedQuizMap, setDeletedQuizMap] = useState(() => getDeletedQuizCacheSnapshot());
    const [deletedQuizReady, setDeletedQuizReady] = useState(() => hasDeletedQuizCache());
    const [pendingCreatedQuizzes, setPendingCreatedQuizzes] = useState([]);
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const quizSumRef = useRef(0);
    const getQuizCacheKey = (quiz) => normalizeDeletedQuizKey(`${quiz?.sourceAddress || quiz?.[12] || ""}:${Number(quiz?.[0])}`);

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

    const refreshQuizLength = async () => {
        try {
            const data = await cont.get_quiz_lenght();
            const nextLength = parseInt(Number(data), 10) || 0;
            if (quizSumRef.current !== nextLength) {
                quizSumRef.current = nextLength;
                now_numRef.current = nextLength;
                Set_quiz_sum(nextLength);
                Set_quiz_list([]);
                setListRefreshKey((current) => current + 1);
            } else if (quizSumRef.current === 0 && quiz_sum == null) {
                quizSumRef.current = nextLength;
                Set_quiz_sum(nextLength);
                now_numRef.current = nextLength;
            }
            setLoadError("");
        } catch (error) {
            console.error("Failed to load quiz length", error);
            if (quiz_sum == null) {
                Set_quiz_sum(0);
                now_numRef.current = 0;
            }
            setLoadError("管理用クイズ一覧の読み込みに失敗しました。");
        }
    };

    useEffect(() => {
        refreshQuizLength();

        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                refreshQuizLength();
                syncPendingCreatedQuizzes();
            }
        };

        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);
        window.addEventListener("pending-created-quizzes-updated", refreshQuizLength);

        return () => {
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
            window.removeEventListener("pending-created-quizzes-updated", refreshQuizLength);
        };
    }, [cont]);

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
        const timer = window.setInterval(syncDeletedQuizzes, 15000);
        const unsubscribePending = subscribePendingCreatedQuizzes(() => {
            syncPendingCreatedQuizzes();
        });
        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                syncDeletedQuizzes();
                syncPendingCreatedQuizzes();
            }
        };
        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);
        return () => {
            mounted = false;
            window.clearInterval(timer);
            unsubscribePending();
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
        };
    }, []);

    const handleDeleteQuiz = async (quiz) => {
        const quizKey = getQuizCacheKey(quiz);
        const title = quiz?.[2] || "このクイズ";
        if (!window.confirm(`「${title}」を削除対象として一覧から隠します。全ユーザーに反映されます。続けますか。`)) {
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
    };

    const handleRestoreQuiz = async (quiz) => {
        const quizKey = getQuizCacheKey(quiz);
        await removeDeletedQuiz(quizKey);
        setDeletedQuizMap((current) => {
            const next = { ...current };
            delete next[quizKey];
            return next;
        });
    };

    const targetRef = useRef(null);

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

    const visibleQuizKeys = new Set(quiz_list.map((quiz) => getQuizCacheKey(quiz)));
    const mergedQuizList = [
        ...pendingCreatedQuizzes.filter((quiz) => !visibleQuizKeys.has(getQuizCacheKey(quiz))),
        ...quiz_list,
    ].sort(compareQuizOrder);

    if (access.isLoading) {
        return <div className="edit-list-page"><div className="loading-text-bright">権限を確認中です...</div></div>;
    }

    if (!access.isTeacher) {
        return <div className="edit-list-page">この画面は教員・TAのみ利用できます。</div>;
    }

    if (quiz_sum == null) {
        return <div className="edit-list-page"><div className="loading-text-bright">読み込み中です...</div></div>;
    }

    return (
        <div className="edit-list-page">
            <div className="page-header">
                <h1 className="page-title">📝 クイズ管理</h1>
                <p className="page-subtitle">作成したクイズの編集・報酬管理</p>
            </div>

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
            />

            {loadError ? (
                <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff", marginBottom: "var(--space-4)" }}>
                    <div style={{ fontWeight: 700, marginBottom: "10px" }}>{loadError}</div>
                    <button className="btn-primary-custom" onClick={() => window.location.reload()}>
                        再読み込み
                    </button>
                </div>
            ) : null}

            {!deletedQuizReady ? (
                <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff", marginBottom: "var(--space-4)" }}>
                    <div style={{ fontWeight: 700, marginBottom: "10px" }}>削除済み問題の同期中です...</div>
                    <div style={{ color: "rgba(255,255,255,0.8)" }}>
                        教員側で非表示にした問題を全端末で揃えるため、管理一覧の表示を待機しています。
                    </div>
                </div>
            ) : mergedQuizList.some((quiz) => deletedQuizMap[getQuizCacheKey(quiz)]) ? (
                <div className="deleted-quiz-panel glass-card">
                    <div className="deleted-quiz-panel__header">
                        <h2 className="deleted-quiz-panel__title">削除済みクイズ</h2>
                        <span className="deleted-quiz-panel__count">
                            {mergedQuizList.filter((quiz) => deletedQuizMap[getQuizCacheKey(quiz)]).length} 件
                        </span>
                    </div>
                    <div className="deleted-quiz-panel__list">
                        {mergedQuizList
                            .filter((quiz) => deletedQuizMap[getQuizCacheKey(quiz)])
                            .map((quiz, index) => {
                                const quizKey = getQuizCacheKey(quiz);
                                const deletedMeta = deletedQuizMap[quizKey] || {};
                                return (
                                    <div
                                        key={`deleted-${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}
                                        className="deleted-quiz-item"
                                    >
                                        <div className="deleted-quiz-item__body">
                                            <div className="deleted-quiz-item__title">{quiz?.[2] || "タイトル未設定"}</div>
                                            <div className="deleted-quiz-item__meta">
                                                削除時刻: {deletedMeta?.deletedAt ? new Date(deletedMeta.deletedAt).toLocaleString("ja-JP") : "-"}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-edit"
                                            onClick={() => handleRestoreQuiz(quiz)}
                                        >
                                            再表示
                                        </button>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ) : null}

            {deletedQuizReady && mergedQuizList
                .filter((quiz) => !deletedQuizMap[getQuizCacheKey(quiz)])
                .map((quiz, index) => (
                    <Simple_quiz
                        key={`${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}
                        quiz={quiz}
                        onDeleteQuiz={handleDeleteQuiz}
                    />
                ))}

            {!loadError && (
                <div ref={targetRef} className="loading-indicator">
                    <div className="skeleton-card">
                        <div className="skeleton-line" style={{ width: "60%" }}></div>
                        <div className="skeleton-line" style={{ width: "90%" }}></div>
                        <div className="skeleton-line" style={{ width: "40%" }}></div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Edit_list_top;
