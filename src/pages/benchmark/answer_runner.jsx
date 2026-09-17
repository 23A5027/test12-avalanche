import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Wait_Modal from "../../contract/wait_Modal";
import { Contracts_MetaMask } from "../../contract/contracts";
import { amoy } from "../../contract/network";
import { chainId, quiz_address, rpc } from "../../contract/config";
import { useAccessControl } from "../../utils/accessControl";
import {
    BENCHMARK_ANSWER,
    BENCHMARK_QUIZ_END_NUMBER,
    BENCHMARK_QUIZ_START_NUMBER,
    BENCHMARK_STUDENT_ADDRESS,
    parseBenchmarkQuizNumber,
} from "../../utils/benchmarkQuizPlan";
import {
    QUIZ_METRICS_UPDATED_EVENT,
    appendQuizBenchmarkMetric,
    beginQuizOperationBenchmark,
    buildQuizMetricsCsv,
    calculateQuizMetricStats,
    getBenchmarkNetworkName,
    readQuizBenchmarkMetrics,
} from "../../utils/performanceBenchmark";
import "./benchmark.css";
import "./answer_runner.css";

const RUNNER_METRIC_NAMES = [
    "quiz_detail_load",
    "answer_tx_hash_wait_from_click",
    "answer_tx_confirmation",
    "answer_post_refresh",
    "answer_total_after_hash",
];

function normalizeAddress(value) {
    return String(value || "").toLowerCase();
}

function sameAddress(left, right) {
    return normalizeAddress(left) === normalizeAddress(right);
}

function getQuizSource(simpleQuiz) {
    return simpleQuiz?.sourceAddress || simpleQuiz?.[12] || simpleQuiz?.[13] || "";
}

function isTargetAnswered(target) {
    return Boolean(target?.answered || target?.status === "completed");
}

function getTargetKey(target) {
    return `${target?.quizNumber ?? ""}:${target?.id ?? ""}`;
}

function createSessionId() {
    return `answer-runner-${amoy.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getRunnerStateKey() {
    return `web3_benchmark_answer_runner_state_v1_${amoy.id}_${normalizeAddress(quiz_address)}`;
}

function createRunnerSession() {
    return {
        sessionId: createSessionId(),
        startedAt: new Date().toISOString(),
        chainId: amoy.id,
        network: getBenchmarkNetworkName(),
        quizAddress: quiz_address,
        targetStartNumber: BENCHMARK_QUIZ_START_NUMBER,
        targetEndNumber: BENCHMARK_QUIZ_END_NUMBER,
        paused: false,
        failures: [],
    };
}

function readRunnerSession() {
    if (typeof localStorage === "undefined") return createRunnerSession();
    try {
        const parsed = JSON.parse(localStorage.getItem(getRunnerStateKey()) || "null");
        if (
            parsed
            && Number(parsed.chainId) === Number(amoy.id)
            && sameAddress(parsed.quizAddress, quiz_address)
            && Number(parsed.targetStartNumber) === Number(BENCHMARK_QUIZ_START_NUMBER)
            && Number(parsed.targetEndNumber) === Number(BENCHMARK_QUIZ_END_NUMBER)
            && parsed.startedAt
        ) {
            return {
                ...parsed,
                paused: Boolean(parsed.paused),
                failures: Array.isArray(parsed.failures) ? parsed.failures : [],
            };
        }
    } catch (error) {
    }
    const next = createRunnerSession();
    localStorage.setItem(getRunnerStateKey(), JSON.stringify(next));
    return next;
}

function writeRunnerSession(session) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(getRunnerStateKey(), JSON.stringify(session));
}

function buildTimestampForFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        "-",
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join("");
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
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatNumber(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "-";
    return Number(value).toFixed(digits);
}

function buildDuplicateSuccessSummary(rows, metricName = "") {
    const counts = new Map();
    rows.forEach((row) => {
        if (!row.success) return;
        if (metricName && row.metric_name !== metricName) return;
        const key = `${row.metric_name}:${row.benchmark_number}`;
        const current = counts.get(key) || {
            metric_name: row.metric_name,
            benchmark_number: row.benchmark_number,
            quiz_ids: new Set(),
            count: 0,
        };
        current.quiz_ids.add(String(row.quiz_id));
        current.count += 1;
        counts.set(key, current);
    });
    return Array.from(counts.values())
        .filter((item) => item.count > 1)
        .map((item) => ({
            ...item,
            quiz_ids: Array.from(item.quiz_ids),
        }));
}

function getMetricRowsForRunner(rows, targets, session, networkName) {
    const targetIds = new Set(targets.map((target) => String(target.id)));
    const targetNumbers = new Set(targets.map((target) => String(target.quizNumber)));
    const sessionId = String(session?.sessionId || "");
    return rows.filter((row) => {
        if (!targetIds.has(String(row.quiz_id))) return false;
        if (row.network !== networkName) return false;
        if (Number(row.chain_id) !== Number(amoy.id)) return false;
        if (!row.runner_session_id || String(row.runner_session_id) !== sessionId) return false;
        if (!targetNumbers.has(String(row.benchmark_number))) return false;
        return RUNNER_METRIC_NAMES.includes(row.metric_name);
    });
}

function AnswerRunner() {
    const contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(contract);
    const networkName = useMemo(() => getBenchmarkNetworkName(), []);
    const [session, setSession] = useState(() => readRunnerSession());
    const [metricsRows, setMetricsRows] = useState(() => readQuizBenchmarkMetrics());
    const [targets, setTargets] = useState([]);
    const [currentTarget, setCurrentTarget] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [operationPhase, setOperationPhase] = useState("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [show, setShow] = useState(false);
    const [modalContent, setModalContent] = useState("");
    const operationLockRef = useRef(false);
    const inFlightTargetRef = useRef("");

    const isPaused = Boolean(session.paused);
    const connectedStudent = sameAddress(access.address, BENCHMARK_STUDENT_ADDRESS);

    const sessionRows = useMemo(
        () => getMetricRowsForRunner(metricsRows, targets, session, networkName),
        [metricsRows, networkName, session, targets]
    );

    const confirmationStats = useMemo(
        () => calculateQuizMetricStats(sessionRows, "answer_tx_confirmation"),
        [sessionRows]
    );

    const metricStats = useMemo(
        () => RUNNER_METRIC_NAMES.map((metricName) => calculateQuizMetricStats(sessionRows, metricName)),
        [sessionRows]
    );

    const confirmationRows = useMemo(
        () => sessionRows.filter((row) => row.metric_name === "answer_tx_confirmation"),
        [sessionRows]
    );
    const latestConfirmation = confirmationRows[confirmationRows.length - 1] || null;
    const duplicateSuccessMetrics = useMemo(
        () => buildDuplicateSuccessSummary(sessionRows),
        [sessionRows]
    );
    const duplicateConfirmationMetrics = useMemo(
        () => buildDuplicateSuccessSummary(sessionRows, "answer_tx_confirmation"),
        [sessionRows]
    );

    const completedCount = targets.filter((target) => isTargetAnswered(target)).length;
    const pendingTargets = targets.filter((target) => !isTargetAnswered(target));
    const failureCount = Array.isArray(session.failures) ? session.failures.length : 0;
    const formalCompletionReady = (
        targets.length === 30
        && completedCount === 30
        && confirmationStats.total === 30
        && confirmationStats.successCount === 30
        && confirmationStats.failureCount === 0
        && duplicateConfirmationMetrics.length === 0
    );
    const progressLabel = targets.length ? `${Math.min(completedCount + (currentTarget && !isTargetAnswered(currentTarget) ? 1 : 0), targets.length)} / ${targets.length}` : "0 / 0";

    const recordQuizOperationMetric = useCallback((metricName, {
        target,
        startedAt,
        durationMs,
        success = true,
        error = null,
        errorMessage = "",
        txHash = "",
        receipt = null,
    } = {}) => appendQuizBenchmarkMetric({
        metric_name: metricName,
        quiz_id: target?.id ?? "",
        started_at: startedAt || new Date().toISOString(),
        duration_ms: durationMs,
        success,
        error,
        error_message: errorMessage,
        wallet_address: access.address || "",
        tx_hash: txHash,
        block_number: receipt?.blockNumber ?? "",
        receipt_status: receipt?.status ?? "",
        gas_used: receipt?.gasUsed ?? "",
        quiz_count: targets.length,
        runner_session_id: session.sessionId,
        benchmark_number: target?.quizNumber ?? "",
    }), [access.address, session.sessionId, targets.length]);

    const recordRunnerFailure = useCallback((target, error) => {
        const failure = {
            at: new Date().toISOString(),
            quizNumber: target?.quizNumber ?? "",
            quizId: target?.id ?? "",
            title: target?.title || "",
            message: error?.shortMessage || error?.message || String(error || "unknown_error"),
        };
        const next = {
            ...session,
            failures: [...(Array.isArray(session.failures) ? session.failures : []), failure],
        };
        setSession(next);
        writeRunnerSession(next);
    }, [session]);

    const readTargetAnswerState = useCallback(async (target) => {
        if (!target) return null;
        let detail = null;
        let simple = null;
        try {
            detail = await contract.get_student_answer_detail(BENCHMARK_STUDENT_ADDRESS, target.id, quiz_address);
        } catch (error) {
            console.error("Failed to read student answer detail", error);
        }
        try {
            simple = await contract.get_quiz_simple(target.id, quiz_address, BENCHMARK_STUDENT_ADDRESS);
        } catch (error) {
            console.error("Failed to read student quiz simple", error);
        }
        const state = Number(detail?.state ?? simple?.[10] ?? target.answerStatus ?? 0);
        const isPayment = Boolean(simple?.[11] ?? target.isPayment);
        const submitted = Boolean(detail?.submitted || state !== 0);
        return {
            state,
            submitted,
            answered: submitted,
            isPayment,
            answerTime: Number(detail?.answerTime || 0),
            attemptCount: Number(detail?.attemptCount || 0),
            answerText: detail?.answerText || "",
        };
    }, [contract]);

    const loadTargets = useCallback(async () => {
        setIsLoading(true);
        try {
            const simpleList = await contract.get_all_quiz_simple_list();
            const currentContractCandidates = simpleList
                .map((simple) => ({
                    id: Number(simple?.[0]),
                    title: String(simple?.[2] || ""),
                    sourceAddress: getQuizSource(simple),
                    simple,
                    quizNumber: parseBenchmarkQuizNumber(simple?.[2]),
                }))
                .filter((item) => (
                    Number.isInteger(item.id)
                    && item.quizNumber !== null
                    && sameAddress(item.sourceAddress, quiz_address)
                ))
                .sort((a, b) => a.quizNumber - b.quizNumber || a.id - b.id);

            const enrichedTargets = await Promise.all(currentContractCandidates.map(async (item) => {
                let answerState = null;
                let readError = null;
                try {
                    answerState = await readTargetAnswerState(item);
                } catch (error) {
                    readError = error;
                }
                const answerStatus = Number(answerState?.state ?? item.simple?.[10] ?? 0);
                const isPayment = Boolean(answerState?.isPayment ?? item.simple?.[11]);
                const answered = Boolean(answerState?.answered || answerStatus !== 0);
                return {
                    ...item,
                    answerStatus,
                    isPayment,
                    answerTime: Number(answerState?.answerTime || 0),
                    attemptCount: Number(answerState?.attemptCount || 0),
                    answered,
                    status: answered ? "completed" : "pending",
                    readError,
                };
            }));

            setTargets(enrichedTargets);
            setCurrentTarget((current) => {
                if (current && enrichedTargets.some((item) => item.id === current.id && !isTargetAnswered(item))) {
                    return enrichedTargets.find((item) => item.id === current.id) || null;
                }
                return enrichedTargets.find((item) => !isTargetAnswered(item)) || enrichedTargets[0] || null;
            });
            setStatusMessage(enrichedTargets.length
                ? `${enrichedTargets.length}件のBenchmark対象Quizを検出しました。`
                : `Benchmark Test Quiz ${String(BENCHMARK_QUIZ_START_NUMBER).padStart(2, "0")}〜${String(BENCHMARK_QUIZ_END_NUMBER).padStart(2, "0")}はまだ見つかっていません。`);
        } catch (error) {
            console.error("Failed to load benchmark answer targets", error);
            setStatusMessage(error?.shortMessage || error?.message || "対象Quizの取得に失敗しました。");
        } finally {
            setIsLoading(false);
        }
    }, [contract, readTargetAnswerState]);

    const loadQuizDetail = useCallback(async (target, { recordDetailMetric = true } = {}) => {
        if (!target) return null;
        const detailBenchmark = recordDetailMetric
            ? beginQuizOperationBenchmark({
                metricName: "quiz_detail_load",
                quizId: target.id,
                walletAddress: access.address || "",
                runnerSessionId: session.sessionId,
                benchmarkNumber: target.quizNumber,
            })
            : null;

        try {
            const resolvedQuiz = await contract.get_quiz_with_source(target.id, quiz_address);
            if (!sameAddress(resolvedQuiz?.sourceAddress, quiz_address)) {
                throw new Error("current Quiz contract以外の問題を読み込んだため停止しました。");
            }
            detailBenchmark?.finish({
                success: true,
                walletAddress: access.address || "",
                quizCount: targets.length,
            });
            return resolvedQuiz;
        } catch (error) {
            detailBenchmark?.finish({
                success: false,
                error,
                walletAddress: access.address || "",
                quizCount: targets.length,
            });
            throw error;
        }
    }, [access.address, contract, session.sessionId, targets.length]);

    const submitCurrentTarget = async () => {
        if (operationLockRef.current || isSubmitting || isPaused || !currentTarget) return;
        if (!connectedStudent) {
            alert(`Studentウォレット ${BENCHMARK_STUDENT_ADDRESS} で接続してから測定してください。`);
            return;
        }
        if (isTargetAnswered(currentTarget)) {
            setStatusMessage("このQuizはStudentが回答済みです。対象一覧を更新します。");
            await loadTargets();
            return;
        }

        operationLockRef.current = true;
        inFlightTargetRef.current = getTargetKey(currentTarget);
        setIsSubmitting(true);
        setOperationPhase("precheck");
        setTargets((current) => current.map((item) => (
            getTargetKey(item) === getTargetKey(currentTarget)
                ? { ...item, status: "in_flight" }
                : item
        )));
        setStatusMessage(`${currentTarget.title} を読み込み中です。`);

        const submitStartedAt = performance.now();
        const submitStartedAtIso = new Date().toISOString();
        let benchmarkTxHash = "";
        let txHashReceivedAt = null;
        let txHashReceivedAtIso = "";
        let receiptReceivedAt = null;
        let benchmarkReceipt = null;
        let hashWaitMetricLogged = false;
        let confirmationMetricLogged = false;

        const answerBenchmarkCallbacks = {
            onTransactionHash: ({ hash }) => {
                setOperationPhase("receipt_wait");
                benchmarkTxHash = hash || "";
                txHashReceivedAt = performance.now();
                txHashReceivedAtIso = new Date().toISOString();
                hashWaitMetricLogged = true;
                recordQuizOperationMetric("answer_tx_hash_wait_from_click", {
                    target: currentTarget,
                    startedAt: submitStartedAtIso,
                    durationMs: txHashReceivedAt - submitStartedAt,
                    success: Boolean(benchmarkTxHash),
                    txHash: benchmarkTxHash,
                });
                setStatusMessage("transaction hashを取得しました。receipt確定を待っています。");
            },
            onTransactionReceipt: ({ hash, receipt }) => {
                setOperationPhase("post_refresh");
                const receivedAt = performance.now();
                benchmarkTxHash = hash || benchmarkTxHash;
                benchmarkReceipt = receipt || null;
                receiptReceivedAt = receivedAt;
                confirmationMetricLogged = true;
                recordQuizOperationMetric("answer_tx_confirmation", {
                    target: currentTarget,
                    startedAt: txHashReceivedAtIso || new Date().toISOString(),
                    durationMs: txHashReceivedAt == null ? 0 : receivedAt - txHashReceivedAt,
                    success: true,
                    txHash: benchmarkTxHash,
                    receipt: benchmarkReceipt,
                });
                setStatusMessage("receiptを取得しました。画面反映用データを再取得しています。");
            },
            onTransactionReceiptError: ({ hash, error }) => {
                if (txHashReceivedAt == null || confirmationMetricLogged) return;
                benchmarkTxHash = hash || benchmarkTxHash;
                confirmationMetricLogged = true;
                recordQuizOperationMetric("answer_tx_confirmation", {
                    target: currentTarget,
                    startedAt: txHashReceivedAtIso || new Date().toISOString(),
                    durationMs: performance.now() - txHashReceivedAt,
                    success: false,
                    error,
                    txHash: benchmarkTxHash,
                });
            },
        };

        try {
            const beforeDetailState = await readTargetAnswerState(currentTarget);
            if (beforeDetailState?.answered) {
                setStatusMessage(`${currentTarget.title} は既に回答済みです。transactionは送信せず完了扱いにします。`);
                await loadTargets();
                return;
            }

            setOperationPhase("detail_loading");
            await loadQuizDetail(currentTarget, { recordDetailMetric: true });
            setOperationPhase("pre_submit_check");
            const latestDetailState = await readTargetAnswerState(currentTarget);
            if (latestDetailState?.answered) {
                setStatusMessage(`${currentTarget.title} は送信直前の確認で回答済みでした。transactionは送信しません。`);
                await loadTargets();
                return;
            }

            setOperationPhase("metamask_wait");
            const submitResult = await contract.create_answer(
                currentTarget.id,
                BENCHMARK_ANSWER,
                setShow,
                setModalContent,
                quiz_address,
                answerBenchmarkCallbacks
            );
            const txHash = submitResult?.transactionHash || submitResult?.hash || benchmarkTxHash || "";
            if (!benchmarkReceipt && submitResult?.blockNumber != null) {
                benchmarkReceipt = submitResult;
            }

            const postRefreshStartedAt = performance.now();
            const postRefreshStartedAtIso = new Date().toISOString();
            let refreshedQuiz = null;
            try {
                refreshedQuiz = await loadQuizDetail(currentTarget, { recordDetailMetric: false });
            } catch (error) {
                console.error("Failed to refresh quiz after answer", error);
            }
            const postRefreshFinishedAt = performance.now();
            if (txHashReceivedAt != null && receiptReceivedAt != null) {
                const postRefreshSuccess = Boolean(refreshedQuiz);
                recordQuizOperationMetric("answer_post_refresh", {
                    target: currentTarget,
                    startedAt: postRefreshStartedAtIso,
                    durationMs: postRefreshFinishedAt - postRefreshStartedAt,
                    success: postRefreshSuccess,
                    txHash,
                    receipt: benchmarkReceipt,
                });
                recordQuizOperationMetric("answer_total_after_hash", {
                    target: currentTarget,
                    startedAt: txHashReceivedAtIso || postRefreshStartedAtIso,
                    durationMs: postRefreshFinishedAt - txHashReceivedAt,
                    success: postRefreshSuccess,
                    txHash,
                    receipt: benchmarkReceipt,
                });
            }
            setOperationPhase("nonce_sync");
            setStatusMessage("nonce反映を確認しています。次のQuiz送信はまだ待機中です。");
            await contract.waitForLastWriteNonceAdvance(access.address || BENCHMARK_STUDENT_ADDRESS, 10, 500);
            setStatusMessage(`${currentTarget.title} の測定が完了しました。`);
            await loadTargets();
        } catch (error) {
            console.error("Answer runner failed", error);
            setOperationPhase("failed");
            if (!hashWaitMetricLogged) {
                recordQuizOperationMetric("answer_tx_hash_wait_from_click", {
                    target: currentTarget,
                    startedAt: submitStartedAtIso,
                    durationMs: performance.now() - submitStartedAt,
                    success: false,
                    error,
                    txHash: benchmarkTxHash,
                });
            }
            if (benchmarkTxHash) {
                try {
                    const verifiedState = await readTargetAnswerState(currentTarget);
                    if (verifiedState?.answered) {
                        setStatusMessage(`${currentTarget.title} はオンチェーン上で回答済みです。再送信せず完了扱いにします。`);
                        await loadTargets();
                        return;
                    }
                } catch (verifyError) {
                    console.error("Failed to verify answer after runner error", verifyError);
                }
            }
            setTargets((current) => current.map((item) => (
                getTargetKey(item) === getTargetKey(currentTarget)
                    ? { ...item, status: "failed" }
                    : item
            )));
            recordRunnerFailure(currentTarget, error);
            setStatusMessage(error?.shortMessage || error?.message || "回答測定に失敗しました。");
        } finally {
            setShow(false);
            setIsSubmitting(false);
            setOperationPhase("idle");
            operationLockRef.current = false;
            inFlightTargetRef.current = "";
            setMetricsRows(readQuizBenchmarkMetrics());
        }
    };

    const togglePause = () => {
        const next = {
            ...session,
            paused: !session.paused,
        };
        setSession(next);
        writeRunnerSession(next);
    };

    const resetRunnerState = async () => {
        const next = createRunnerSession();
        setSession(next);
        writeRunnerSession(next);
        setStatusMessage("Runner状態をリセットしました。既存benchmark履歴は削除していません。");
        await loadTargets();
        setMetricsRows(readQuizBenchmarkMetrics());
    };

    const downloadCsv = () => {
        const timestamp = buildTimestampForFilename();
        const slug = networkName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        downloadTextFile(`${slug}-answer-runner-${timestamp}.csv`, buildQuizMetricsCsv(sessionRows), "text/csv;charset=utf-8");
    };

    const downloadJson = () => {
        const timestamp = buildTimestampForFilename();
        const slug = networkName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        downloadTextFile(
            `${slug}-answer-runner-${timestamp}.json`,
            JSON.stringify({
                runner_session: session,
                runner_session_id: session.sessionId,
                network: networkName,
                chain_id: amoy.id,
                rpc_url: rpc,
                current_quiz_contract: quiz_address,
                target_student: BENCHMARK_STUDENT_ADDRESS,
                target_start_number: BENCHMARK_QUIZ_START_NUMBER,
                target_end_number: BENCHMARK_QUIZ_END_NUMBER,
                target_benchmark_numbers: targets.map((target) => target.quizNumber),
                target_quiz_ids: targets.map((target) => target.id),
                duplicate_success_metrics: buildDuplicateSuccessSummary(sessionRows),
                rows: sessionRows,
            }, null, 2),
            "application/json;charset=utf-8"
        );
    };

    useEffect(() => {
        loadTargets();
    }, [loadTargets]);

    useEffect(() => {
        const handleUpdate = () => setMetricsRows(readQuizBenchmarkMetrics());
        window.addEventListener(QUIZ_METRICS_UPDATED_EVENT, handleUpdate);
        window.addEventListener("storage", handleUpdate);
        return () => {
            window.removeEventListener(QUIZ_METRICS_UPDATED_EVENT, handleUpdate);
            window.removeEventListener("storage", handleUpdate);
        };
    }, []);

    return (
        <div className="benchmark-page answer-runner-page">
            <Wait_Modal show={show} content={modalContent} />

            <section className="benchmark-header">
                <div>
                    <p className="benchmark-eyebrow">Answer transaction benchmark</p>
                    <h1>回答Runner</h1>
                </div>
                <div className="benchmark-actions">
                    <button type="button" className="btn-secondary-custom" onClick={loadTargets} disabled={isLoading || isSubmitting}>
                        対象更新
                    </button>
                    <button type="button" className="btn-secondary-custom" onClick={downloadJson} disabled={!sessionRows.length}>
                        現在ネットワークのJSON保存
                    </button>
                    <button type="button" className="btn-secondary-custom" onClick={downloadCsv} disabled={!sessionRows.length}>
                        現在ネットワークのCSV保存
                    </button>
                </div>
            </section>

            <section className="benchmark-grid">
                <div className="benchmark-panel">
                    <h2>Runner条件</h2>
                    <dl className="benchmark-definition-list">
                        <div>
                            <dt>Network</dt>
                            <dd>{networkName}</dd>
                        </div>
                        <div>
                            <dt>Chain ID</dt>
                            <dd>{amoy.id} / {chainId}</dd>
                        </div>
                        <div>
                            <dt>RPC URL</dt>
                            <dd>{rpc}</dd>
                        </div>
                        <div>
                            <dt>current Quiz</dt>
                            <dd>{quiz_address}</dd>
                        </div>
                        <div>
                            <dt>対象Student</dt>
                            <dd>{BENCHMARK_STUDENT_ADDRESS}</dd>
                        </div>
                        <div>
                            <dt>接続中</dt>
                            <dd>{access.address || "未接続"}</dd>
                        </div>
                        <div>
                            <dt>対象Quiz</dt>
                            <dd>Benchmark Test Quiz {String(BENCHMARK_QUIZ_START_NUMBER).padStart(2, "0")}〜{String(BENCHMARK_QUIZ_END_NUMBER).padStart(2, "0")}</dd>
                        </div>
                        <div>
                            <dt>Runner開始</dt>
                            <dd>{session.startedAt}</dd>
                        </div>
                    </dl>
                    {!connectedStudent ? (
                        <p className="benchmark-warning">
                            Studentウォレットで接続してから回答測定を実行してください。
                        </p>
                    ) : null}
                </div>

                <div className="benchmark-panel">
                    <h2>進行状況</h2>
                    <div className="answer-runner-kpis">
                        <div>
                            <span>対象Quiz数</span>
                            <strong>{targets.length}</strong>
                        </div>
                        <div>
                            <span>完了数</span>
                            <strong>{completedCount}</strong>
                        </div>
                        <div>
                            <span>未完了数</span>
                            <strong>{pendingTargets.length}</strong>
                        </div>
                        <div>
                            <span>失敗数</span>
                            <strong>{failureCount}</strong>
                        </div>
                    </div>
                    <div className="benchmark-progress">
                        <div className="benchmark-progress-top">
                            <span>{progressLabel}</span>
                            <span>{isPaused ? "一時停止中" : isSubmitting ? `測定中: ${operationPhase}` : "待機中"}</span>
                        </div>
                        <div className="benchmark-progress-track">
                            <div className="benchmark-progress-bar" style={{ width: `${targets.length ? (completedCount / targets.length) * 100 : 0}%` }} />
                        </div>
                    </div>
                    <div className="answer-runner-current">
                        <div>現在のQuizタイトル</div>
                        <strong>{currentTarget?.title || "-"}</strong>
                        <div>現在のQuiz ID</div>
                        <code>{currentTarget?.id ?? "-"}</code>
                    </div>
                    <div className="answer-runner-actions">
                        <button
                            type="button"
                            className="btn-primary-custom"
                            onClick={submitCurrentTarget}
                            disabled={isLoading || isSubmitting || isPaused || !currentTarget || isTargetAnswered(currentTarget)}
                        >
                            {isSubmitting ? "測定中" : "次のQuizを測定"}
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={togglePause} disabled={isSubmitting}>
                            {isPaused ? "測定を再開" : "測定を一時停止"}
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={resetRunnerState} disabled={isSubmitting}>
                            Runner状態をリセット
                        </button>
                    </div>
                    <p className="benchmark-note">{statusMessage || "対象Quizを読み込んでいます。"}</p>
                </div>
            </section>

            <section className="benchmark-panel">
                <h2>answer_tx_confirmation</h2>
                <div className="answer-runner-kpis answer-runner-kpis--wide">
                    <div>
                        <span>最新値</span>
                        <strong>{latestConfirmation ? `${formatNumber(latestConfirmation.duration_ms)} ms` : "-"}</strong>
                    </div>
                    <div>
                        <span>mean</span>
                        <strong>{formatNumber(confirmationStats.mean)} ms</strong>
                    </div>
                    <div>
                        <span>median</span>
                        <strong>{formatNumber(confirmationStats.median)} ms</strong>
                    </div>
                    <div>
                        <span>p95</span>
                        <strong>{formatNumber(confirmationStats.p95)} ms</strong>
                    </div>
                    <div>
                        <span>std dev</span>
                        <strong>{formatNumber(confirmationStats.standardDeviation)} ms</strong>
                    </div>
                </div>
                <div className={formalCompletionReady ? "benchmark-success" : "benchmark-warning"}>
                    正式完了条件:
                    answer_tx_confirmation count {confirmationStats.total} / success {confirmationStats.successCount} / failure {confirmationStats.failureCount} / 重複 {duplicateConfirmationMetrics.length}
                    {formalCompletionReady ? "。正式測定として集計可能です。" : "。30件成功・失敗0・重複0になるまで正式完了扱いにはしません。"}
                </div>
                {duplicateSuccessMetrics.length > 0 ? (
                    <div className="benchmark-warning">
                        補助指標を含む同一Benchmark番号の成功metric重複があります。正式完了条件ではanswer_tx_confirmationの重複だけを判定します:
                        {" "}
                        {duplicateSuccessMetrics.map((item) => (
                            `${item.metric_name} #${item.benchmark_number} (${item.count}件)`
                        )).join(" / ")}
                    </div>
                ) : null}
            </section>

            <section className="benchmark-panel">
                <h2>補助指標</h2>
                <div className="benchmark-table-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                <th>項目</th>
                                <th>測定</th>
                                <th>成功</th>
                                <th>失敗</th>
                                <th>mean</th>
                                <th>median</th>
                                <th>p95</th>
                                <th>std dev</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metricStats.map((stat) => (
                                <tr key={stat.metricName}>
                                    <td>{stat.label}</td>
                                    <td>{stat.total}</td>
                                    <td>{stat.successCount}</td>
                                    <td>{stat.failureCount}</td>
                                    <td>{formatNumber(stat.mean)}</td>
                                    <td>{formatNumber(stat.median)}</td>
                                    <td>{formatNumber(stat.p95)}</td>
                                    <td>{formatNumber(stat.standardDeviation)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

export default AnswerRunner;
