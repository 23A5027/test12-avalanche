import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaBolt, FaComment, FaCommentSlash, FaCoins, FaThumbtack } from "react-icons/fa";
import Chat_feed from "./components/chat_feed";
import Chat_input from "./components/chat_input";
import "./live.css";
import { ACTION_TYPES, appendActivityLog, logPageView } from "../../utils/activityLog";
import { useAccessControl } from "../../utils/accessControl";
import { Contracts_MetaMask } from "../../contract/contracts";
import { appendBoardLog, upsertBoardLog } from "../../utils/boardModerationLog";
import { getAnnouncements, publishAnnouncement, removeAnnouncement, subscribeAnnouncements } from "../../utils/courseEnhancements";
import { getLiveSignalApiBaseUrl, getLiveSignalWebSocketUrl } from "../../utils/liveSignalApi";

const DUMMY_COMMENTS = [
    "この内容はあとで復習できますか？",
    "今の説明で理解できました。",
    "もう少しゆっくり進めてもらえると助かります。",
    "資料のこの部分が特に重要そうです。",
    "演習問題にも挑戦してみます。",
    "ありがとうございます。見えています。",
];

const DUMMY_VIEWER_NAMES = [
    "視聴者A",
    "視聴者B",
    "参加者1",
    "参加者2",
    "受講者A",
    "受講者B",
];

const REACTION_OPTIONS = [
    { key: "understood", label: "わかった" },
    { key: "repeat", label: "もう一度" },
    { key: "slow", label: "ゆっくり" },
    { key: "fast", label: "速い" },
];
const REACTION_KEYS = REACTION_OPTIONS.map((option) => option.key);
const REACTION_TIMING_GUIDE = [
    "講義中いつでもOK（ボタンを押すだけ!）",
    "新しい概念や用語の説明の後",
    "演習問題に取り組む前",
    "演習問題の解説を聞いた後",
    "授業の妨げにならないので積極的に使いましょう!",
];
const REACTION_HISTORY_KEY = "board_reaction_history_snapshot_v1";
const REACTION_HISTORY_DELETED_IDS_KEY = "board_reaction_history_deleted_ids_v1";
const REACTION_TIMELINE_MEMO_KEY = "board_reaction_timeline_memos_v1";

function createDefaultReactions() {
    return {
        understood: 0,
        repeat: 0,
        slow: 0,
        fast: 0,
    };
}

function removeTimelineBucketFromSession(session, bucketTime) {
    if (!session || !bucketTime) return session;
    const normalizedBucketTime = String(bucketTime).slice(0, 16);
    const nextEvents = Array.isArray(session.reactionEvents)
        ? session.reactionEvents.filter((event) => String(event?.at || "").slice(0, 16) !== normalizedBucketTime)
        : [];
    const nextTimeline = Array.isArray(session.reactionTimeline)
        ? session.reactionTimeline.filter((bucket) => String(bucket?.time || "").slice(0, 16) !== normalizedBucketTime)
        : [];

    const nextReactions = createDefaultReactions();
    nextEvents.forEach((event) => {
        if (REACTION_KEYS.includes(event?.reaction)) {
            nextReactions[event.reaction] += 1;
        }
    });

    return {
        ...session,
        reactionEvents: nextEvents,
        reactionTimeline: nextTimeline,
        reactions: nextReactions,
        totalReactionCount: nextEvents.length,
    };
}

function getDeletedReactionHistoryIds() {
    try {
        const raw = localStorage.getItem(REACTION_HISTORY_DELETED_IDS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch (error) {
        return [];
    }
}

function persistDeletedReactionHistoryIds(ids) {
    localStorage.setItem(REACTION_HISTORY_DELETED_IDS_KEY, JSON.stringify(ids));
}

function filterDeletedReactionHistory(history, deletedIds) {
    const deletedIdSet = new Set((deletedIds || []).map((id) => String(id)));
    return (Array.isArray(history) ? history : []).filter((session) => !deletedIdSet.has(String(session?.id || "")));
}

function getReactionTimelineMemos() {
    try {
        const raw = localStorage.getItem(REACTION_TIMELINE_MEMO_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function formatSessionLabel(session) {
    if (!session) return "授業リアクション";
    return session.label || "授業リアクション";
}

function formatSessionTime(isoString) {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getSignalHealthUrl() {
    return getLiveSignalApiBaseUrl();
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function formatDefaultLabel(prefix = "USER") {
    return prefix;
}

async function wakeSignalServer() {
    const healthUrl = getSignalHealthUrl();
    let lastError = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(healthUrl, {
                method: "GET",
                cache: "no-store",
                mode: "cors",
            });
            if (response.ok) return true;
            lastError = new Error(`healthcheck_failed_${response.status}`);
        } catch (error) {
            lastError = error;
        }

        await wait(4000);
    }

    throw lastError || new Error("signal_server_unavailable");
}

function normalizeBoardMessage(message) {
    return {
        id: message.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        text: message.text || "",
        type: message.chatType || message.type || "normal",
        amount: Number(message.amount || 0),
        timestamp: message.timestamp || "",
        user: message.user || "USER",
        messageKind: message.messageKind || (message.isQuestion ? "question" : "comment"),
        isQuestion: Boolean(message.isQuestion || message.messageKind === "question"),
        isAnonymous: Boolean(message.isAnonymous),
        likeCount: Number(message.likeCount || 0),
        recipientLabel: message.recipientLabel || "",
        recipientAddress: message.recipientAddress || "",
        senderAddress: message.senderAddress || "",
    };
}

function upsertMessage(messages, nextMessage) {
    const normalized = normalizeBoardMessage(nextMessage);
    const index = messages.findIndex((item) => item.id === normalized.id);
    if (index === -1) {
        return [...messages, normalized].slice(-180);
    }

    const clone = [...messages];
    clone[index] = {
        ...clone[index],
        ...normalized,
    };
    return clone;
}

function Live_page(props) {
    const contract = useMemo(() => props.cont || new Contracts_MetaMask(), [props.cont]);
    const access = useAccessControl(contract);
    const [messages, setMessages] = useState([]);
    const [sessionMessages, setSessionMessages] = useState({});
    const [dummyCommentsEnabled, setDummyCommentsEnabled] = useState(false);
    const [isChatVisible, setIsChatVisible] = useState(true);
    const [pinnedSuperchat, setPinnedSuperchat] = useState(null);
    const [signalStatus, setSignalStatus] = useState("connecting");
    const [boardNotice, setBoardNotice] = useState("講義用の掲示板に接続しています。");
    const [chatDisplayName, setChatDisplayName] = useState("");
    const [pinnedNotice, setPinnedNotice] = useState(null);
    const [boardReactions, setBoardReactions] = useState(() => createDefaultReactions());
    const [selectedReaction, setSelectedReaction] = useState("");
    const [reactionSession, setReactionSession] = useState(null);
    const [reactionHistory, setReactionHistory] = useState([]);
    const [boardSession, setBoardSession] = useState(null);
    const [boardSessionHistory, setBoardSessionHistory] = useState([]);
    const [selectedBoardHistoryIds, setSelectedBoardHistoryIds] = useState([]);
    const [selectedReactionHistoryIds, setSelectedReactionHistoryIds] = useState([]);
    const [deletedReactionHistoryIds, setDeletedReactionHistoryIds] = useState(() => getDeletedReactionHistoryIds());
    const [selectedBoardSessionId, setSelectedBoardSessionId] = useState("");
    const [isBoardCommentSectionOpen, setIsBoardCommentSectionOpen] = useState(true);
    const [isBoardCommentPanelOpen, setIsBoardCommentPanelOpen] = useState(false);
    const [boardSessionLabel, setBoardSessionLabel] = useState("");
    const [reactionSessionLabel, setReactionSessionLabel] = useState("");
    const [teacherNoticeDraft, setTeacherNoticeDraft] = useState("");
    const [isRestoringBoardMessage, setIsRestoringBoardMessage] = useState(false);
    const [reactionTimelineMemos, setReactionTimelineMemos] = useState(() => getReactionTimelineMemos());
    const [likedQuestionIds, setLikedQuestionIds] = useState([]);
    const [announcements, setAnnouncements] = useState(() => getAnnouncements().slice(0, 5));
    const wsRef = useRef(null);
    const pinTimeoutRef = useRef(null);

    const canViewBoard = access.canViewLive;
    const canPostChat = access.canJoinLive;
    const isTeacher = access.isTeacher;
    const isViewingCurrentLecture = !selectedBoardSessionId || selectedBoardSessionId === String(boardSession?.id || "");
    const reactionSessionDisplayLabel = reactionSession
        ? `${formatSessionLabel(reactionSession)}${reactionSession?.endedAt ? "" : "（現在）"}`
        : "現在の授業";
    const displayedMessages = isViewingCurrentLecture
        ? messages
        : (sessionMessages[selectedBoardSessionId] || []);

    const resolveDefaultDisplayName = () => {
        if (chatDisplayName) return chatDisplayName;
        if (access.roleLabel) {
            return formatDefaultLabel(access.roleLabel);
        }
        if (access.isTeacher) return formatDefaultLabel("教員");
        if (access.isConnected) return formatDefaultLabel("学生");
        return "GUEST";
    };

    const questionMessages = useMemo(() => (
        [...displayedMessages]
            .filter((item) => item.messageKind === "question")
            .sort((left, right) => {
                const likeGap = Number(right.likeCount || 0) - Number(left.likeCount || 0);
                if (likeGap !== 0) return likeGap;
                return String(right.timestamp || "").localeCompare(String(left.timestamp || ""));
            })
            .slice(0, 5)
    ), [displayedMessages]);

    const boardSessionOptions = useMemo(() => {
        const currentOption = boardSession ? [{
            id: String(boardSession.id),
            label: `${formatSessionLabel(boardSession)}（現在）`,
            messageCount: Array.isArray(messages) ? messages.length : 0,
            startedAt: boardSession.startedAt || "",
            isCurrent: true,
        }] : [];
        const historyOptions = boardSessionHistory.map((session) => ({
            id: String(session.id),
            label: formatSessionLabel(session),
            messageCount: Number(session.messageCount || 0),
            startedAt: session.startedAt || "",
            isCurrent: false,
        }));
        return [...currentOption, ...historyOptions];
    }, [messages, boardSession, boardSessionHistory]);

    const selectedBoardSession = useMemo(
        () => boardSessionOptions.find((session) => session.id === selectedBoardSessionId) || boardSessionOptions[0] || null,
        [boardSessionOptions, selectedBoardSessionId]
    );
    const currentReactionTimeline = useMemo(
        () => Array.isArray(reactionSession?.reactionTimeline) ? reactionSession.reactionTimeline.slice(-8).reverse() : [],
        [reactionSession]
    );

    const sendSocketMessage = (payload) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(payload));
        return true;
    };

    const getReactionMemoKey = (sessionId, bucketTime) => `${String(sessionId || "current")}::${String(bucketTime || "")}`;

    const updateReactionTimelineMemo = (sessionId, bucketTime, value) => {
        const memoKey = getReactionMemoKey(sessionId, bucketTime);
        setReactionTimelineMemos((current) => {
            const next = {
                ...current,
                [memoKey]: value,
            };
            localStorage.setItem(REACTION_TIMELINE_MEMO_KEY, JSON.stringify(next));
            return next;
        });
    };

    const syncBoardState = (boardState) => {
        if (!boardState) return;
        if (Array.isArray(boardState.messages)) {
            const nextMessages = boardState.messages.map(normalizeBoardMessage);
            setMessages(nextMessages);
            if (boardState.boardSession?.id) {
                setSessionMessages((current) => ({
                    ...current,
                    [String(boardState.boardSession.id)]: nextMessages,
                }));
            }
            const latestSuperchat = [...nextMessages].reverse().find((item) => item.type === "superchat") || null;
            setPinnedSuperchat(latestSuperchat);
        }
        setPinnedNotice(boardState.pinnedNotice || null);
        setReactionSession(boardState.reactionSession || null);
        setReactionHistory(filterDeletedReactionHistory(boardState.reactionHistory, deletedReactionHistoryIds));
        setBoardSession(boardState.boardSession || null);
        setBoardSessionHistory(Array.isArray(boardState.boardSessionHistory) ? boardState.boardSessionHistory : []);
        setBoardReactions({
            ...createDefaultReactions(),
            ...(boardState.reactionSession?.reactions || {}),
        });
        setSelectedReaction(boardState.reactionSession?.currentReaction || "");
    };

    const handleIncomingMessage = (payload) => {
        const nextMessage = normalizeBoardMessage(payload);
        setMessages((prev) => upsertMessage(prev, nextMessage));

        if (nextMessage.type === "superchat") {
            if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
            setPinnedSuperchat(nextMessage);
            pinTimeoutRef.current = window.setTimeout(() => {
                setPinnedSuperchat(null);
            }, 15000);
        }
    };

    const publishChatMessage = async (text, type = "normal", amount = 0, options = {}) => {
        const trimmed = String(text || "").trim();
        if (type !== "superchat" && !trimmed) return;

        let superchatRecipient = null;
        if (type === "superchat") {
            try {
                superchatRecipient = await contract?.send_superchat?.(amount, options.recipientAddress || "");
            } catch (error) {
                console.error("Failed to send superchat", error);
                if (error?.message === "superchat_recipient_not_found") {
                    alert("送金先の教員アドレスが見つかりませんでした。");
                } else if (error?.message === "insufficient_ttt_balance") {
                    alert("TTT 残高が不足しています。");
                } else {
                    alert(error?.message || "スーパーチャットの送信に失敗しました。");
                }
                return;
            }
        }

        const payload = {
            type: "chat-message",
            id: `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            text: trimmed,
            amount,
            chatType: type,
            timestamp: new Date().toLocaleTimeString("ja-JP"),
            user: options.isAnonymous ? "匿名質問" : (options.overrideUser || resolveDefaultDisplayName()),
            messageKind: options.messageKind || (type === "superchat" ? "superchat" : "comment"),
            isQuestion: Boolean(options.isQuestion),
            isAnonymous: Boolean(options.isAnonymous),
            recipientLabel: type === "superchat" ? (superchatRecipient?.label || "教員側") : "",
            recipientAddress: type === "superchat" ? (superchatRecipient?.address || options.recipientAddress || "") : "",
            senderAddress: access.address || "",
        };

        const sent = sendSocketMessage(payload);
        if (!sent) {
            alert(type === "superchat"
                ? "掲示板サーバーに接続できていないため、スーパーチャットを反映できません。"
                : "掲示板サーバーに接続できていないため、コメントを送信できません。");
        }
    };

    const handleSendMessage = async (text, type = "normal", amount = 0, options = {}) => {
        await publishChatMessage(text, type, amount, options);
    };

    const handleQuestionLike = (messageId) => {
        if (!canPostChat) {
            alert("質問を支持するには MetaMask を接続してください。");
            return;
        }
        if (likedQuestionIds.includes(messageId)) return;
        const sent = sendSocketMessage({
            type: "board-question-like",
            messageId,
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
            return;
        }
        appendActivityLog(ACTION_TYPES.LIVE_QUESTION_LIKED, { page: "live", messageId });
        setLikedQuestionIds((current) => [...current, messageId]);
    };

    const handleReaction = (reactionKey) => {
        if (!canPostChat) {
            alert("リアクションするには MetaMask を接続してください。");
            return;
        }
        setSelectedReaction(reactionKey);
        sendSocketMessage({
            type: "board-reaction",
            reaction: reactionKey,
        });
    };

    const handlePinNotice = () => {
        const trimmed = teacherNoticeDraft.trim();
        if (!trimmed) {
            alert("固定コメントを入力してください。");
            return;
        }
        const sent = sendSocketMessage({
            type: "board-pin-notice",
            text: trimmed,
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
            return;
        }
        publishAnnouncement({
            title: "授業内お知らせ",
            body: trimmed,
            author: resolveDefaultDisplayName(),
        });
        appendActivityLog(ACTION_TYPES.LIVE_ANNOUNCEMENT_PUBLISHED, {
            page: "live",
            textLength: trimmed.length,
        });
        setTeacherNoticeDraft("");
    };

    const handleClearPinnedNotice = () => {
        const sent = sendSocketMessage({ type: "board-clear-pinned-notice" });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
        }
        const current = announcements[0];
        if (current?.pinned) {
            removeAnnouncement(current.id);
        }
    };

    const handleResetReactions = () => {
        const sent = sendSocketMessage({ type: "board-reset-reactions" });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
        }
        appendActivityLog(ACTION_TYPES.LIVE_REACTION_RESET, { page: "live" });
    };

    const handleStartReactionSession = () => {
        if (!isTeacher) return;
        const sent = sendSocketMessage({
            type: "board-start-reaction-session",
            label: reactionSessionLabel.trim(),
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
            return;
        }
        appendActivityLog(ACTION_TYPES.LIVE_REACTION_SESSION_STARTED, {
            page: "live",
            label: reactionSessionLabel.trim() || "現在の授業",
        });
        setReactionSessionLabel("");
    };

    const handleStartBoardSession = () => {
        if (!isTeacher) return;
        const sent = sendSocketMessage({
            type: "board-start-chat-session",
            label: boardSessionLabel.trim(),
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていません。");
            return;
        }
        setBoardSessionLabel("");
    };

    const toggleBoardHistorySelection = (sessionId) => {
        const normalizedId = String(sessionId || "");
        setSelectedBoardHistoryIds((current) => (
            current.includes(normalizedId)
                ? current.filter((item) => item !== normalizedId)
                : [...current, normalizedId]
        ));
    };

    const handleDeleteSelectedBoardHistory = () => {
        if (selectedBoardHistoryIds.length === 0) return;
        setBoardSessionHistory((current) => current.filter((session) => !selectedBoardHistoryIds.includes(String(session.id))));
        setSessionMessages((current) => {
            const next = { ...current };
            selectedBoardHistoryIds.forEach((id) => {
                delete next[String(id)];
            });
            return next;
        });
        setSelectedBoardHistoryIds((current) => current.filter((id) => !selectedBoardHistoryIds.includes(id)));

        const sent = sendSocketMessage({
            type: "board-delete-chat-history",
            sessionIds: selectedBoardHistoryIds,
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていないため、この端末の共有コメント履歴からのみ削除しました。");
        }
    };

    const handleClearPinnedSuperchat = () => {
        setPinnedSuperchat(null);
    };

    const handleDeleteBoardMessage = (messageId) => {
        if (!isTeacher) return;
        const targetSessionId = String(selectedBoardSessionId || boardSession?.id || "");
        if (!targetSessionId || !messageId) return;

        if (targetSessionId === String(boardSession?.id || "")) {
            setMessages((current) => current.filter((item) => String(item.id) !== String(messageId)));
        }
        setSessionMessages((current) => {
            const next = { ...current };
            const currentMessages = next[targetSessionId] || [];
            next[targetSessionId] = currentMessages.filter((item) => String(item.id) !== String(messageId));
            return next;
        });
        if (String(pinnedSuperchat?.id || "") === String(messageId)) {
            setPinnedSuperchat(null);
        }

        const sent = sendSocketMessage({
            type: "board-delete-message",
            sessionId: targetSessionId,
            messageId: String(messageId),
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていないため、この端末の表示からのみ削除しました。");
        }
    };

    const handleRestoreBoardMessage = () => {
        if (!isTeacher || isRestoringBoardMessage) return;
        const targetSessionId = String(selectedBoardSessionId || boardSession?.id || "");
        if (!targetSessionId) return;

        setIsRestoringBoardMessage(true);
        const sent = sendSocketMessage({
            type: "board-restore-message",
            sessionId: targetSessionId,
        });
        if (!sent) {
            setIsRestoringBoardMessage(false);
            alert("掲示板サーバーに接続できていないため、削除コメントを復元できません。");
        }
    };

    const toggleReactionHistorySelection = (sessionId) => {
        const normalizedId = String(sessionId || "");
        setSelectedReactionHistoryIds((current) => (
            current.includes(normalizedId)
                ? current.filter((item) => item !== normalizedId)
                : [...current, normalizedId]
        ));
    };

    const handleDeleteSelectedReactionHistory = () => {
        if (selectedReactionHistoryIds.length === 0) return;
        const nextDeletedIds = [...new Set([...deletedReactionHistoryIds, ...selectedReactionHistoryIds])];
        setDeletedReactionHistoryIds(nextDeletedIds);
        persistDeletedReactionHistoryIds(nextDeletedIds);
        setReactionHistory((current) => filterDeletedReactionHistory(current, nextDeletedIds));
        setSessionMessages((current) => {
            const next = { ...current };
            selectedReactionHistoryIds.forEach((id) => {
                delete next[String(id)];
            });
            return next;
        });
        setSelectedReactionHistoryIds([]);

        const sent = sendSocketMessage({
            type: "board-delete-reaction-history",
            sessionIds: selectedReactionHistoryIds,
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていないため、この端末の履歴からのみ削除しました。");
        }
    };

    const handleDeleteReactionTimelineBucket = (bucketTime) => {
        if (!isTeacher || !bucketTime) return;

        const sent = sendSocketMessage({
            type: "board-delete-reaction-timeline-bucket",
            bucketTime,
        });
        if (!sent) {
            alert("掲示板サーバーに接続できていないため、押下タイムラインを削除できません。");
            return;
        }

        const sessionId = reactionSession?.id || "current";
        const memoKey = getReactionMemoKey(sessionId, bucketTime);

        setReactionTimelineMemos((current) => {
            if (!(memoKey in current)) return current;
            const next = { ...current };
            delete next[memoKey];
            localStorage.setItem(REACTION_TIMELINE_MEMO_KEY, JSON.stringify(next));
            return next;
        });
        setReactionSession((current) => removeTimelineBucketFromSession(current, bucketTime));
    };

    useEffect(() => {
        let active = true;

        const loadDisplayName = async () => {
            if (access.isLoading) return;
            if (!access.address) {
                if (active) setChatDisplayName("GUEST");
                return;
            }

            try {
                const userData = await contract?.get_user_data?.(access.address);
                const userName = String(userData?.[0] || "").trim();
                if (!active) return;
                setChatDisplayName(
                    userName || resolveDefaultDisplayName()
                );
            } catch (error) {
                if (!active) return;
                setChatDisplayName(resolveDefaultDisplayName());
            }
        };

        loadDisplayName();

        return () => {
            active = false;
        };
    }, [access.address, access.isLoading, access.isTeacher, access.roleLabel, contract]);

    useEffect(() => {
        logPageView("board", { action: ACTION_TYPES.LIVE_PAGE_VIEWED });
        appendActivityLog(ACTION_TYPES.LIVE_PAGE_VIEWED, { page: "board" });

        let socket = null;
        let heartbeatTimer = null;
        let cancelled = false;

        const initializeSocket = async () => {
            try {
                setSignalStatus("connecting");
                setBoardNotice("掲示板サーバーを起動しています。少しお待ちください。");
                await wakeSignalServer();
                if (cancelled) return;

                socket = new WebSocket(getLiveSignalWebSocketUrl());
                wsRef.current = socket;

                socket.onopen = () => {
                    setSignalStatus("connected");
                    setBoardNotice("講義掲示板に接続しました。コメント、質問、リアクションが使えます。");
                    socket.send(JSON.stringify({
                        type: "register",
                        address: access.address,
                        displayName: resolveDefaultDisplayName(),
                        role: isTeacher ? "staff" : "viewer",
                        canBroadcast: false,
                    }));

                    heartbeatTimer = window.setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: "heartbeat" }));
                        }
                    }, 20000);
                };

                socket.onclose = () => {
                    setSignalStatus("disconnected");
                    setBoardNotice("掲示板サーバーとの接続が切れました。しばらく待って再読み込みしてください。");
                    setIsRestoringBoardMessage(false);
                };

                socket.onerror = () => {
                    setSignalStatus("error");
                    setBoardNotice("掲示板サーバーに接続できていません。少し待ってから再度お試しください。");
                    setIsRestoringBoardMessage(false);
                };

                socket.onmessage = (event) => {
                    const message = JSON.parse(event.data);

                    switch (message.type) {
                    case "welcome":
                    case "presence":
                        syncBoardState(message.boardState);
                        break;
                    case "heartbeat-ack":
                        break;
                    case "chat-message":
                        appendBoardLog({
                            id: message.message.id,
                            createdAt: new Date().toISOString(),
                            type: message.message.chatType || "normal",
                            messageKind: message.message.messageKind || (message.message.isQuestion ? "question" : "comment"),
                            user: message.message.user || resolveDefaultDisplayName(),
                            text: message.message.text || "",
                            amount: message.message.amount || 0,
                            isAnonymous: Boolean(message.message.isAnonymous),
                            likeCount: Number(message.message.likeCount || 0),
                            status: "visible",
                        });
                        handleIncomingMessage(message.message);
                        break;
                    case "board-message-updated":
                        upsertBoardLog({
                            id: message.message.id,
                            createdAt: new Date().toISOString(),
                            type: message.message.chatType || "normal",
                            messageKind: message.message.messageKind || (message.message.isQuestion ? "question" : "comment"),
                            user: message.message.user || resolveDefaultDisplayName(),
                            text: message.message.text || "",
                            amount: message.message.amount || 0,
                            isAnonymous: Boolean(message.message.isAnonymous),
                            likeCount: Number(message.message.likeCount || 0),
                            status: "visible",
                        });
                        setMessages((prev) => upsertMessage(prev, message.message));
                        break;
                    case "board-pinned-notice":
                        setPinnedNotice(message.notice || null);
                        break;
                    case "board-reactions":
                        setReactionSession(message.reactionSession || null);
                        setReactionHistory(filterDeletedReactionHistory(message.reactionHistory, deletedReactionHistoryIds));
                        setBoardReactions({
                            ...createDefaultReactions(),
                            ...(message.reactionSession?.reactions || {}),
                        });
                        if (message.reactionSession?.currentReaction !== undefined) {
                            setSelectedReaction(message.reactionSession.currentReaction || "");
                        }
                        break;
                    case "board-session-updated":
                        setBoardSession(message.boardSession || null);
                        setBoardSessionHistory(Array.isArray(message.boardSessionHistory) ? message.boardSessionHistory : []);
                        if (message.boardSession?.id) {
                            setSelectedBoardSessionId(String(message.boardSession.id));
                        }
                        if (Array.isArray(message.messages)) {
                            const nextMessages = message.messages.map(normalizeBoardMessage);
                            setMessages(nextMessages);
                            if (message.boardSession?.id) {
                                setSessionMessages((current) => ({
                                    ...current,
                                    [String(message.boardSession.id)]: nextMessages,
                                }));
                            }
                        }
                        break;
                    case "board-session-messages":
                        setSessionMessages((current) => ({
                            ...current,
                            [String(message.sessionId || "")]: Array.isArray(message.messages)
                                ? message.messages.map(normalizeBoardMessage)
                                : [],
                        }));
                        if (String(message.sessionId || "") === String(boardSession?.id || "")) {
                            const nextMessages = Array.isArray(message.messages)
                                ? message.messages.map(normalizeBoardMessage)
                                : [];
                            setMessages(nextMessages);
                            const latestSuperchat = [...nextMessages].reverse().find((item) => item.type === "superchat") || null;
                            setPinnedSuperchat(latestSuperchat);
                        }
                        break;
                    case "board-message-deleted":
                        if (String(message.sessionId || "") === String(boardSession?.id || "")) {
                            setMessages((current) => current.filter((item) => String(item.id) !== String(message.messageId || "")));
                        }
                        setSessionMessages((current) => {
                            const targetSessionId = String(message.sessionId || "");
                            const existing = current[targetSessionId] || [];
                            return {
                                ...current,
                                [targetSessionId]: existing.filter((item) => String(item.id) !== String(message.messageId || "")),
                            };
                        });
                        if (String(pinnedSuperchat?.id || "") === String(message.messageId || "")) {
                            setPinnedSuperchat(null);
                        }
                        break;
                    case "board-message-restored": {
                        const restoredMessage = normalizeBoardMessage(message.message);
                        if (String(message.sessionId || "") === String(boardSession?.id || "")) {
                            setMessages((current) => upsertMessage(current, restoredMessage));
                        }
                        setSessionMessages((current) => {
                            const targetSessionId = String(message.sessionId || "");
                            const existing = current[targetSessionId] || [];
                            return {
                                ...current,
                                [targetSessionId]: upsertMessage(existing, restoredMessage),
                            };
                        });
                        if (restoredMessage.type === "superchat") {
                            setPinnedSuperchat(restoredMessage);
                        }
                        setIsRestoringBoardMessage(false);
                        break;
                    }
                    case "board-restore-failed":
                        setIsRestoringBoardMessage(false);
                        alert("復元できる削除コメントがありません。");
                        break;
                    case "message-blocked":
                        appendBoardLog({
                            type: "normal",
                            messageKind: "comment",
                            user: resolveDefaultDisplayName(),
                            text: "",
                            status: "blocked",
                            reason: "server_moderation",
                            categories: ["server"],
                        });
                        alert("コメントは不適切またはスパムと判断され、送信できませんでした。");
                        break;
                    default:
                        break;
                    }
                };
            } catch (error) {
                console.error("Failed to wake board signal server", error);
                if (cancelled) return;
                setSignalStatus("error");
                setBoardNotice("掲示板サーバーに接続できていません。少し待ってから再度お試しください。");
            }
        };

        initializeSocket();

        return () => {
            cancelled = true;
            if (heartbeatTimer) window.clearInterval(heartbeatTimer);
            if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
            socket?.close();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deletedReactionHistoryIds]);

    useEffect(() => {
        localStorage.setItem(REACTION_HISTORY_KEY, JSON.stringify(reactionHistory));
        window.dispatchEvent(new Event("board-reaction-history-updated"));
    }, [reactionHistory]);

    useEffect(() => {
        setSelectedReactionHistoryIds((current) => current.filter((id) => reactionHistory.some((session) => String(session.id) === id)));
    }, [reactionHistory]);

    useEffect(() => {
        setSelectedBoardHistoryIds((current) => current.filter((id) => boardSessionHistory.some((session) => String(session.id) === id)));
    }, [boardSessionHistory]);

    useEffect(() => {
        const currentSessionId = String(boardSession?.id || "");
        const selectedExists = selectedBoardSessionId && boardSessionOptions.some((option) => option.id === selectedBoardSessionId);
        if (!selectedBoardSessionId || !selectedExists) {
            setSelectedBoardSessionId(currentSessionId);
        }
    }, [boardSessionOptions, boardSession, selectedBoardSessionId]);

    useEffect(() => {
        if (!selectedBoardSessionId) return;
        if (selectedBoardSessionId === String(boardSession?.id || "")) return;
        if (sessionMessages[selectedBoardSessionId]) return;
        sendSocketMessage({
            type: "board-view-session",
            sessionId: selectedBoardSessionId,
        });
    }, [boardSession, selectedBoardSessionId, sessionMessages]);

    useEffect(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || access.isLoading) return;
        sendSocketMessage({
            type: "register",
            address: access.address,
            displayName: resolveDefaultDisplayName(),
            role: isTeacher ? "staff" : "viewer",
            canBroadcast: false,
        });
    }, [access.address, access.isLoading, chatDisplayName, isTeacher]);

    useEffect(() => {
        const sync = () => setAnnouncements(getAnnouncements().slice(0, 5));
        const unsubscribe = subscribeAnnouncements(sync);
        sync();
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!isTeacher || !dummyCommentsEnabled) return undefined;

        const interval = window.setInterval(() => {
            const randomComment = DUMMY_COMMENTS[Math.floor(Math.random() * DUMMY_COMMENTS.length)];
            const randomName = DUMMY_VIEWER_NAMES[Math.floor(Math.random() * DUMMY_VIEWER_NAMES.length)];
            publishChatMessage(randomComment, "normal", 0, {
                messageKind: "comment",
                overrideUser: randomName,
            });
        }, 3000);

        return () => window.clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dummyCommentsEnabled, isTeacher]);

    if (access.isLoading) {
        return <div className="admin-not-authorized">権限を確認しています...</div>;
    }

    if (!canViewBoard) {
        return <div className="admin-not-authorized">掲示板機能を表示できません。</div>;
    }

    return (
        <div className="live-page animate-fadeIn">
            <div className="live-container board-container">
                <section className="board-hero glass-card">
                    <div>
                        <div className="board-kicker">Lecture Board</div>
                        <h2 className="heading-lg board-title">講義掲示板</h2>
                        <p className="board-description">
                            講義中のコメント、質問、理解度リアクションをまとめる画面です。
                        </p>
                    </div>
                    <div className="board-status-group">
                        <div className={`board-status-pill ${signalStatus === "connected" ? "is-connected" : "is-disconnected"}`}>
                            接続状態: {signalStatus === "connected" ? "接続中" : "未接続"}
                        </div>
                        <div className="board-status-pill">
                            表示名: {resolveDefaultDisplayName()}
                        </div>
                    </div>
                </section>

                <div className="board-layout">
                    <aside className="board-sidebar glass-card">
                        <div className="board-panel board-panel--compact">
                            <h3 className="board-panel-title">お知らせ</h3>
                            <p className="board-panel-text">{boardNotice}</p>
                            {announcements.length > 0 ? (
                                <div className="board-question-list" style={{ marginTop: "12px" }}>
                                    {announcements.slice(0, 3).map((item) => (
                                        <div key={item.id} className="board-question-item">
                                            <div className="board-question-meta">
                                                <span>{item.author}</span>
                                                <span>{formatSessionTime(item.createdAt)}</span>
                                            </div>
                                            <div className="board-question-text">{item.body}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="board-panel board-panel--compact">
                            <h3 className="board-panel-title">利用ルール</h3>
                            <ul className="board-rule-list">
                                <li>不適切なコメントやスパムは自動でブロックされます。</li>
                                <li>質問モードで送ると、重要な質問として整理されます。</li>
                                <li>多くの人が気になる質問は支持ボタンで上に集められます。</li>
                            </ul>
                        </div>

                        <div className="board-panel">
                            <div className="board-panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <FaThumbtack />
                                教員固定コメント
                            </div>
                            {pinnedNotice ? (
                                <div className="board-pinned-notice">
                                    <div className="board-pinned-user">{pinnedNotice.user || "Teacher"}</div>
                                    <div className="board-pinned-text">{pinnedNotice.text}</div>
                                </div>
                            ) : (
                                <p className="board-panel-text">まだ固定コメントはありません。</p>
                            )}
                            {isTeacher ? (
                                <div className="board-teacher-tools">
                                    <textarea
                                        className="form-control-custom board-textarea"
                                        value={teacherNoticeDraft}
                                        onChange={(event) => setTeacherNoticeDraft(event.target.value)}
                                        placeholder="講義中の案内や重要事項を固定表示できます。"
                                        rows={3}
                                    />
                                    <div className="board-teacher-actions">
                                        <button type="button" className="btn btn-primary" onClick={handlePinNotice}>
                                            固定する
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={handleClearPinnedNotice}>
                                            解除
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="board-panel">
                            <div className="board-panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <FaBolt />
                                注目の質問
                            </div>
                            {questionMessages.length === 0 ? (
                                <p className="board-panel-text">質問が投稿されると、支持数の多いものがここに表示されます。</p>
                            ) : (
                                <div className="board-question-list">
                                    {questionMessages.map((item) => (
                                        <div key={item.id} className="board-question-item">
                                            <div className="board-question-meta">
                                                <span>{item.user}</span>
                                                <span>支持 {item.likeCount || 0}</span>
                                            </div>
                                            <div className="board-question-text">{item.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {isTeacher ? (
                            <div className="board-panel">
                                <div className="board-reactions-header" style={{ alignItems: "center", marginBottom: "12px" }}>
                                    <h3 className="board-panel-title">授業別リアクション履歴</h3>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={handleDeleteSelectedReactionHistory}
                                        disabled={selectedReactionHistoryIds.length === 0}
                                    >
                                        選択した履歴を削除
                                    </button>
                                </div>
                                {reactionHistory.length === 0 ? (
                                    <p className="board-panel-text">授業を切り替えると、前の授業の集計がここに残ります。</p>
                                ) : (
                                    <div className="board-session-history">
                                        {reactionHistory.slice(0, 5).map((session) => (
                                            <div key={session.id} className="board-session-history-item">
                                                <div className="board-question-meta" style={{ gap: "12px", alignItems: "center" }}>
                                                    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedReactionHistoryIds.includes(String(session.id))}
                                                            onChange={() => toggleReactionHistorySelection(session.id)}
                                                        />
                                                        <span>{formatSessionLabel(session)}</span>
                                                    </label>
                                                    <span>{formatSessionTime(session.startedAt)}</span>
                                                </div>
                                                <div className="board-session-reaction-values">
                                                    {REACTION_OPTIONS.map((item) => (
                                                        <span key={item.key}>{item.label}: {session.reactions?.[item.key] || 0}</span>
                                                    ))}
                                                    <span>総押下: {session.totalReactionCount || 0}</span>
                                                </div>
                                                {Array.isArray(session.reactionTimeline) && session.reactionTimeline.length > 0 ? (
                                                    <div className="board-session-reaction-values" style={{ marginTop: "8px", display: "grid", gap: "4px" }}>
                                                        {session.reactionTimeline.slice(-5).map((bucket) => (
                                                            <span key={`${session.id}_${bucket.time}`}>
                                                                {formatSessionTime(bucket.time)} / わかった {bucket.understood} / もう一度 {bucket.repeat} / ゆっくり {bucket.slow} / 速い {bucket.fast} / 合計 {bucket.total}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {pinnedSuperchat ? (
                            <div className="board-panel board-superchat-panel" style={{ background: "linear-gradient(135deg, rgba(230,139,0,0.18), rgba(211,47,47,0.18))" }}>
                                <div className="board-reactions-header" style={{ alignItems: "center", marginBottom: "12px" }}>
                                    <div className="board-panel-title" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 0 }}>
                                        <FaCoins />
                                        注目のスーパーチャット
                                    </div>
                                    {isTeacher ? (
                                        <button type="button" className="btn btn-secondary" onClick={handleClearPinnedSuperchat}>
                                            注目表示を削除
                                        </button>
                                    ) : null}
                                </div>
                                <div className="board-superchat-user">{pinnedSuperchat.user}</div>
                                <div className="board-superchat-amount">{pinnedSuperchat.amount} TTT</div>
                                {pinnedSuperchat.recipientLabel ? (
                                    <div className="board-panel-text" style={{ marginBottom: "8px" }}>
                                        送り先: {pinnedSuperchat.recipientLabel}
                                    </div>
                                ) : null}
                                <div className="board-superchat-text">{pinnedSuperchat.text || "メッセージなし"}</div>
                            </div>
                        ) : null}

                        {isTeacher ? (
                            <div className="board-panel">
                                <h3 className="board-panel-title">教員用操作</h3>
                                <button
                                    onClick={() => setDummyCommentsEnabled((current) => !current)}
                                    className={`btn ${dummyCommentsEnabled ? "btn-secondary" : "btn-primary"}`}
                                    style={{ width: "100%" }}
                                >
                                    {dummyCommentsEnabled ? "ダミーコメント停止" : "ダミーコメント開始"}
                                </button>
                            </div>
                        ) : null}
                    </aside>

                    <div className="board-main-column">
                        <section className="board-chat glass-card">
                            <div className="board-chat-header">
                                <div>
                                    <h3 className="heading-md" style={{ margin: 0 }}>共有コメント</h3>
                                    <p className="board-chat-subtitle">
                                        コメント、質問、スーパーチャットを同じ掲示板で共有できます。
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsChatVisible((current) => !current)}
                                    className="btn board-chat-toggle"
                                    title="掲示板の表示を切り替える"
                                >
                                    {isChatVisible ? <><FaCommentSlash /> 掲示板を閉じる</> : <><FaComment /> 掲示板を開く</>}
                                </button>
                            </div>

                            {isChatVisible ? (
                                <div className="board-chat-body">
                                    <div className="board-panel board-chat-toolbar">
                                        <div className="board-chat-toolbar-header">
                                            <div className="board-chat-toolbar-copy">
                                                <h3 className="board-panel-title" style={{ marginBottom: "4px" }}>講義ごとの共有コメント</h3>
                                                {isBoardCommentSectionOpen && isBoardCommentPanelOpen ? (
                                                    <p className="board-panel-text">
                                                        現在の授業と過去の授業のコメント履歴を切り替えて確認できます。
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="board-chat-toolbar-actions">
                                                <button
                                                    type="button"
                                                    className="board-chat-toolbar-toggle"
                                                    onClick={() => setIsBoardCommentSectionOpen((current) => !current)}
                                                    aria-expanded={isBoardCommentSectionOpen}
                                                >
                                                    {isBoardCommentSectionOpen ? "講義ごとの共有コメントを閉じる" : "講義ごとの共有コメントを開く"}
                                                </button>
                                                {isTeacher && isBoardCommentSectionOpen ? (
                                                    <button
                                                        type="button"
                                                        className="board-chat-toolbar-toggle is-secondary"
                                                        onClick={() => setIsBoardCommentPanelOpen((current) => !current)}
                                                        aria-expanded={isBoardCommentPanelOpen}
                                                    >
                                                        {isBoardCommentPanelOpen ? "講義コメント設定を閉じる" : "講義コメント設定を開く"}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                        {!isBoardCommentSectionOpen && selectedBoardSession ? (
                                            <div className="board-chat-toolbar-minimized">
                                                <span className="board-chat-toolbar-collapsed-title">{selectedBoardSession.label}</span>
                                                <span className={`board-lecture-state ${isViewingCurrentLecture ? "is-live" : "is-archive"}`}>
                                                    {isViewingCurrentLecture ? "投稿できます" : "閲覧専用"}
                                                </span>
                                            </div>
                                        ) : null}
                                        {isBoardCommentSectionOpen && !isBoardCommentPanelOpen && selectedBoardSession ? (
                                            <div className="board-chat-toolbar-collapsed">
                                                <span className="board-lecture-badge">
                                                    {selectedBoardSession.isCurrent ? "現在の講義" : "過去の講義"}
                                                </span>
                                                <span className="board-chat-toolbar-collapsed-title">{selectedBoardSession.label}</span>
                                                <span className={`board-lecture-state ${isViewingCurrentLecture ? "is-live" : "is-archive"}`}>
                                                    {isViewingCurrentLecture ? "投稿できます" : "閲覧専用"}
                                                </span>
                                            </div>
                                        ) : null}
                                        {isBoardCommentSectionOpen && isBoardCommentPanelOpen && selectedBoardSession ? (
                                            <div className="board-chat-toolbar-current">
                                                <div className="board-lecture-summary">
                                                    <div className="board-lecture-summary-main">
                                                        <div className="board-lecture-badge">
                                                            {selectedBoardSession.isCurrent ? "現在の講義" : "過去の講義"}
                                                        </div>
                                                        <div className="board-lecture-title">{selectedBoardSession.label}</div>
                                                        <div className="board-lecture-meta">
                                                            <span>開始: {formatSessionTime(selectedBoardSession.startedAt)}</span>
                                                            <span>共有コメント: {selectedBoardSession.messageCount}件</span>
                                                        </div>
                                                    </div>
                                                    <div className={`board-lecture-state ${isViewingCurrentLecture ? "is-live" : "is-archive"}`}>
                                                        {isViewingCurrentLecture ? "投稿できます" : "閲覧専用"}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                        {isBoardCommentSectionOpen && isBoardCommentPanelOpen ? (
                                            <div className="board-chat-toolbar-body">
                                                {isTeacher ? (
                                                    <div className="board-chat-toolbar-section">
                                                        <div className="board-chat-toolbar-label">表示する講義コメントを選択</div>
                                                        <div className="board-lecture-selector">
                                                            <div className="board-lecture-selector-controls">
                                                                <select
                                                                    className="form-control-custom board-lecture-select"
                                                                    value={selectedBoardSessionId}
                                                                    onChange={(event) => setSelectedBoardSessionId(event.target.value)}
                                                                >
                                                                    {boardSessionOptions.map((session) => (
                                                                        <option key={session.id} value={session.id}>
                                                                            {session.label} / {session.messageCount}件
                                                                        </option>
                                                                ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="board-chat-restore-row">
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                onClick={handleRestoreBoardMessage}
                                                                disabled={isRestoringBoardMessage}
                                                            >
                                                                {isRestoringBoardMessage ? "復元中..." : "直前の削除を元に戻す"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {isTeacher ? (
                                                    <div className="board-chat-toolbar-section">
                                                        <div className="board-chat-toolbar-label">新しい講義コメントを開始</div>
                                                        <div className="board-session-actions">
                                                            <input
                                                                type="text"
                                                                className="form-control-custom board-session-input"
                                                                value={boardSessionLabel}
                                                                onChange={(event) => setBoardSessionLabel(event.target.value)}
                                                                placeholder="共有コメントの講義名を任意で入力"
                                                            />
                                                            <button type="button" className="btn btn-secondary" onClick={handleStartBoardSession}>
                                                                この授業でコメント開始
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {isTeacher && boardSessionHistory.length > 0 ? (
                                                    <div className="board-chat-toolbar-section">
                                                        <div className="board-reactions-header" style={{ alignItems: "center", marginBottom: "12px" }}>
                                                            <h4 className="board-panel-title" style={{ marginBottom: 0 }}>共有コメント履歴</h4>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                onClick={handleDeleteSelectedBoardHistory}
                                                                disabled={selectedBoardHistoryIds.length === 0}
                                                            >
                                                                選択したコメント履歴を削除
                                                            </button>
                                                        </div>
                                                        <div className="board-session-history">
                                                            {boardSessionHistory.slice(0, 5).map((session) => (
                                                                <div key={session.id} className="board-session-history-item">
                                                                    <div className="board-question-meta" style={{ gap: "12px", alignItems: "center" }}>
                                                                        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedBoardHistoryIds.includes(String(session.id))}
                                                                                onChange={() => toggleBoardHistorySelection(session.id)}
                                                                            />
                                                                            <span>{formatSessionLabel(session)}</span>
                                                                        </label>
                                                                        <span>{formatSessionTime(session.startedAt)}</span>
                                                                    </div>
                                                                    <div className="board-session-reaction-values">
                                                                        <span>共有コメント: {session.messageCount || 0}件</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {!isTeacher ? (
                                                    <div className="board-chat-toolbar-section">
                                                        <div className="board-chat-toolbar-label">共有コメントの種類</div>
                                                        <div className="board-lecture-chip-list">
                                                            {boardSessionOptions.slice(0, 5).map((session) => (
                                                                <div
                                                                    key={session.id}
                                                                    className={`board-lecture-chip ${selectedBoardSessionId === session.id ? "is-active" : ""}`}
                                                                >
                                                                    <span className="board-lecture-chip-label">{session.label}</span>
                                                                    <span className="board-lecture-chip-count">{session.messageCount}件</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {isTeacher ? (
                                                    <div className="board-lecture-chip-list">
                                                        {boardSessionOptions.slice(0, 5).map((session) => (
                                                            <button
                                                                key={session.id}
                                                                type="button"
                                                                className={`board-lecture-chip ${selectedBoardSessionId === session.id ? "is-active" : ""}`}
                                                                onClick={() => setSelectedBoardSessionId(session.id)}
                                                            >
                                                                <span className="board-lecture-chip-label">{session.label}</span>
                                                                <span className="board-lecture-chip-count">{session.messageCount}件</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                <div className="board-chat-feed">
                                    <Chat_feed
                                        messages={displayedMessages}
                                        onQuestionLike={handleQuestionLike}
                                        likedQuestionIds={likedQuestionIds}
                                        canModerate={isTeacher}
                                        onDeleteMessage={handleDeleteBoardMessage}
                                    />
                                </div>
                                <div className="board-chat-input">
                                    <Chat_input
                                        onSendMessage={handleSendMessage}
                                        cont={contract}
                                        isRegistered={canPostChat && isViewingCurrentLecture}
                                        isLoadingAuth={access.isLoading}
                                        readOnlyReason={isViewingCurrentLecture ? "" : "過去の授業コメントを表示中です。送信するには現在の授業へ切り替えてください。"}
                                    />
                                </div>
                            </div>
                            ) : (
                                <div className="board-chat-collapsed">
                                    掲示板を閉じています。右上のボタンで再表示できます。
                                </div>
                            )}
                        </section>

                        <section className="board-reactions-strip glass-card">
                            <div className="board-reactions-header">
                                <div>
                                    <h3 className="board-panel-title" style={{ marginBottom: "4px" }}>理解度リアクション</h3>
                                    <p className="board-panel-text">
                                        {reactionSessionDisplayLabel} / 開始 {formatSessionTime(reactionSession?.startedAt)} / 総押下 {reactionSession?.totalReactionCount || 0}
                                    </p>
                                </div>
                                {isTeacher ? (
                                    <div className="reaction-session-actions">
                                        <input
                                            type="text"
                                            className="form-control-custom reaction-session-input"
                                            value={reactionSessionLabel}
                                            onChange={(event) => setReactionSessionLabel(event.target.value)}
                                            placeholder="授業名を任意で入力"
                                        />
                                        <button type="button" className="btn btn-primary" onClick={handleStartReactionSession}>
                                            この授業で集計開始
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={handleResetReactions}>
                                            現在の授業をリセット
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            {!isTeacher ? (
                                <div className="reaction-guide-card">
                                    <div className="reaction-guide-title">押すタイミング</div>
                                    <div className="reaction-guide-grid">
                                        {REACTION_TIMING_GUIDE.map((item) => (
                                            <div key={item} className="reaction-guide-item">{item}</div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {isTeacher ? (
                                <div className="reaction-guide-card is-teacher">
                                    <div className="reaction-guide-title">押下タイミングの見方</div>
                                    <div className="reaction-guide-grid">
                                        {REACTION_TIMING_GUIDE.map((item) => (
                                            <div key={item} className="reaction-guide-item">{item}</div>
                                        ))}
                                    </div>
                                    <div className="reaction-timeline-card">
                                        <div className="reaction-timeline-title">現在の授業の押下タイムライン</div>
                                        {currentReactionTimeline.length === 0 ? (
                                            <div className="reaction-timeline-empty">まだリアクションはありません。</div>
                                        ) : (
                                            <div className="reaction-timeline-list">
                                                {currentReactionTimeline.map((bucket) => (
                                                    <div key={`${reactionSession?.id || "current"}_${bucket.time}`} className="reaction-timeline-item">
                                                        <div className="reaction-timeline-row">
                                                            <div className="reaction-timeline-main">
                                                                <div className="reaction-timeline-time">{formatSessionTime(bucket.time)}</div>
                                                                <div className="reaction-timeline-values">
                                                                    <span>わかった {bucket.understood}</span>
                                                                    <span>もう一度 {bucket.repeat}</span>
                                                                    <span>ゆっくり {bucket.slow}</span>
                                                                    <span>速い {bucket.fast}</span>
                                                                    <span>合計 {bucket.total}</span>
                                                                </div>
                                                            </div>
                                                            <div className="reaction-timeline-memo">
                                                                <button
                                                                    type="button"
                                                                    className="reaction-timeline-delete"
                                                                    onClick={() => handleDeleteReactionTimelineBucket(bucket.time)}
                                                                >
                                                                    この時刻を削除
                                                                </button>
                                                                <label className="reaction-timeline-memo-label">メモ</label>
                                                                <input
                                                                    type="text"
                                                                    className="form-control-custom reaction-timeline-memo-input"
                                                                    value={reactionTimelineMemos[getReactionMemoKey(reactionSession?.id || "current", bucket.time)] || ""}
                                                                    onChange={(event) => updateReactionTimelineMemo(reactionSession?.id || "current", bucket.time, event.target.value)}
                                                                    placeholder="この時点の様子をメモ"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                            <div className="reaction-grid">
                                {REACTION_OPTIONS.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={`reaction-chip ${selectedReaction === item.key ? "is-active" : ""}`}
                                        onClick={() => handleReaction(item.key)}
                                    >
                                        <span>{item.label}</span>
                                        <strong>{boardReactions[item.key] || 0}</strong>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Live_page;
