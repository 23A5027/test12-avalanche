import React, { useEffect, useMemo, useState } from "react";
import {
    ACTION_TYPES,
    clearActivityLogs,
    exportLogsAsCsv,
    exportLogsAsJson,
    formatActionLabel,
    formatDateTime,
    getMergedActivityLogs,
    syncSharedActivityLogs,
} from "../../../utils/activityLog";
import "./activity_logs.css";

function average(values) {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function makeInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function formatShortAddress(address = "") {
    const normalized = String(address || "");
    if (!normalized || normalized === "-") return "-";
    if (normalized.length < 12) return normalized;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function buildActorDirectory(students, staffs) {
    const directory = {};

    staffs.forEach((address, index) => {
        const normalized = normalizeAddress(address);
        const internalId = index === 0 ? makeInternalId("ADMIN", 0) : makeInternalId("TEACHER", index - 1);
        const roleLabel = index === 0 ? "管理者" : "教員";
        directory[normalizeAddress(address)] = {
            role: index === 0 ? "admin" : "teacher",
            roleLabel,
            internalId,
            address,
            normalizedAddress: normalized,
            actorHint: formatShortAddress(address),
            directoryLabel: `${internalId} / ${roleLabel} / ${formatShortAddress(address)}`,
        };
    });

    students.forEach((address, index) => {
        const key = normalizeAddress(address);
        if (!directory[key]) {
            const internalId = makeInternalId("STUDENT", index);
            directory[key] = {
                role: "student",
                roleLabel: "学生",
                internalId,
                address,
                normalizedAddress: key,
                actorHint: formatShortAddress(address),
                directoryLabel: `${internalId} / 学生 / ${formatShortAddress(address)}`,
            };
        }
    });

    return directory;
}

function buildQuizDirectory(quizzes = []) {
    return (Array.isArray(quizzes) ? quizzes : []).reduce((directory, quiz) => {
        const quizId = String(Number(quiz?.[0] || 0));
        const sourceAddress = normalizeAddress(quiz?.sourceAddress || quiz?.[12] || "");
        const specificKey = `${sourceAddress}:${quizId}`;
        const fallbackKey = `:${quizId}`;
        const title = String(quiz?.[2] || `問題 ${quizId}`);
        directory[specificKey] = {
            id: quizId,
            title,
            sourceAddress,
            rewardTft: Number(quiz?.[7] || 0) / 10 ** 18,
        };
        if (!directory[fallbackKey]) {
            directory[fallbackKey] = directory[specificKey];
        }
        return directory;
    }, {});
}

function resolveActorMeta(log, directory) {
    const candidate = normalizeAddress(log.actor && !String(log.actor).startsWith("guest:") ? log.actor : (log.address || ""));
    if (candidate && directory[candidate]) {
        return directory[candidate];
    }

    if (candidate) {
        return {
            role: "temporary",
            roleLabel: "一時ユーザー",
            internalId: `TEMP-${candidate.slice(-4).toUpperCase()}`,
            address: log.actor || log.address || "",
            normalizedAddress: candidate,
            actorHint: `未登録ウォレット ${formatShortAddress(log.actor || log.address || "")}`,
            directoryLabel: `TEMP-${candidate.slice(-4).toUpperCase()} / 一時ユーザー / ${formatShortAddress(log.actor || log.address || "")}`,
        };
    }

    const guestSource = String(log.actor || log.sessionId || "guest");
    const suffix = guestSource.replace("guest:", "").slice(-6).toUpperCase();
    return {
        role: "guest",
        roleLabel: "未接続",
        internalId: `GUEST-${suffix || "LOCAL"}`,
        address: "-",
        normalizedAddress: "",
        actorHint: "ウォレット未接続の操作",
        directoryLabel: `GUEST-${suffix || "LOCAL"} / 未接続 / ウォレット未接続`,
    };
}

function resolveQuizMeta(log, quizDirectory) {
    const quizId = String(log.quizId || "").trim();
    if (!quizId) {
        return {
            id: "",
            title: "-",
            sourceAddress: "",
            rewardTft: 0,
        };
    }

    const sourceAddress = normalizeAddress(log.sourceAddress || "");
    const exact = quizDirectory[`${sourceAddress}:${quizId}`];
    const fallback = quizDirectory[`:${quizId}`];
    return exact || fallback || {
        id: quizId,
        title: `問題 ${quizId}`,
        sourceAddress,
        rewardTft: 0,
    };
}

function stringifyDetails(log) {
    const ignored = new Set([
        "id", "action", "actor", "createdAt", "sessionId", "route", "url", "referrer",
        "online", "userAgent", "viewportWidth", "viewportHeight", "language", "timezone",
        "actorMeta", "category",
    ]);

    return Object.entries(log)
        .filter(([key, value]) => !ignored.has(key) && value !== "" && value != null)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");
}

function deriveCategory(action) {
    if (!action) return "other";
    if (action.startsWith("login_") || action.startsWith("wallet_")) return "login";
    if (action.startsWith("quiz_")) return "quiz";
    if (action.startsWith("answer_")) return "answer";
    if (action.startsWith("live_")) return "board";
    if (action.startsWith("admin_")) return "admin";
    if (action.startsWith("route_") || action.startsWith("app_")) return "system";
    if (action.startsWith("performance_") || action.startsWith("export_")) return "ops";
    return "other";
}

function formatCategoryLabel(category) {
    switch (category) {
        case "login": return "ログイン";
        case "quiz": return "問題表示";
        case "answer": return "解答";
        case "board": return "掲示板";
        case "admin": return "管理操作";
        case "system": return "画面遷移";
        case "ops": return "運用";
        default: return "その他";
    }
}

const HIDDEN_ANALYTICS_ACTIONS = new Set([
    ACTION_TYPES.ROUTE_FALLBACK_SHOWN,
    ACTION_TYPES.ANSWER_PATTERN_VALIDATION,
    ACTION_TYPES.ANSWER_DRAFT_RESTORED,
    ACTION_TYPES.ANSWER_DRAFT_SAVED,
    ACTION_TYPES.ANSWER_DRAFT_CLEARED,
    ACTION_TYPES.LIVE_AUTH_CHECK_STARTED,
    ACTION_TYPES.LIVE_AUTH_CHECK,
    ACTION_TYPES.LIVE_DUMMY_MESSAGE_EMITTED,
    ACTION_TYPES.LIVE_DUMMY_TOGGLE_CHANGED,
    ACTION_TYPES.LIVE_CAMERA_TOGGLE_CLICKED,
    ACTION_TYPES.LIVE_CAMERA_STARTED,
    ACTION_TYPES.LIVE_CAMERA_STOPPED,
    ACTION_TYPES.LIVE_CAMERA_FAILED,
    ACTION_TYPES.LIVE_PINNED_SUPERCHAT_CHANGED,
    ACTION_TYPES.LIVE_CHAT_INPUT_CHANGED,
    ACTION_TYPES.LIVE_CHAT_DRAFT_SAVED,
    ACTION_TYPES.LIVE_CHAT_DRAFT_CLEARED,
    ACTION_TYPES.PERFORMANCE_SAMPLE,
]);

function groupActorActivity(logs) {
    const map = new Map();

    logs.forEach((log) => {
        const key = log.actorMeta.internalId;
        const current = map.get(key) || {
            internalId: log.actorMeta.internalId,
            roleLabel: log.actorMeta.roleLabel,
            address: log.actorMeta.address,
            actorHint: log.actorMeta.actorHint,
            count: 0,
            lastSeenAt: log.createdAt,
            categories: new Set(),
        };

        current.count += 1;
        current.lastSeenAt = log.createdAt > current.lastSeenAt ? log.createdAt : current.lastSeenAt;
        current.categories.add(log.category);
        map.set(key, current);
    });

    return [...map.values()]
        .map((item) => ({
            ...item,
            categories: [...item.categories].map(formatCategoryLabel).join(" / "),
        }))
        .sort((a, b) => b.count - a.count);
}

function buildActorLogSections(logs) {
    const map = new Map();

    logs.forEach((log) => {
        const key = log.actorMeta.internalId;
        const current = map.get(key) || {
            actorMeta: log.actorMeta,
            logs: [],
            quizTitles: new Set(),
            categories: new Set(),
        };

        current.logs.push(log);
        current.categories.add(formatCategoryLabel(log.category));
        if (log.quizMeta?.title && log.quizMeta.title !== "-") {
            current.quizTitles.add(log.quizMeta.title);
        }
        map.set(key, current);
    });

    return [...map.values()]
        .map((item) => {
            const answerLogs = item.logs.filter((log) => log.category === "answer");
            const solveDurations = answerLogs
                .map((log) => Number(log.solvingDurationSeconds || 0))
                .filter((value) => Number.isFinite(value) && value > 0);
            const averageSolveSeconds = solveDurations.length
                ? Math.round(solveDurations.reduce((sum, value) => sum + value, 0) / solveDurations.length)
                : 0;

            return {
                actorMeta: item.actorMeta,
                logs: item.logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
                quizTitles: [...item.quizTitles],
                categories: [...item.categories],
                totalCount: item.logs.length,
                averageSolveSeconds,
                latestAt: item.logs.reduce((latest, log) => (log.createdAt > latest ? log.createdAt : latest), ""),
            };
        })
        .sort((a, b) => b.totalCount - a.totalCount);
}

async function buildRecoveredAnswerLogs(cont, students, quizzes, existingLogs = []) {
    const normalizedStudents = Array.isArray(students) ? students : [];
    const normalizedQuizzes = (Array.isArray(quizzes) ? quizzes : []).filter((quiz) => Number(quiz?.[8] || 0) > 0);
    if (!normalizedStudents.length || !normalizedQuizzes.length) {
        return [];
    }

    const existingAnswerKeys = new Set(
        (Array.isArray(existingLogs) ? existingLogs : [])
            .filter((log) => log?.action === ACTION_TYPES.ANSWER_SUBMITTED)
            .map((log) => `${normalizeAddress(log.address || log.actor || "")}:${String(log.sourceAddress || "").toLowerCase()}:${String(log.quizId || "")}`)
    );

    const recovered = [];

    for (const quiz of normalizedQuizzes) {
        const quizId = Number(quiz?.[0] || 0);
        const quizTitle = String(quiz?.[2] || `問題 ${quizId}`);
        const sourceAddress = String(quiz?.sourceAddress || quiz?.[12] || "").toLowerCase();

        const detailEntries = await Promise.all(
            normalizedStudents.map(async (student) => {
                try {
                    const detail = await cont.get_student_answer_detail(student, quizId, sourceAddress);
                    return { student, detail };
                } catch (error) {
                    return { student, detail: null };
                }
            })
        );

        detailEntries.forEach(({ student, detail }) => {
            const submitted = Boolean(detail?.submitted);
            const answerTime = Number(detail?.answerTime || 0);
            if (!submitted || answerTime <= 0) return;

            const dedupeKey = `${normalizeAddress(student)}:${sourceAddress}:${String(quizId)}`;
            if (existingAnswerKeys.has(dedupeKey)) return;

            recovered.push({
                id: `recovered_answer_${sourceAddress}_${quizId}_${normalizeAddress(student)}`,
                action: ACTION_TYPES.ANSWER_SUBMITTED,
                createdAt: new Date(answerTime * 1000).toISOString(),
                actor: student,
                address: student,
                page: "answer_quiz",
                quizId,
                quizTitle,
                sourceAddress,
                answer: String(detail?.answerText || ""),
                answerLength: String(detail?.answerText || "").length,
                attemptCount: Number(detail?.attemptCount || 0),
                reward: Number(detail?.reward || 0),
                result: Boolean(detail?.result),
                recovered: true,
                recoveredFrom: "onchain_answer_detail",
            });
        });
    }

    return recovered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function Analytics_dashboard({ cont }) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [actionFilter, setActionFilter] = useState("all");
    const [pageFilter, setPageFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [actorFilter, setActorFilter] = useState("all");
    const [studentFilter, setStudentFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedLogId, setSelectedLogId] = useState("");
    const [students, setStudents] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const [quizzes, setQuizzes] = useState([]);
    const [logs, setLogs] = useState(() => getMergedActivityLogs());
    const [recoveredLogs, setRecoveredLogs] = useState([]);

    useEffect(() => {
        let mounted = true;

        const loadActors = async () => {
            try {
                const [studentList, staffList, quizList] = await Promise.all([
                    cont?.get_student_list?.(),
                    cont?.get_teachers?.(),
                    cont?.get_all_quiz_simple_list?.(),
                ]);
                if (!mounted) return;
                setStudents(Array.isArray(studentList) ? studentList : []);
                setStaffs(Array.isArray(staffList) ? staffList : []);
                setQuizzes(Array.isArray(quizList) ? quizList : []);
            } catch (error) {
                console.error("Failed to load actor directory", error);
                if (!mounted) return;
                setStudents([]);
                setStaffs([]);
                setQuizzes([]);
            }
        };

        loadActors();
        return () => {
            mounted = false;
        };
    }, [cont]);

    useEffect(() => {
        let mounted = true;

        const refreshLogs = async () => {
            const merged = await syncSharedActivityLogs();
            if (!mounted) return;
            setLogs(Array.isArray(merged) ? merged : getMergedActivityLogs());
        };

        const handleSharedUpdate = () => {
            setLogs(getMergedActivityLogs());
        };

        refreshLogs();
        window.addEventListener("activity-logs-shared-updated", handleSharedUpdate);
        window.addEventListener("storage", handleSharedUpdate);

        return () => {
            mounted = false;
            window.removeEventListener("activity-logs-shared-updated", handleSharedUpdate);
            window.removeEventListener("storage", handleSharedUpdate);
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        const recoverHistoricalLogs = async () => {
            try {
                const restored = await buildRecoveredAnswerLogs(cont, students, quizzes, logs);
                if (!mounted) return;
                setRecoveredLogs(restored);
            } catch (error) {
                console.error("Failed to recover historical student logs", error);
                if (!mounted) return;
                setRecoveredLogs([]);
            }
        };

        recoverHistoricalLogs();
        return () => {
            mounted = false;
        };
    }, [cont, students, quizzes, logs]);

    const actorDirectory = useMemo(() => buildActorDirectory(students, staffs), [students, staffs]);
    const quizDirectory = useMemo(() => buildQuizDirectory(quizzes), [quizzes]);

    const analyticsSourceLogs = useMemo(() => {
        const merged = new Map();
        [...(Array.isArray(logs) ? logs : []), ...(Array.isArray(recoveredLogs) ? recoveredLogs : [])].forEach((entry) => {
            if (!entry?.id || merged.has(entry.id)) return;
            merged.set(entry.id, entry);
        });
        return [...merged.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }, [logs, recoveredLogs]);

    const enrichedLogs = useMemo(() => analyticsSourceLogs
        .map((log) => ({
            ...log,
            actorMeta: resolveActorMeta(log, actorDirectory),
            quizMeta: resolveQuizMeta(log, quizDirectory),
            category: deriveCategory(log.action),
        }))
        .filter((log) => (
            log.actorMeta
            && !HIDDEN_ANALYTICS_ACTIONS.has(log.action)
        )), [analyticsSourceLogs, actorDirectory, quizDirectory]);

    const summary = useMemo(() => {
        const loginSuccess = enrichedLogs.filter((log) => log.action === ACTION_TYPES.LOGIN_SUCCESS).length;
        const answerSubmitted = enrichedLogs.filter((log) => log.action === ACTION_TYPES.ANSWER_SUBMITTED).length;
        const liveMessages = enrichedLogs.filter((log) => (
            log.action === ACTION_TYPES.LIVE_MESSAGE_SENT
            || log.action === ACTION_TYPES.LIVE_SUPERCHAT_SENT
            || log.action === ACTION_TYPES.LIVE_QUESTION_LIKED
            || log.action === ACTION_TYPES.LIVE_ANNOUNCEMENT_PUBLISHED
        )).length;
        const quizLoads = enrichedLogs
            .filter((log) => log.action === ACTION_TYPES.QUIZ_LOAD_SUCCESS && typeof log.durationMs === "number")
            .map((log) => log.durationMs);
        const submissions = enrichedLogs
            .filter((log) => log.action === ACTION_TYPES.ANSWER_SUBMITTED && typeof log.submitDurationMs === "number")
            .map((log) => log.submitDurationMs);

        return {
            totalLogs: enrichedLogs.length,
            loginSuccess,
            answerSubmitted,
            liveMessages,
            avgQuizLoadMs: average(quizLoads),
            avgSubmitMs: average(submissions),
        };
    }, [enrichedLogs]);

    const actionSummary = useMemo(() => {
        const counts = new Map();
        enrichedLogs.forEach((log) => {
            counts.set(log.action, (counts.get(log.action) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => ({
                action,
                label: formatActionLabel(action),
                count,
            }));
    }, [enrichedLogs]);

    const categorySummary = useMemo(() => {
        const counts = new Map();
        enrichedLogs.forEach((log) => {
            counts.set(log.category, (counts.get(log.category) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({
                category,
                label: formatCategoryLabel(category),
                count,
            }));
    }, [enrichedLogs]);

    const pageOptions = useMemo(
        () => [...new Set(enrichedLogs.map((log) => log.page).filter(Boolean))].sort(),
        [enrichedLogs]
    );

    const dateOptions = useMemo(
        () => [...new Set(enrichedLogs.map((log) => String(log.createdAt || "").slice(0, 10)).filter(Boolean))].sort().reverse(),
        [enrichedLogs]
    );

    const actorOptions = useMemo(() => {
        const map = new Map();
        enrichedLogs.forEach((log) => {
            if (!log.actorMeta?.internalId || map.has(log.actorMeta.internalId)) return;
            map.set(log.actorMeta.internalId, {
                value: log.actorMeta.internalId,
                label: log.actorMeta.directoryLabel || `${log.actorMeta.internalId} / ${log.actorMeta.roleLabel}`,
                role: log.actorMeta.role,
            });
        });
        return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
    }, [enrichedLogs]);

    const studentActorOptions = useMemo(
        () => actorOptions.filter((item) => item.role === "student"),
        [actorOptions]
    );

    const filteredLogs = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return enrichedLogs.filter((log) => {
            const searchable = [
                stringifyDetails(log),
                log.action,
                formatActionLabel(log.action),
                log.page || "",
                log.quizId || "",
                log.actorMeta.internalId,
                log.actorMeta.roleLabel,
                log.actorMeta.address,
                formatCategoryLabel(log.category),
            ].join(" ").toLowerCase();

            if (categoryFilter !== "all" && log.category !== categoryFilter) return false;
            if (actionFilter !== "all" && log.action !== actionFilter) return false;
            if (pageFilter !== "all" && log.page !== pageFilter) return false;
            if (roleFilter !== "all" && log.actorMeta.role !== roleFilter) return false;
            if (actorFilter !== "all" && log.actorMeta.internalId !== actorFilter) return false;
            if (studentFilter !== "all" && log.actorMeta.internalId !== studentFilter) return false;
            if (dateFilter !== "all" && String(log.createdAt || "").slice(0, 10) !== dateFilter) return false;
            if (!normalizedSearch) return true;
            return searchable.includes(normalizedSearch);
        });
    }, [enrichedLogs, categoryFilter, actionFilter, pageFilter, roleFilter, actorFilter, studentFilter, dateFilter, searchTerm]);

    const actorSummary = useMemo(() => groupActorActivity(filteredLogs), [filteredLogs]);
    const actorSections = useMemo(() => buildActorLogSections(filteredLogs), [filteredLogs]);
    const studentActorSections = useMemo(
        () => actorSections.filter((section) => section.actorMeta.role === "student"),
        [actorSections]
    );
    const staffActorSections = useMemo(
        () => actorSections.filter((section) => ["admin", "teacher"].includes(section.actorMeta.role)),
        [actorSections]
    );
    const extraActorSections = useMemo(
        () => actorSections.filter((section) => !["admin", "teacher", "student"].includes(section.actorMeta.role)),
        [actorSections]
    );

    useEffect(() => {
        if (!filteredLogs.length) {
            setSelectedLogId("");
            return;
        }

        const selectedExists = filteredLogs.some((log) => log.id === selectedLogId);
        if (!selectedExists) {
            setSelectedLogId(filteredLogs[0].id);
        }
    }, [filteredLogs, selectedLogId]);

    const selectedLog = useMemo(
        () => filteredLogs.find((log) => log.id === selectedLogId) || null,
        [filteredLogs, selectedLogId]
    );

    const handleClear = () => {
        clearActivityLogs();
        setRefreshKey((current) => current + 1);
        setActionFilter("all");
        setPageFilter("all");
        setRoleFilter("all");
        setActorFilter("all");
        setStudentFilter("all");
        setCategoryFilter("all");
        setDateFilter("all");
        setSearchTerm("");
        setSelectedLogId("");
        setLogs(getMergedActivityLogs());
    };

    return (
        <div key={refreshKey}>
            <h3 className="section-title">分析ログ</h3>
            <p className="section-desc">
                分析ログをカテゴリ別に分け、学生を含む登録ユーザーの識別番号・ページ・行動・詳細から横断検索できます。
            </p>

            <div className="analytics-grid">
                <div className="analytics-card"><div className="analytics-label">総ログ件数</div><div className="analytics-value">{summary.totalLogs}</div></div>
                <div className="analytics-card"><div className="analytics-label">ログイン成功</div><div className="analytics-value">{summary.loginSuccess}</div></div>
                <div className="analytics-card"><div className="analytics-label">回答送信</div><div className="analytics-value">{summary.answerSubmitted}</div></div>
                <div className="analytics-card"><div className="analytics-label">ライブ送信</div><div className="analytics-value">{summary.liveMessages}</div></div>
                <div className="analytics-card"><div className="analytics-label">平均読込時間</div><div className="analytics-value">{summary.avgQuizLoadMs}ms</div></div>
                <div className="analytics-card"><div className="analytics-label">平均送信待ち</div><div className="analytics-value">{summary.avgSubmitMs}ms</div></div>
                <div className="analytics-card"><div className="analytics-label">学生ログ保持</div><div className="analytics-value">{studentActorSections.length}</div></div>
                <div className="analytics-card"><div className="analytics-label">復元ログ件数</div><div className="analytics-value">{recoveredLogs.length}</div></div>
            </div>

            <div className="analytics-actions">
                <button className="btn-action" onClick={exportLogsAsCsv}>CSV を出力</button>
                <button className="btn-action" onClick={exportLogsAsJson}>JSON を出力</button>
                <button className="btn-action" onClick={handleClear}>ログを初期化</button>
            </div>

            <div className="analytics-filters analytics-filters--wide">
                <input
                    className="form-control"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="識別番号、権限、カテゴリ、行動、詳細、クイズIDで検索"
                />
                <select className="form-control" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="all">すべてのカテゴリ</option>
                    {categorySummary.map((item) => (
                        <option key={item.category} value={item.category}>{item.label}</option>
                    ))}
                </select>
                <select className="form-control" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                    <option value="all">すべての行動</option>
                    {actionSummary.map((item) => (
                        <option key={item.action} value={item.action}>{item.label}</option>
                    ))}
                </select>
                <select className="form-control" value={pageFilter} onChange={(event) => setPageFilter(event.target.value)}>
                    <option value="all">すべてのページ</option>
                    {pageOptions.map((page) => (
                        <option key={page} value={page}>{page}</option>
                    ))}
                </select>
                <select className="form-control" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                    <option value="all">すべての日付</option>
                    {dateOptions.map((date) => (
                        <option key={date} value={date}>{date}</option>
                    ))}
                </select>
                <select className="form-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                    <option value="all">すべての権限</option>
                    <option value="admin">管理者</option>
                    <option value="teacher">教員</option>
                    <option value="student">学生</option>
                    <option value="temporary">一時ユーザー</option>
                    <option value="guest">未接続</option>
                </select>
                <select className="form-control" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
                    <option value="all">すべての学生識別番号</option>
                    {studentActorOptions.map((actor) => (
                        <option key={actor.value} value={actor.value}>{actor.label}</option>
                    ))}
                </select>
                <select className="form-control" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                    <option value="all">すべての識別番号</option>
                    {actorOptions.map((actor) => (
                        <option key={actor.value} value={actor.value}>{actor.label}</option>
                    ))}
                </select>
            </div>

            <div className="analytics-category-row">
                {categorySummary.map((item) => (
                    <button
                        key={item.category}
                        className={`analytics-category-chip ${categoryFilter === item.category ? "active" : ""}`}
                        onClick={() => setCategoryFilter((current) => (current === item.category ? "all" : item.category))}
                    >
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                    </button>
                ))}
            </div>

            {actorSummary.length > 0 && (
                <div className="analytics-actor-grid">
                    {actorSummary.slice(0, 8).map((item) => (
                        <button
                            key={item.internalId}
                            className={`analytics-actor-card ${actorFilter === item.internalId ? "active" : ""}`}
                            onClick={() => setActorFilter((current) => (current === item.internalId ? "all" : item.internalId))}
                        >
                            <div className="analytics-actor-title">{item.internalId}</div>
                            <div className="analytics-actor-meta">{item.roleLabel} / {item.count} 件</div>
                            <div className="analytics-actor-meta">{item.actorHint || formatShortAddress(item.address)}</div>
                            <div className="analytics-actor-meta">{item.categories}</div>
                            <div className="analytics-actor-meta">{formatDateTime(item.lastSeenAt)}</div>
                        </button>
                    ))}
                </div>
            )}

            {filteredLogs.length === 0 ? (
                <div className="analytics-empty">対象に一致するログがありません。</div>
            ) : (
                <div className="analytics-workspace">
                    <div className="analytics-log-list glass-card">
                        <div className="analytics-panel-header">
                            <strong>ログ一覧</strong>
                            <span>表示中 {filteredLogs.length} 件 / 全体 {analyticsSourceLogs.length} 件</span>
                        </div>
                        <div className="analytics-log-items">
                            {filteredLogs.map((log) => (
                                <button
                                    key={log.id}
                                    className={`analytics-log-item ${selectedLogId === log.id ? "active" : ""}`}
                                    onClick={() => setSelectedLogId(log.id)}
                                >
                                    <div className="analytics-log-top">
                                        <span className="analytics-log-category">{formatCategoryLabel(log.category)}</span>
                                        <span className="analytics-log-time">{formatDateTime(log.createdAt)}</span>
                                    </div>
                                    <div className="analytics-log-title">{formatActionLabel(log.action)}</div>
                                    <div className="analytics-log-meta">
                                        <span>{log.actorMeta.internalId}</span>
                                        <span>{log.page || "-"}</span>
                                        <span>{log.quizMeta?.title || (log.quizId || "-")}</span>
                                    </div>
                                    <div className="analytics-log-preview">{stringifyDetails(log) || "詳細なし"}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="analytics-log-detail glass-card">
                        <div className="analytics-panel-header">
                            <strong>個別詳細</strong>
                            <span>{selectedLog ? formatActionLabel(selectedLog.action) : "-"}</span>
                        </div>

                        {selectedLog ? (
                            <div className="analytics-detail-grid">
                                <div className="analytics-detail-card"><div className="analytics-label">時刻</div><div className="analytics-detail-value">{formatDateTime(selectedLog.createdAt)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">カテゴリ</div><div className="analytics-detail-value">{formatCategoryLabel(selectedLog.category)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">行動</div><div className="analytics-detail-value">{formatActionLabel(selectedLog.action)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">識別番号</div><div className="analytics-detail-value">{selectedLog.actorMeta.internalId}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">権限</div><div className="analytics-detail-value">{selectedLog.actorMeta.roleLabel}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">識別補足</div><div className="analytics-detail-value">{selectedLog.actorMeta.actorHint || "-"}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">ウォレット</div><div className="analytics-detail-value analytics-text">{selectedLog.actorMeta.address}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">ページ</div><div className="analytics-detail-value">{selectedLog.page || "-"}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">対象問題</div><div className="analytics-detail-value">{selectedLog.quizMeta?.title || selectedLog.quizId || "-"}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">経過時間</div><div className="analytics-detail-value">{selectedLog.durationMs || selectedLog.submitDurationMs || "-"}</div></div>
                            </div>
                        ) : (
                            <div className="analytics-empty">ログを選択してください。</div>
                        )}

                        {selectedLog && (
                            <div className="analytics-detail-block">
                                <div className="analytics-label">詳細データ</div>
                                <div className="analytics-detail-pre">{stringifyDetails(selectedLog) || "詳細なし"}</div>
                            </div>
                        )}

                        {actionSummary.length > 0 && (
                            <div className="analytics-detail-block">
                                <div className="analytics-label">行動別件数</div>
                                <div className="analytics-mini-table">
                                    {actionSummary.slice(0, 10).map((item) => (
                                        <div key={item.action} className="analytics-mini-row">
                                            <span>{item.label}</span>
                                            <strong>{item.count}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {studentActorSections.length > 0 && (
                <div className="analytics-detail-block">
                    <div className="analytics-label">学生別ログ</div>
                    <div className="analytics-accordion-list">
                        {studentActorSections.map((section) => (
                            <details key={section.actorMeta.internalId} className="analytics-accordion-item">
                                <summary className="analytics-accordion-summary">
                                    <div>
                                        <strong>{section.actorMeta.internalId}</strong>
                                        <div className="analytics-actor-meta">
                                            {section.actorMeta.roleLabel} / {section.actorMeta.actorHint || formatShortAddress(section.actorMeta.address)}
                                        </div>
                                        <div className="analytics-actor-meta">{section.actorMeta.address || "-"}</div>
                                    </div>
                                    <div className="analytics-accordion-summary-meta">
                                        <span>{section.totalCount} 件</span>
                                        <span>{section.averageSolveSeconds > 0 ? `平均 ${section.averageSolveSeconds}秒` : "平均ログなし"}</span>
                                        <span>{formatDateTime(section.latestAt)}</span>
                                    </div>
                                </summary>
                                <div className="analytics-accordion-body">
                                    <div className="analytics-actor-meta" style={{ marginBottom: "10px" }}>
                                        カテゴリ: {section.categories.join(" / ") || "-"}
                                    </div>
                                    <div className="analytics-actor-meta" style={{ marginBottom: "10px" }}>
                                        関連問題: {section.quizTitles.length ? section.quizTitles.join(" / ") : "なし"}
                                    </div>
                                    <div className="analytics-mini-table">
                                        {section.logs.slice(0, 40).map((log) => (
                                            <div key={log.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                                <span style={{ maxWidth: "75%" }}>
                                                    {formatDateTime(log.createdAt)} / {formatActionLabel(log.action)}
                                                    <br />
                                                    {log.quizMeta?.title && log.quizMeta.title !== "-" ? `${log.quizMeta.title} / ` : ""}
                                                    {stringifyDetails(log) || "詳細なし"}
                                                </span>
                                                <strong>{formatCategoryLabel(log.category)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            )}

            {staffActorSections.length > 0 && (
                <div className="analytics-detail-block">
                    <div className="analytics-label">管理者・教員別ログ</div>
                    <div className="analytics-accordion-list">
                        {staffActorSections.map((section) => (
                            <details key={section.actorMeta.internalId} className="analytics-accordion-item">
                                <summary className="analytics-accordion-summary">
                                    <div>
                                        <strong>{section.actorMeta.internalId}</strong>
                                        <div className="analytics-actor-meta">
                                            {section.actorMeta.roleLabel} / {section.actorMeta.actorHint || formatShortAddress(section.actorMeta.address)}
                                        </div>
                                    </div>
                                    <div className="analytics-accordion-summary-meta">
                                        <span>{section.totalCount} 件</span>
                                        <span>{section.averageSolveSeconds > 0 ? `平均 ${section.averageSolveSeconds}秒` : "平均ログなし"}</span>
                                        <span>{formatDateTime(section.latestAt)}</span>
                                    </div>
                                </summary>
                                <div className="analytics-accordion-body">
                                    <div className="analytics-actor-meta" style={{ marginBottom: "10px" }}>
                                        カテゴリ: {section.categories.join(" / ") || "-"}
                                    </div>
                                    <div className="analytics-actor-meta" style={{ marginBottom: "10px" }}>
                                        関連問題: {section.quizTitles.length ? section.quizTitles.join(" / ") : "なし"}
                                    </div>
                                    <div className="analytics-mini-table">
                                        {section.logs.slice(0, 40).map((log) => (
                                            <div key={log.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                                <span style={{ maxWidth: "75%" }}>
                                                    {formatDateTime(log.createdAt)} / {formatActionLabel(log.action)}
                                                    <br />
                                                    {log.quizMeta?.title && log.quizMeta.title !== "-" ? `${log.quizMeta.title} / ` : ""}
                                                    {stringifyDetails(log) || "詳細なし"}
                                                </span>
                                                <strong>{formatCategoryLabel(log.category)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            )}

            {extraActorSections.length > 0 && (
                <div className="analytics-detail-block">
                    <div className="analytics-label">未登録・一時ユーザーのログ</div>
                    <div className="analytics-accordion-list">
                        {extraActorSections.map((section) => (
                            <details key={section.actorMeta.internalId} className="analytics-accordion-item">
                                <summary className="analytics-accordion-summary">
                                    <div>
                                        <strong>{section.actorMeta.internalId}</strong>
                                        <div className="analytics-actor-meta">{section.actorMeta.roleLabel}</div>
                                    </div>
                                    <div className="analytics-accordion-summary-meta">
                                        <span>{section.totalCount} 件</span>
                                        <span>{formatDateTime(section.latestAt)}</span>
                                    </div>
                                </summary>
                                <div className="analytics-accordion-body">
                                    <div className="analytics-mini-table">
                                        {section.logs.slice(0, 20).map((log) => (
                                            <div key={log.id} className="analytics-mini-row" style={{ alignItems: "start" }}>
                                                <span style={{ maxWidth: "75%" }}>
                                                    {formatDateTime(log.createdAt)} / {formatActionLabel(log.action)}
                                                    <br />
                                                    {stringifyDetails(log) || "詳細なし"}
                                                </span>
                                                <strong>{formatCategoryLabel(log.category)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Analytics_dashboard;
