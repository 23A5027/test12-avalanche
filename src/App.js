import { Component, Suspense, lazy, useEffect, useMemo } from "react";
import "./styles/design-tokens.css";
import "./styles/animations.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Nav_menu from "./pages/navbar/navbar";
import { Contracts_MetaMask } from "./contract/contracts";
import { ACTION_TYPES, appendActivityLog, logPageView } from "./utils/activityLog";
import {
    CHECK_INTERVAL_MS,
    INITIAL_CHECK_DELAY_MS,
    SETTINGS_UPDATED_EVENT,
    checkAndSendDeadlineNotifications,
    readDeadlineNotificationSettings,
} from "./utils/quizDeadlineNotifications";
import {
    AUTO_SUBMIT_CHECK_INTERVAL_MS,
    AUTO_SUBMIT_IDLE_RECHECK_MS,
    AUTO_SUBMIT_INITIAL_DELAY_MS,
    getNextBatchAutoSubmitDelayMs,
    processAutoSubmitBatchAnswers,
} from "./utils/batchAnswerAutoSubmit";
import "bootstrap/dist/css/bootstrap.min.css";

const routerBasename = (() => {
    try {
        const publicUrl = process.env.PUBLIC_URL || "";
        if (!publicUrl) return "/";
        return new URL(publicUrl, window.location.origin).pathname.replace(/\/$/, "") || "/";
    } catch (error) {
        return "/";
    }
})();

function normalizeLegacyHashUrl() {
    if (typeof window === "undefined") return;
    const { hash, origin } = window.location;
    if (!hash || !hash.startsWith("#/")) return;

    const nextPath = hash.slice(1);
    const base = routerBasename === "/" ? "" : routerBasename;
    window.history.replaceState(null, "", `${origin}${base}${nextPath}`);
}

normalizeLegacyHashUrl();

const Login = lazy(() => import("./contract/login"));
const User_page = lazy(() => import("./pages/user_page/user_page"));
const Create_quiz = lazy(() => import("./pages/create_quiz/create_quiz"));
const List_quiz = lazy(() => import("./pages/list_quiz/list_quiz_top"));
const Answer_quiz = lazy(() => import("./pages/answer_quiz/answer_quiz"));
const Batch_answers = lazy(() => import("./pages/batch_answers/batch_answers"));
const Admin_page = lazy(() => import("./pages/admin_page/admin"));
const Edit_list = lazy(() => import("./pages/edit_list/edit_list_top"));
const Edit_quiz = lazy(() => import("./pages/edit_quiz/edit_quiz"));
const Investment_page = lazy(() => import("./pages/investment_page/investment_page"));
const Dashboard = lazy(() => import("./pages/dashboard/dashboard"));
const Ranking = lazy(() => import("./pages/ranking/ranking"));
const Notifications = lazy(() => import("./pages/notifications/notifications"));
const Live_page = lazy(() => import("./pages/live/live"));

function RouteFallback() {
    useEffect(() => {
        appendActivityLog(ACTION_TYPES.ROUTE_FALLBACK_SHOWN, { page: "route_fallback" });
    }, []);

    return (
        <div className="main-content">
            <div className="glass-card animate-fadeIn" style={{ padding: "var(--space-8)", marginTop: "var(--space-6)" }}>
                <h2 className="heading-lg" style={{ marginBottom: "var(--space-2)" }}>ページを読み込み中</h2>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                    初回表示の通信量を減らすため、必要な画面だけ順次読み込んでいます。
                </p>
            </div>
        </div>
    );
}

function RouteLogger() {
    const location = useLocation();

    useEffect(() => {
        logPageView("route", {
            pathname: location.pathname,
            hash: location.hash,
            search: location.search,
        });
    }, [location]);

    return null;
}

function DeadlineReminderBootstrap({ cont }) {
    useEffect(() => {
        let intervalId = null;
        let initialTimerId = null;
        let isRunning = false;

        const runCheck = async () => {
            if (isRunning) return;
            isRunning = true;
            try {
                await checkAndSendDeadlineNotifications(cont);
            } catch (error) {
                console.error("Deadline notification check failed", error);
            } finally {
                isRunning = false;
            }
        };

        const resetSchedule = () => {
            if (initialTimerId) window.clearTimeout(initialTimerId);
            if (intervalId) window.clearInterval(intervalId);

            const settings = readDeadlineNotificationSettings();
            if (!settings.enabled) return;

            initialTimerId = window.setTimeout(runCheck, INITIAL_CHECK_DELAY_MS);
            intervalId = window.setInterval(runCheck, CHECK_INTERVAL_MS);
        };

        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                runCheck();
            }
        };

        resetSchedule();
        window.addEventListener(SETTINGS_UPDATED_EVENT, resetSchedule);
        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);

        return () => {
            if (initialTimerId) window.clearTimeout(initialTimerId);
            if (intervalId) window.clearInterval(intervalId);
            window.removeEventListener(SETTINGS_UPDATED_EVENT, resetSchedule);
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
        };
    }, [cont]);

    return null;
}

function BatchAnswerAutoSubmitBootstrap({ cont }) {
    useEffect(() => {
        let timerId = null;
        let isRunning = false;

        const clearSchedule = () => {
            if (timerId) window.clearTimeout(timerId);
            timerId = null;
        };

        const scheduleNext = (delayMs = AUTO_SUBMIT_IDLE_RECHECK_MS) => {
            clearSchedule();
            timerId = window.setTimeout(runCheck, Math.max(15 * 1000, delayMs));
        };

        const runCheck = async () => {
            if (isRunning) return;
            isRunning = true;
            try {
                await processAutoSubmitBatchAnswers(cont);
            } catch (error) {
                console.error("Batch answer auto submit failed", error);
            } finally {
                isRunning = false;
                scheduleNext(getNextBatchAutoSubmitDelayMs());
            }
        };

        scheduleNext(AUTO_SUBMIT_INITIAL_DELAY_MS);

        const handleVisible = () => {
            if (document.visibilityState === "visible") {
                runCheck();
            }
        };

        document.addEventListener("visibilitychange", handleVisible);
        window.addEventListener("focus", handleVisible);

        return () => {
            clearSchedule();
            document.removeEventListener("visibilitychange", handleVisible);
            window.removeEventListener("focus", handleVisible);
        };
    }, [cont]);

    return null;
}

class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMessage: "" };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: error?.message || "画面の描画中にエラーが発生しました。",
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Route rendering failed", error, errorInfo);
        appendActivityLog(ACTION_TYPES.ROUTE_RENDER_FAILED, {
            page: "route_error_boundary",
            error: error?.message || "unknown_error",
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="main-content">
                    <div className="glass-card animate-fadeIn" style={{ padding: "var(--space-8)", marginTop: "var(--space-6)" }}>
                        <h2 className="heading-lg" style={{ marginBottom: "var(--space-2)" }}>画面の表示に失敗しました</h2>
                        <p style={{ marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>
                            一時的な描画エラーを検知しました。再読み込みで復旧できるようにしています。
                        </p>
                        <p style={{ marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>
                            詳細: {this.state.errorMessage}
                        </p>
                        <button className="btn-primary-custom" onClick={() => window.location.reload()}>
                            再読み込み
                        </button>
                    </div>
                </main>
            );
        }

        return this.props.children;
    }
}

function AppRoutes({ cont }) {
    return (
        <>
            <RouteLogger />
            <Nav_menu cont={cont} home={process.env.PUBLIC_URL} />
            <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                    <main className="main-content">
                        <Routes>
                            <Route path="/login" element={<Login url="login" cont={cont} />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/ranking" element={<Ranking />} />
                            <Route path="/notifications" element={<Notifications />} />
                            <Route path="/user_page/:address" element={<User_page url="user_page" cont={cont} />} />
                            <Route path="/create_quiz" element={<Create_quiz url="create_quiz" cont={cont} />} />
                            <Route path="/list_quiz" element={<List_quiz url="list_quiz" cont={cont} />} />
                            <Route path="/answer_quiz/:id" element={<Answer_quiz url="answer_quiz" cont={cont} />} />
                            <Route path="/batch_answers" element={<Batch_answers url="batch_answers" cont={cont} />} />
                            <Route path="/admin" element={<Admin_page url="admin" cont={cont} />} />
                            <Route path="/edit_list" element={<Edit_list url="edit_list" cont={cont} />} />
                            <Route path="/edit_quiz/:id" element={<Edit_quiz url="edit_quiz" cont={cont} />} />
                            <Route path="/investment_page/:id" element={<Investment_page url="investment_page" cont={cont} />} />
                            <Route path="/live" element={<Live_page url="live" cont={cont} />} />
                            <Route path="/" element={<Navigate replace to="/dashboard" />} />
                        </Routes>
                    </main>
                </Suspense>
            </RouteErrorBoundary>
        </>
    );
}

function App() {
    const cont = useMemo(() => new Contracts_MetaMask(), []);

    useEffect(() => {
        appendActivityLog(ACTION_TYPES.APP_SESSION_STARTED, { page: "app" });
    }, []);

    return (
        <div className="App">
            <BrowserRouter
                basename={routerBasename}
                future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                }}
            >
                <DeadlineReminderBootstrap cont={cont} />
                <BatchAnswerAutoSubmitBootstrap cont={cont} />
                <AppRoutes cont={cont} />
            </BrowserRouter>
        </div>
    );
}

export default App;
