import { amoy } from "../contract/network";
import { rpc } from "../contract/config";

const SCREEN_METRICS_STORAGE_KEY = "web3_benchmark_screen_metrics_v1";
const SCREEN_METRICS_UPDATED_EVENT = "web3-benchmark-screen-metrics-updated";
const SCREEN_METRIC_TYPE = "screen_load";

const SCREEN_METRIC_CSV_HEADERS = [
    "network",
    "chain_id",
    "rpc_url",
    "metric_type",
    "screen_name",
    "route",
    "run_id",
    "started_at",
    "duration_ms",
    "screen_total_ms",
    "screen_blockchain_ms",
    "success",
    "error_message",
    "wallet_address",
    "cache_state",
    "quiz_count",
    "student_count",
    "teacher_count",
    "history_count",
    "ranking_count",
    "answer_count",
];

const SCREEN_NAMES = [
    "Dashboard",
    "Quiz List",
    "Ranking",
    "User Page",
];

const QUIZ_METRICS_STORAGE_KEY = "web3_benchmark_quiz_metrics_v1";
const QUIZ_METRICS_UPDATED_EVENT = "web3-benchmark-quiz-metrics-updated";
const QUIZ_METRIC_TYPE = "quiz_operation";

const QUIZ_METRIC_CSV_HEADERS = [
    "network",
    "chain_id",
    "rpc_url",
    "metric_type",
    "metric_name",
    "quiz_id",
    "attempt",
    "started_at",
    "duration_ms",
    "success",
    "error_message",
    "wallet_address",
    "tx_hash",
    "block_number",
    "quiz_count",
    "receipt_status",
    "gas_used",
];

const QUIZ_METRIC_NAMES = [
    { name: "quiz_detail_load", label: "Quiz詳細表示" },
    { name: "answer_tx_hash_wait_from_click", label: "回答Tx Hash取得" },
    { name: "answer_tx_confirmation", label: "回答Tx確定" },
    { name: "answer_post_refresh", label: "回答後再取得" },
    { name: "answer_total_after_hash", label: "Hash後から最終反映" },
];

function getBenchmarkNetworkName() {
    if (Number(amoy.id) === 80002) return "Polygon Amoy";
    if (Number(amoy.id) === 43113) return "Avalanche Fuji";
    return amoy.name || "Unknown Network";
}

function getScreenBenchmarkFileSlug() {
    return getBenchmarkNetworkName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getQuizBenchmarkFileSlug() {
    return getScreenBenchmarkFileSlug();
}

function getCurrentRoute(fallbackRoute = "") {
    if (typeof window === "undefined") return fallbackRoute;
    const path = window.location?.pathname || fallbackRoute;
    const search = window.location?.search || "";
    const hash = window.location?.hash || "";
    return `${path}${search}${hash}` || fallbackRoute;
}

function getNow() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

function normalizeErrorMessage(error) {
    if (!error) return "";
    return error?.shortMessage || error?.message || String(error);
}

function createRunId(screenName) {
    const prefix = String(screenName || "screen").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeMetricValue(value) {
    if (typeof value === "bigint") return value.toString();
    if (value == null) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    if (typeof value === "boolean") return value;
    return String(value);
}

function normalizeDuration(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Number(numericValue.toFixed(3)) : "";
}

function readScreenBenchmarkMetrics() {
    if (typeof localStorage === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(SCREEN_METRICS_STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read screen benchmark metrics", error);
        return [];
    }
}

function writeScreenBenchmarkMetrics(rows) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SCREEN_METRICS_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
}

function emitScreenMetricsUpdated() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SCREEN_METRICS_UPDATED_EVENT));
}

function clearScreenBenchmarkMetrics() {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(SCREEN_METRICS_STORAGE_KEY);
    emitScreenMetricsUpdated();
}

function appendScreenBenchmarkMetric(row) {
    try {
        const rows = readScreenBenchmarkMetrics();
        const nextRows = [...rows, row];
        writeScreenBenchmarkMetrics(nextRows);
        emitScreenMetricsUpdated();
    } catch (error) {
        console.error("Failed to persist screen benchmark metric", error);
    }
    return row;
}

function readQuizBenchmarkMetrics() {
    if (typeof localStorage === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(QUIZ_METRICS_STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read quiz benchmark metrics", error);
        return [];
    }
}

function writeQuizBenchmarkMetrics(rows) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(QUIZ_METRICS_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
}

function emitQuizMetricsUpdated() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(QUIZ_METRICS_UPDATED_EVENT));
}

function clearQuizBenchmarkMetrics() {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(QUIZ_METRICS_STORAGE_KEY);
    emitQuizMetricsUpdated();
}

function getNextQuizMetricAttempt(rows, row) {
    return rows.filter((item) => (
        item.metric_name === row.metric_name
        && item.network === row.network
        && Number(item.chain_id) === Number(row.chain_id)
    )).length + 1;
}

function appendQuizBenchmarkMetric(row = {}) {
    try {
        const rows = readQuizBenchmarkMetrics();
        const baseRow = {
            network: row.network || getBenchmarkNetworkName(),
            chain_id: row.chain_id ?? amoy.id,
            rpc_url: row.rpc_url ?? rpc,
            metric_type: row.metric_type || QUIZ_METRIC_TYPE,
            metric_name: row.metric_name || row.metricName || "",
            quiz_id: row.quiz_id ?? row.quizId ?? "",
            attempt: row.attempt,
            started_at: row.started_at || new Date().toISOString(),
            duration_ms: normalizeDuration(row.duration_ms ?? row.durationMs),
            success: row.success !== false,
            error_message: row.error_message || row.errorMessage || normalizeErrorMessage(row.error),
            wallet_address: row.wallet_address || row.walletAddress || "",
            tx_hash: row.tx_hash || row.txHash || "",
            block_number: row.block_number ?? row.blockNumber ?? "",
            quiz_count: row.quiz_count ?? row.quizCount ?? "",
            receipt_status: row.receipt_status ?? row.receiptStatus ?? "",
            gas_used: row.gas_used ?? row.gasUsed ?? "",
        };
        const attemptNumber = Number(baseRow.attempt);
        const normalizedRow = {
            ...baseRow,
            attempt: Number.isFinite(attemptNumber) && attemptNumber > 0
                ? attemptNumber
                : getNextQuizMetricAttempt(rows, baseRow),
            block_number: normalizeMetricValue(baseRow.block_number),
            quiz_count: normalizeMetricValue(baseRow.quiz_count),
            gas_used: normalizeMetricValue(baseRow.gas_used),
        };
        const nextRows = [...rows, normalizedRow];
        writeQuizBenchmarkMetrics(nextRows);
        emitQuizMetricsUpdated();
        return normalizedRow;
    } catch (error) {
        console.error("Failed to persist quiz benchmark metric", error);
        return row;
    }
}

function beginScreenLoadBenchmark({
    screenName,
    route = "",
    walletAddress = "",
    cacheState = "unknown",
} = {}) {
    const startedAt = new Date().toISOString();
    const start = getNow();
    const runId = createRunId(screenName);
    let finished = false;
    let blockchainDurationMs = 0;
    let context = {};

    const normalizeContext = (nextContext = {}) => ({
        quiz_count: nextContext.quiz_count ?? "",
        student_count: nextContext.student_count ?? "",
        teacher_count: nextContext.teacher_count ?? "",
        history_count: nextContext.history_count ?? "",
        ranking_count: nextContext.ranking_count ?? "",
        answer_count: nextContext.answer_count ?? "",
    });

    return {
        runId,
        async measureBlockchain(operation) {
            const blockchainStart = getNow();
            try {
                return await operation();
            } finally {
                blockchainDurationMs += getNow() - blockchainStart;
            }
        },
        setContext(nextContext = {}) {
            context = {
                ...context,
                ...nextContext,
            };
        },
        finish({
            success = true,
            error = null,
            errorMessage = "",
            walletAddress: nextWalletAddress = walletAddress,
            cacheState: nextCacheState = cacheState,
            context: finishContext = {},
        } = {}) {
            if (finished) return null;
            finished = true;

            const durationMs = getNow() - start;
            const normalizedContext = normalizeContext({
                ...context,
                ...finishContext,
            });
            return appendScreenBenchmarkMetric({
                network: getBenchmarkNetworkName(),
                chain_id: amoy.id,
                rpc_url: rpc,
                metric_type: SCREEN_METRIC_TYPE,
                screen_name: screenName || "",
                route: route || getCurrentRoute(""),
                run_id: runId,
                started_at: startedAt,
                duration_ms: Number(durationMs.toFixed(3)),
                screen_total_ms: Number(durationMs.toFixed(3)),
                screen_blockchain_ms: Number(blockchainDurationMs.toFixed(3)),
                success: success !== false,
                error_message: errorMessage || normalizeErrorMessage(error),
                wallet_address: nextWalletAddress || "",
                cache_state: nextCacheState || "unknown",
                ...normalizedContext,
            });
        },
    };
}

function beginQuizOperationBenchmark({
    metricName,
    quizId = "",
    walletAddress = "",
    txHash = "",
    quizCount = "",
} = {}) {
    const startedAt = new Date().toISOString();
    const start = getNow();
    let finished = false;

    return {
        startedAt,
        start,
        finish({
            success = true,
            error = null,
            errorMessage = "",
            walletAddress: nextWalletAddress = walletAddress,
            txHash: nextTxHash = txHash,
            blockNumber = "",
            quizCount: nextQuizCount = quizCount,
            receiptStatus = "",
            gasUsed = "",
        } = {}) {
            if (finished) return null;
            finished = true;

            return appendQuizBenchmarkMetric({
                metric_name: metricName,
                quiz_id: quizId,
                started_at: startedAt,
                duration_ms: getNow() - start,
                success,
                error,
                error_message: errorMessage,
                wallet_address: nextWalletAddress,
                tx_hash: nextTxHash,
                block_number: blockNumber,
                quiz_count: nextQuizCount,
                receipt_status: receiptStatus,
                gas_used: gasUsed,
            });
        },
    };
}

function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function buildScreenMetricsCsv(rows) {
    const lines = [SCREEN_METRIC_CSV_HEADERS.join(",")];
    rows.forEach((row) => {
        lines.push(SCREEN_METRIC_CSV_HEADERS.map((header) => escapeCsvValue(row[header])).join(","));
    });
    return lines.join("\r\n");
}

function buildQuizMetricsCsv(rows) {
    const lines = [QUIZ_METRIC_CSV_HEADERS.join(",")];
    rows.forEach((row) => {
        lines.push(QUIZ_METRIC_CSV_HEADERS.map((header) => escapeCsvValue(row[header])).join(","));
    });
    return lines.join("\r\n");
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
    return sortedValues[index];
}

function getDurationValues(rows, fieldName) {
    return rows
        .filter((row) => row.success)
        .map((row) => {
            if (row[fieldName] != null) return Number(row[fieldName]);
            if (fieldName === "screen_blockchain_ms") return Number(row.blockchain_duration_ms);
            if (fieldName === "duration_ms") return Number(row.screen_total_ms);
            return Number.NaN;
        })
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
}

function summarizeDurations(values) {
    const count = values.length;
    const mean = count
        ? values.reduce((sum, value) => sum + value, 0) / count
        : null;
    const median = count
        ? count % 2 === 0
            ? (values[count / 2 - 1] + values[count / 2]) / 2
            : values[Math.floor(count / 2)]
        : null;
    const standardDeviation = count && mean != null
        ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count)
        : null;

    return {
        min: count ? values[0] : null,
        max: count ? values[count - 1] : null,
        mean,
        median,
        p95: percentile(values, 0.95),
        standardDeviation,
    };
}

function calculateScreenMetricStats(rows, screenName) {
    const screenRows = rows.filter((row) => row.screen_name === screenName);
    const successfulDurations = getDurationValues(screenRows, "duration_ms");
    const blockchainDurations = getDurationValues(screenRows, "screen_blockchain_ms");
    const totalStats = summarizeDurations(successfulDurations);
    const blockchainStats = summarizeDurations(blockchainDurations);

    const successCount = successfulDurations.length;
    const failureCount = screenRows.length - successCount;

    return {
        screenName,
        total: screenRows.length,
        successCount,
        failureCount,
        successRate: screenRows.length ? (successCount / screenRows.length) * 100 : 0,
        min: totalStats.min,
        max: totalStats.max,
        mean: totalStats.mean,
        median: totalStats.median,
        p95: totalStats.p95,
        standardDeviation: totalStats.standardDeviation,
        blockchainMin: blockchainStats.min,
        blockchainMax: blockchainStats.max,
        blockchainMean: blockchainStats.mean,
        blockchainMedian: blockchainStats.median,
        blockchainP95: blockchainStats.p95,
        blockchainStandardDeviation: blockchainStats.standardDeviation,
    };
}

function calculateQuizMetricStats(rows, metricName) {
    const metricRows = rows.filter((row) => row.metric_name === metricName);
    const successfulDurations = getDurationValues(metricRows, "duration_ms");
    const durationStats = summarizeDurations(successfulDurations);
    const successCount = successfulDurations.length;
    const failureCount = metricRows.length - successCount;
    const metricMeta = QUIZ_METRIC_NAMES.find((item) => item.name === metricName);

    return {
        metricName,
        label: metricMeta?.label || metricName,
        total: metricRows.length,
        successCount,
        failureCount,
        successRate: metricRows.length ? (successCount / metricRows.length) * 100 : 0,
        min: durationStats.min,
        max: durationStats.max,
        mean: durationStats.mean,
        median: durationStats.median,
        p95: durationStats.p95,
        standardDeviation: durationStats.standardDeviation,
    };
}

export {
    QUIZ_METRIC_CSV_HEADERS,
    QUIZ_METRIC_NAMES,
    QUIZ_METRICS_STORAGE_KEY,
    QUIZ_METRICS_UPDATED_EVENT,
    SCREEN_METRIC_CSV_HEADERS,
    SCREEN_METRICS_STORAGE_KEY,
    SCREEN_METRICS_UPDATED_EVENT,
    SCREEN_NAMES,
    beginScreenLoadBenchmark,
    beginQuizOperationBenchmark,
    buildScreenMetricsCsv,
    buildQuizMetricsCsv,
    calculateScreenMetricStats,
    calculateQuizMetricStats,
    clearQuizBenchmarkMetrics,
    clearScreenBenchmarkMetrics,
    appendQuizBenchmarkMetric,
    getBenchmarkNetworkName,
    getQuizBenchmarkFileSlug,
    getScreenBenchmarkFileSlug,
    readQuizBenchmarkMetrics,
    readScreenBenchmarkMetrics,
};
