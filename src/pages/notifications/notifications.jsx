import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { publicClient, quiz_address, quiz_abi } from "../../contract/contractClients";
import {
    getNotificationPermission,
    isNotificationSupported,
    readDeadlineNotificationSettings,
    requestDeadlineNotificationPermission,
    saveDeadlineNotificationSettings,
} from "../../utils/quizDeadlineNotifications";
import "./notifications.css";

const REMINDER_TIME_OPTIONS = [
    { key: "oneDay", label: "締切 24 時間前" },
    { key: "sixHours", label: "締切 6 時間前" },
    { key: "twoHours", label: "締切 2 時間前" },
    { key: "oneHour", label: "締切 1 時間前" },
    { key: "thirtyMinutes", label: "締切 30 分前" },
    { key: "tenMinutes", label: "締切 10 分前" },
];

const REMINDER_CONTENT_OPTIONS = [
    { key: "includeQuizTitle", label: "問題タイトルを入れる" },
    { key: "includeDeadlineTime", label: "締切日時を入れる" },
    { key: "includeRemainingTime", label: "何時間前・何分前かを入れる" },
    { key: "includeReward", label: "報酬を入れる" },
    { key: "includeOpenPrompt", label: "問題を開く案内を入れる" },
];

const EVENT_CONFIG = {
    Create_quiz: {
        icon: "📝",
        iconClass: "quiz-create",
        label: "新しいクイズが作成されました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? args.id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? args.id ?? null,
        linkLabel: "新規クイズを見る",
    },
    Edit_quiz: {
        icon: "✏️",
        iconClass: "quiz-edit",
        label: "クイズが編集されました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? args.id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? args.id ?? null,
        linkLabel: "クイズを見る",
    },
    Save_answer: {
        icon: "✅",
        iconClass: "quiz-answer",
        label: "回答が送信されました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? null,
        linkLabel: "クイズを見る",
    },
    Payment_of_reward: {
        icon: "💰",
        iconClass: "quiz-payment",
        label: "報酬が支払われました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? null,
        linkLabel: "クイズを見る",
    },
    Adding_reward: {
        icon: "🎁",
        iconClass: "quiz-reward",
        label: "報酬が追加されました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? null,
        linkLabel: "クイズを見る",
    },
    Investment_to_quiz: {
        icon: "📈",
        iconClass: "quiz-payment",
        label: "クイズに投資されました",
        getDetail: (args) => `クイズID: ${args._quiz_id ?? args.id ?? "---"}`,
        getQuizId: (args) => args._quiz_id ?? args.id ?? null,
        linkLabel: "クイズを見る",
    },
};

const eventAbis = quiz_abi.filter((item) => item.type === "event");

function formatTimestamp(blockTimestamp) {
    if (!blockTimestamp) return "";
    const date = new Date(Number(blockTimestamp) * 1000);
    return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function normalizeQuizId(value) {
    if (value == null) return null;
    return String(value);
}

function Notifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reminderSettings, setReminderSettings] = useState(() => readDeadlineNotificationSettings());
    const [permission, setPermission] = useState(() => getNotificationPermission());
    const notificationSupported = isNotificationSupported();

    const updateReminderSettings = (partial) => {
        const nextSettings = saveDeadlineNotificationSettings({
            ...reminderSettings,
            ...partial,
        });
        setReminderSettings(nextSettings);
        setPermission(getNotificationPermission());
    };

    const enableBrowserNotifications = async () => {
        const nextPermission = await requestDeadlineNotificationPermission();
        setPermission(nextPermission);
        if (nextPermission === "granted" && !reminderSettings.enabled) {
            const nextSettings = saveDeadlineNotificationSettings({
                ...reminderSettings,
                enabled: true,
            });
            setReminderSettings(nextSettings);
        }
    };

    useEffect(() => {
        async function fetchLogs() {
            try {
                const latestBlock = await publicClient.getBlockNumber();
                const fromBlock = latestBlock > 5000n ? latestBlock - 5000n : 0n;
                const allLogs = [];

                for (const eventAbi of eventAbis) {
                    const eventName = eventAbi.name;
                    if (!EVENT_CONFIG[eventName]) continue;

                    try {
                        const logs = await publicClient.getLogs({
                            address: quiz_address,
                            event: eventAbi,
                            fromBlock,
                            toBlock: "latest",
                        });

                        for (const log of logs) {
                            let timestamp = null;
                            try {
                                const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
                                timestamp = block.timestamp;
                            } catch (e) {
                            }

                            allLogs.push({
                                eventName,
                                args: log.args || {},
                                blockNumber: log.blockNumber,
                                transactionHash: log.transactionHash,
                                timestamp,
                            });
                        }
                    } catch (e) {
                        console.log(`Failed to fetch ${eventName} logs:`, e);
                    }
                }

                allLogs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
                setNotifications(allLogs.slice(0, 50));
            } catch (err) {
                console.error("Notification fetch error:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchLogs();
    }, []);

    if (loading) {
        return (
            <div className="notifications-page">
                <div className="page-header">
                    <h1 className="page-title">🔔 通知</h1>
                    <p className="page-subtitle">読み込み中...</p>
                </div>
                <div className="notification-skeleton">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="notification-skeleton-item">
                            <div className="skeleton-circle"></div>
                            <div className="skeleton-text-group">
                                <div className="skeleton-line" style={{ width: "70%" }}></div>
                                <div className="skeleton-line" style={{ width: "40%" }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="notifications-page">
            <div className="page-header">
                <h1 className="page-title">🔔 通知</h1>
                <p className="page-subtitle">スマートコントラクトの最新アクティビティ（{notifications.length}件）</p>
            </div>

            <div className="notification-settings-card">
                <div className="notification-settings-header">
                    <div>
                        <div className="notification-settings-title">締切リマインド</div>
                        <div className="notification-settings-subtitle">
                            この端末で、未回答クイズの締切前に通知します。時間帯と文面は下で調整できます。
                        </div>
                    </div>
                    <div className={`notification-permission-badge ${permission === "granted" ? "is-enabled" : "is-disabled"}`}>
                        {notificationSupported ? (
                            permission === "granted" ? "通知許可済み" : "通知未許可"
                        ) : "このブラウザでは未対応"}
                    </div>
                </div>

                <div className="notification-setting-row">
                    <label className="notification-switch">
                        <input
                            type="checkbox"
                            checked={Boolean(reminderSettings.enabled)}
                            onChange={(event) => updateReminderSettings({ enabled: event.target.checked })}
                            disabled={!notificationSupported}
                        />
                        <span>締切通知を使う</span>
                    </label>
                    {notificationSupported && permission !== "granted" ? (
                        <button className="notification-action-btn" onClick={enableBrowserNotifications}>
                            通知を許可する
                        </button>
                    ) : null}
                </div>

                <div className="notification-settings-section">
                    <div className="notification-settings-section-title">通知タイミング</div>
                    <div className="notification-setting-grid">
                        {REMINDER_TIME_OPTIONS.map((option) => (
                            <label className="notification-switch" key={option.key}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(reminderSettings[option.key])}
                                    onChange={(event) => updateReminderSettings({ [option.key]: event.target.checked })}
                                    disabled={!notificationSupported || !reminderSettings.enabled}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="notification-settings-section">
                    <div className="notification-settings-section-title">通知に入れる内容</div>
                    <div className="notification-setting-grid">
                        {REMINDER_CONTENT_OPTIONS.map((option) => (
                            <label className="notification-switch" key={option.key}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(reminderSettings[option.key])}
                                    onChange={(event) => updateReminderSettings({ [option.key]: event.target.checked })}
                                    disabled={!notificationSupported || !reminderSettings.enabled}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="notification-settings-note">
                    通知はこの端末ごとに保存されます。ブラウザや OS の制限により、完全に閉じた状態では届かない場合があります。
                </div>
            </div>

            {notifications.length === 0 ? (
                <div className="notification-empty">
                    <div className="notification-empty-icon">🔕</div>
                    <div className="notification-empty-text">最近のアクティビティはありません</div>
                </div>
            ) : (
                <div className="notification-list">
                    {notifications.map((notif, index) => {
                        const config = EVENT_CONFIG[notif.eventName];
                        if (!config) return null;
                        const quizId = normalizeQuizId(config.getQuizId?.(notif.args));

                        return (
                            <div key={index} className="notification-item" style={{ animationDelay: `${index * 0.05}s` }}>
                                <div className={`notification-icon ${config.iconClass}`}>
                                    {config.icon}
                                </div>
                                <div className="notification-body">
                                    <div className="notification-title">{config.label}</div>
                                    <div className="notification-detail">
                                        {config.getDetail(notif.args)}
                                        {notif.args._sender && (
                                            <> · <span className="mono">{`${String(notif.args._sender).slice(0, 8)}...`}</span></>
                                        )}
                                    </div>
                                    <div className="notification-time">
                                        {notif.timestamp ? formatTimestamp(notif.timestamp) : `Block #${notif.blockNumber?.toString()}`}
                                    </div>
                                    {quizId && (
                                        <Link className="notification-link" to={`/answer_quiz/${quizId}`}>
                                            {config.linkLabel}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default Notifications;
