import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPublicClient, http } from "viem";
import { token_abi, quiz_abi } from "../../contract/contractClients";
import { amoy } from "../../contract/network";
import { chainId, rpc, class_room_address, quiz_address, token_address } from "../../contract/config";
import {
    QUIZ_METRIC_CSV_HEADERS,
    QUIZ_METRIC_NAMES,
    QUIZ_METRICS_UPDATED_EVENT,
    SCREEN_METRIC_CSV_HEADERS,
    SCREEN_METRICS_UPDATED_EVENT,
    SCREEN_NAMES,
    buildQuizMetricsCsv,
    buildScreenMetricsCsv,
    calculateQuizMetricStats,
    calculateScreenMetricStats,
    clearQuizBenchmarkMetrics,
    clearScreenBenchmarkMetrics,
    getQuizBenchmarkFileSlug,
    getScreenBenchmarkFileSlug,
    readQuizBenchmarkMetrics,
    readScreenBenchmarkMetrics,
} from "../../utils/performanceBenchmark";
import "./benchmark.css";

const BENCHMARK_WALLET_ADDRESS = "0x65Fb0D4a40181a4ab3Cd752F40aF16033873aEAf";
const MEASUREMENT_DELAY_MS = 500;
const ATTEMPT_OPTIONS = [10, 30, 50, 100];

const CLASSROOM_PLATFORM_TOKEN_ABI = [
    {
        inputs: [],
        name: "get_platform_token_addresses",
        outputs: [
            { internalType: "address", name: "tft_token", type: "address" },
            { internalType: "address", name: "ttt_token", type: "address" },
        ],
        stateMutability: "view",
        type: "function",
    },
];

const CSV_HEADERS = [
    "network",
    "chain_id",
    "rpc_url",
    "metric_name",
    "attempt",
    "started_at",
    "duration_ms",
    "success",
    "error_message",
    "contract_address",
    "wallet_address",
];

function getBenchmarkNetworkName() {
    if (Number(amoy.id) === 80002) return "Polygon Amoy";
    if (Number(amoy.id) === 43113) return "Avalanche Fuji";
    return amoy.name || "Unknown Network";
}

function getBenchmarkFileSlug() {
    return getBenchmarkNetworkName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createBenchmarkClient() {
    return createPublicClient({
        chain: amoy,
        transport: http(rpc, {
            batch: false,
            retryCount: 0,
            retryDelay: 120,
            timeout: 2500,
        }),
    });
}

let rpcRequestId = 0;

async function requestBlockNumberDirectly() {
    rpcRequestId += 1;
    const response = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: rpcRequestId,
            method: "eth_blockNumber",
            params: [],
        }),
    });

    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        throw new Error(`eth_blockNumber response JSON parse failed: ${error?.message || String(error)}`);
    }

    if (!response.ok) {
        const message = payload?.error?.message || response.statusText || "HTTP error";
        throw new Error(`eth_blockNumber HTTP ${response.status}: ${message}`);
    }

    if (payload?.error) {
        throw new Error(payload.error.message || JSON.stringify(payload.error));
    }

    if (typeof payload?.result !== "string" || !payload.result) {
        throw new Error("eth_blockNumber response missing result");
    }

    return payload.result;
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatNumber(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "-";
    return Number(value).toFixed(digits);
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

function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function buildCsv(rows) {
    const lines = [CSV_HEADERS.join(",")];
    rows.forEach((row) => {
        lines.push(CSV_HEADERS.map((header) => escapeCsvValue(row[header])).join(","));
    });
    return lines.join("\r\n");
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

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
    return sortedValues[index];
}

function calculateStats(rows, metricName) {
    const metricRows = rows.filter((row) => row.metric_name === metricName);
    const successfulDurations = metricRows
        .filter((row) => row.success)
        .map((row) => Number(row.duration_ms))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);

    const successCount = successfulDurations.length;
    const failureCount = metricRows.length - successCount;
    const mean = successCount
        ? successfulDurations.reduce((sum, value) => sum + value, 0) / successCount
        : null;
    const median = successCount
        ? successCount % 2 === 0
            ? (successfulDurations[successCount / 2 - 1] + successfulDurations[successCount / 2]) / 2
            : successfulDurations[Math.floor(successCount / 2)]
        : null;
    const standardDeviation = successCount && mean != null
        ? Math.sqrt(successfulDurations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / successCount)
        : null;

    return {
        metricName,
        total: metricRows.length,
        successCount,
        failureCount,
        successRate: metricRows.length ? (successCount / metricRows.length) * 100 : 0,
        min: successCount ? successfulDurations[0] : null,
        max: successCount ? successfulDurations[successCount - 1] : null,
        mean,
        median,
        p95: percentile(successfulDurations, 0.95),
        standardDeviation,
    };
}

function Benchmark() {
    const [attemptCount, setAttemptCount] = useState(30);
    const [rows, setRows] = useState([]);
    const [screenRows, setScreenRows] = useState(() => readScreenBenchmarkMetrics());
    const [quizRows, setQuizRows] = useState(() => readQuizBenchmarkMetrics());
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ completed: 0, total: 0, label: "" });

    const networkName = useMemo(() => getBenchmarkNetworkName(), []);
    const fileSlug = useMemo(() => getBenchmarkFileSlug(), []);
    const screenFileSlug = useMemo(() => getScreenBenchmarkFileSlug(), []);
    const quizFileSlug = useMemo(() => getQuizBenchmarkFileSlug(), []);
    const publicClient = useMemo(() => createBenchmarkClient(), []);

    const metrics = useMemo(() => [
        {
            name: "rpc_getBlockNumber",
            label: "RPC基本応答時間",
            contractAddress: "",
            walletAddress: "",
            run: () => requestBlockNumberDirectly(),
        },
        {
            name: "classroom_get_platform_token_addresses",
            label: "ClassRoom読み取り",
            contractAddress: class_room_address,
            walletAddress: "",
            run: () => publicClient.readContract({
                address: class_room_address,
                abi: CLASSROOM_PLATFORM_TOKEN_ABI,
                functionName: "get_platform_token_addresses",
                args: [],
            }),
        },
        {
            name: "quiz_get_quiz_length",
            label: "Quiz読み取り",
            contractAddress: quiz_address,
            walletAddress: "",
            run: () => publicClient.readContract({
                address: quiz_address,
                abi: quiz_abi,
                functionName: "get_quiz_length",
                args: [],
            }),
        },
        {
            name: "tft_balanceOf_teacher",
            label: "TFT残高読み取り",
            contractAddress: token_address,
            walletAddress: BENCHMARK_WALLET_ADDRESS,
            run: () => publicClient.readContract({
                address: token_address,
                abi: token_abi,
                functionName: "balanceOf",
                args: [BENCHMARK_WALLET_ADDRESS],
            }),
        },
    ], [publicClient]);

    const statsRows = useMemo(
        () => metrics.map((metric) => ({
            ...calculateStats(rows, metric.name),
            label: metric.label,
        })),
        [metrics, rows]
    );

    const currentNetworkScreenRows = useMemo(
        () => screenRows.filter((row) => row.metric_type === "screen_load" && row.network === networkName && Number(row.chain_id) === Number(amoy.id)),
        [networkName, screenRows]
    );

    const screenStatsRows = useMemo(
        () => SCREEN_NAMES.map((screenName) => calculateScreenMetricStats(currentNetworkScreenRows, screenName)),
        [currentNetworkScreenRows]
    );

    const latestScreenRows = useMemo(
        () => currentNetworkScreenRows.slice(-50).reverse(),
        [currentNetworkScreenRows]
    );

    const currentNetworkQuizRows = useMemo(
        () => quizRows.filter((row) => row.metric_type === "quiz_operation" && row.network === networkName && Number(row.chain_id) === Number(amoy.id)),
        [networkName, quizRows]
    );

    const quizStatsRows = useMemo(
        () => QUIZ_METRIC_NAMES.map((metric) => calculateQuizMetricStats(currentNetworkQuizRows, metric.name)),
        [currentNetworkQuizRows]
    );

    const latestQuizRows = useMemo(
        () => currentNetworkQuizRows.slice(-50).reverse(),
        [currentNetworkQuizRows]
    );

    useEffect(() => {
        const refreshScreenRows = () => setScreenRows(readScreenBenchmarkMetrics());
        refreshScreenRows();
        window.addEventListener(SCREEN_METRICS_UPDATED_EVENT, refreshScreenRows);
        window.addEventListener("storage", refreshScreenRows);
        return () => {
            window.removeEventListener(SCREEN_METRICS_UPDATED_EVENT, refreshScreenRows);
            window.removeEventListener("storage", refreshScreenRows);
        };
    }, []);

    useEffect(() => {
        const refreshQuizRows = () => setQuizRows(readQuizBenchmarkMetrics());
        refreshQuizRows();
        window.addEventListener(QUIZ_METRICS_UPDATED_EVENT, refreshQuizRows);
        window.addEventListener("storage", refreshQuizRows);
        return () => {
            window.removeEventListener(QUIZ_METRICS_UPDATED_EVENT, refreshQuizRows);
            window.removeEventListener("storage", refreshQuizRows);
        };
    }, []);

    const runBenchmark = async () => {
        if (isRunning) return;

        setRows([]);
        setIsRunning(true);

        const nextRows = [];
        const total = metrics.length * attemptCount;
        let completed = 0;

        try {
            for (const metric of metrics) {
                for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
                    const startedAt = new Date().toISOString();
                    const start = performance.now();
                    let success = true;
                    let errorMessage = "";

                    setProgress({
                        completed,
                        total,
                        label: `${metric.label} ${attempt}/${attemptCount}`,
                    });

                    try {
                        await metric.run();
                    } catch (error) {
                        success = false;
                        errorMessage = error?.shortMessage || error?.message || String(error);
                    }

                    const durationMs = performance.now() - start;
                    nextRows.push({
                        network: networkName,
                        chain_id: amoy.id,
                        rpc_url: rpc,
                        metric_name: metric.name,
                        attempt,
                        started_at: startedAt,
                        duration_ms: Number(durationMs.toFixed(3)),
                        success,
                        error_message: errorMessage,
                        contract_address: metric.contractAddress,
                        wallet_address: metric.walletAddress,
                    });

                    completed += 1;
                    setRows([...nextRows]);
                    setProgress({
                        completed,
                        total,
                        label: `${metric.label} ${attempt}/${attemptCount}`,
                    });

                    if (completed < total) {
                        await sleep(MEASUREMENT_DELAY_MS);
                    }
                }
            }
        } finally {
            setIsRunning(false);
        }
    };

    const downloadCsv = () => {
        if (!rows.length) return;
        downloadTextFile(
            `${fileSlug}-benchmark-${buildTimestampForFilename()}.csv`,
            buildCsv(rows),
            "text/csv;charset=utf-8"
        );
    };

    const downloadJson = () => {
        if (!rows.length) return;
        downloadTextFile(
            `${fileSlug}-benchmark-${buildTimestampForFilename()}.json`,
            JSON.stringify(rows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const downloadScreenCsv = () => {
        if (!currentNetworkScreenRows.length) return;
        downloadTextFile(
            `${screenFileSlug}-screen-benchmark-${buildTimestampForFilename()}.csv`,
            buildScreenMetricsCsv(currentNetworkScreenRows),
            "text/csv;charset=utf-8"
        );
    };

    const downloadScreenJson = () => {
        if (!currentNetworkScreenRows.length) return;
        downloadTextFile(
            `${screenFileSlug}-screen-benchmark-${buildTimestampForFilename()}.json`,
            JSON.stringify(currentNetworkScreenRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const downloadQuizCsv = () => {
        if (!currentNetworkQuizRows.length) return;
        downloadTextFile(
            `${quizFileSlug}-quiz-operation-benchmark-${buildTimestampForFilename()}.csv`,
            buildQuizMetricsCsv(currentNetworkQuizRows),
            "text/csv;charset=utf-8"
        );
    };

    const downloadQuizJson = () => {
        if (!currentNetworkQuizRows.length) return;
        downloadTextFile(
            `${quizFileSlug}-quiz-operation-benchmark-${buildTimestampForFilename()}.json`,
            JSON.stringify(currentNetworkQuizRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const clearScreenRows = () => {
        if (!window.confirm("実画面測定履歴だけをクリアしますか。既存のQuizキャッシュやユーザー情報は削除しません。")) return;
        clearScreenBenchmarkMetrics();
        setScreenRows([]);
    };

    const clearQuizRows = () => {
        if (!window.confirm("Quiz実操作測定履歴だけをクリアしますか。既存のQuizキャッシュやユーザー情報は削除しません。")) return;
        clearQuizBenchmarkMetrics();
        setQuizRows([]);
    };

    const progressRate = progress.total ? (progress.completed / progress.total) * 100 : 0;

    return (
        <div className="benchmark-page">
            <section className="benchmark-header">
                <div>
                    <p className="benchmark-eyebrow">Read-only RPC benchmark</p>
                    <h1>応答速度測定</h1>
                </div>
                <div className="benchmark-actions">
                    <Link className="btn-secondary-custom benchmark-link-button" to="/benchmark/answer-runner">
                        回答Runner
                    </Link>
                    <button type="button" className="btn-secondary-custom" onClick={downloadJson} disabled={!rows.length || isRunning}>
                        JSON保存
                    </button>
                    <button type="button" className="btn-secondary-custom" onClick={downloadCsv} disabled={!rows.length || isRunning}>
                        CSV保存
                    </button>
                </div>
            </section>

            <section className="benchmark-grid">
                <div className="benchmark-panel">
                    <h2>測定条件</h2>
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
                            <dt>ClassRoom</dt>
                            <dd>{class_room_address}</dd>
                        </div>
                        <div>
                            <dt>Quiz</dt>
                            <dd>{quiz_address}</dd>
                        </div>
                        <div>
                            <dt>TFT</dt>
                            <dd>{token_address}</dd>
                        </div>
                        <div>
                            <dt>Balance wallet</dt>
                            <dd>{BENCHMARK_WALLET_ADDRESS}</dd>
                        </div>
                    </dl>
                </div>

                <div className="benchmark-panel">
                    <h2>実行</h2>
                    <label className="benchmark-field">
                        <span>試行回数</span>
                        <select value={attemptCount} onChange={(event) => setAttemptCount(Number(event.target.value))} disabled={isRunning}>
                            {ATTEMPT_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}回</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" className="btn-primary-custom benchmark-start-button" onClick={runBenchmark} disabled={isRunning}>
                        {isRunning ? "測定中" : "測定開始"}
                    </button>
                    <div className="benchmark-progress">
                        <div className="benchmark-progress-top">
                            <span>{progress.label || "待機中"}</span>
                            <span>{progress.completed}/{progress.total || metrics.length * attemptCount}</span>
                        </div>
                        <div className="benchmark-progress-track">
                            <div className="benchmark-progress-bar" style={{ width: `${progressRate}%` }} />
                        </div>
                    </div>
                    <p className="benchmark-note">
                        4項目を逐次実行し、各試行の間に{MEASUREMENT_DELAY_MS}ms待機します。
                    </p>
                </div>
            </section>

            <section className="benchmark-panel">
                <h2>集計結果</h2>
                <div className="benchmark-table-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                <th>項目</th>
                                <th>試行</th>
                                <th>成功</th>
                                <th>失敗</th>
                                <th>成功率</th>
                                <th>min</th>
                                <th>max</th>
                                <th>mean</th>
                                <th>median</th>
                                <th>p95</th>
                                <th>std dev</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statsRows.map((stat) => (
                                <tr key={stat.metricName}>
                                    <td>{stat.label}</td>
                                    <td>{stat.total}</td>
                                    <td>{stat.successCount}</td>
                                    <td>{stat.failureCount}</td>
                                    <td>{formatNumber(stat.successRate)}%</td>
                                    <td>{formatNumber(stat.min)}</td>
                                    <td>{formatNumber(stat.max)}</td>
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

            <section className="benchmark-panel">
                <h2>結果一覧</h2>
                <div className="benchmark-table-wrap benchmark-results-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                {CSV_HEADERS.map((header) => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={CSV_HEADERS.length}>測定結果はまだありません。</td>
                                </tr>
                            ) : rows.map((row, index) => (
                                <tr key={`${row.metric_name}-${row.attempt}-${index}`}>
                                    {CSV_HEADERS.map((header) => (
                                        <td key={header}>{String(row[header] ?? "")}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="benchmark-panel">
                <div className="benchmark-panel-header">
                    <h2>実画面応答測定履歴</h2>
                    <div className="benchmark-actions">
                        <button type="button" className="btn-secondary-custom" onClick={() => setScreenRows(readScreenBenchmarkMetrics())}>
                            履歴更新
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={clearScreenRows} disabled={!screenRows.length}>
                            履歴クリア
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={downloadScreenJson} disabled={!currentNetworkScreenRows.length}>
                            画面JSON保存
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={downloadScreenCsv} disabled={!currentNetworkScreenRows.length}>
                            画面CSV保存
                        </button>
                    </div>
                </div>
                <div className="benchmark-table-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                <th>画面</th>
                                <th>測定</th>
                                <th>成功</th>
                                <th>失敗</th>
                                <th>成功率</th>
                                <th>total min</th>
                                <th>total max</th>
                                <th>total mean</th>
                                <th>total median</th>
                                <th>total p95</th>
                                <th>total std</th>
                                <th>blockchain mean</th>
                                <th>blockchain p95</th>
                            </tr>
                        </thead>
                        <tbody>
                            {screenStatsRows.map((stat) => (
                                <tr key={stat.screenName}>
                                    <td>{stat.screenName}</td>
                                    <td>{stat.total}</td>
                                    <td>{stat.successCount}</td>
                                    <td>{stat.failureCount}</td>
                                    <td>{formatNumber(stat.successRate)}%</td>
                                    <td>{formatNumber(stat.min)}</td>
                                    <td>{formatNumber(stat.max)}</td>
                                    <td>{formatNumber(stat.mean)}</td>
                                    <td>{formatNumber(stat.median)}</td>
                                    <td>{formatNumber(stat.p95)}</td>
                                    <td>{formatNumber(stat.standardDeviation)}</td>
                                    <td>{formatNumber(stat.blockchainMean)}</td>
                                    <td>{formatNumber(stat.blockchainP95)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="benchmark-panel">
                <h2>実画面ログ一覧</h2>
                <div className="benchmark-table-wrap benchmark-results-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                {SCREEN_METRIC_CSV_HEADERS.map((header) => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {latestScreenRows.length === 0 ? (
                                <tr>
                                    <td colSpan={SCREEN_METRIC_CSV_HEADERS.length}>実画面応答の測定履歴はまだありません。</td>
                                </tr>
                            ) : latestScreenRows.map((row) => (
                                <tr key={row.run_id}>
                                    {SCREEN_METRIC_CSV_HEADERS.map((header) => (
                                        <td key={header}>{String(row[header] ?? "")}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="benchmark-panel">
                <div className="benchmark-panel-header">
                    <h2>Quiz実操作測定</h2>
                    <div className="benchmark-actions">
                        <button type="button" className="btn-secondary-custom" onClick={() => setQuizRows(readQuizBenchmarkMetrics())}>
                            履歴更新
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={clearQuizRows} disabled={!quizRows.length}>
                            履歴クリア
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={downloadQuizJson} disabled={!currentNetworkQuizRows.length}>
                            Quiz JSON保存
                        </button>
                        <button type="button" className="btn-secondary-custom" onClick={downloadQuizCsv} disabled={!currentNetworkQuizRows.length}>
                            Quiz CSV保存
                        </button>
                    </div>
                </div>
                <p className="benchmark-note">
                    Quiz詳細ページ表示と回答送信のTx確定時間は、通常のQuiz操作時に自動で記録されます。
                </p>
                <div className="benchmark-table-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                <th>項目</th>
                                <th>測定</th>
                                <th>成功</th>
                                <th>失敗</th>
                                <th>成功率</th>
                                <th>min</th>
                                <th>max</th>
                                <th>mean</th>
                                <th>median</th>
                                <th>p95</th>
                                <th>std dev</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quizStatsRows.map((stat) => (
                                <tr key={stat.metricName}>
                                    <td>{stat.label}</td>
                                    <td>{stat.total}</td>
                                    <td>{stat.successCount}</td>
                                    <td>{stat.failureCount}</td>
                                    <td>{formatNumber(stat.successRate)}%</td>
                                    <td>{formatNumber(stat.min)}</td>
                                    <td>{formatNumber(stat.max)}</td>
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

            <section className="benchmark-panel">
                <h2>Quiz実操作ログ一覧</h2>
                <div className="benchmark-table-wrap benchmark-results-wrap">
                    <table className="benchmark-table">
                        <thead>
                            <tr>
                                {QUIZ_METRIC_CSV_HEADERS.map((header) => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {latestQuizRows.length === 0 ? (
                                <tr>
                                    <td colSpan={QUIZ_METRIC_CSV_HEADERS.length}>Quiz実操作の測定履歴はまだありません。</td>
                                </tr>
                            ) : latestQuizRows.map((row) => (
                                <tr key={`${row.metric_name}-${row.attempt}-${row.started_at}`}>
                                    {QUIZ_METRIC_CSV_HEADERS.map((header) => (
                                        <td key={header}>{String(row[header] ?? "")}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

export default Benchmark;
