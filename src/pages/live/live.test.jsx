import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Live_page from "./live";
import { useAccessControl } from "../../utils/accessControl";
import { Contracts_MetaMask } from "../../contract/contracts";
import { getAnnouncements, subscribeAnnouncements } from "../../utils/courseEnhancements";

jest.mock("./components/chat_feed", () => ({ messages, canModerate, onDeleteMessage }) => (
    <div>
        chat-feed
        {messages.map((message) => (
            <div key={message.id}>
                <span>{message.text}</span>
                {canModerate ? (
                    <button type="button" onClick={() => onDeleteMessage?.(message.id)}>
                        削除
                    </button>
                ) : null}
            </div>
        ))}
    </div>
));
jest.mock("./components/chat_input", () => ({ readOnlyReason }) => (
    <div>{readOnlyReason || "chat-input"}</div>
));

jest.mock("../../utils/activityLog", () => ({
    ACTION_TYPES: {},
    appendActivityLog: jest.fn(),
    logPageView: jest.fn(),
}));

jest.mock("../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));

jest.mock("../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../utils/boardModerationLog", () => ({
    appendBoardLog: jest.fn(),
    upsertBoardLog: jest.fn(),
}));

jest.mock("../../utils/courseEnhancements", () => ({
    getAnnouncements: jest.fn(),
    publishAnnouncement: jest.fn(),
    removeAnnouncement: jest.fn(),
    subscribeAnnouncements: jest.fn(),
}));

class MockWebSocket {
    constructor() {
        this.readyState = 1;
        setTimeout(() => {
            this.onopen?.();
            this.onmessage?.({
                data: JSON.stringify({
                    type: "welcome",
                    boardState: {
                        messages: [{
                            id: "super_1",
                            text: "とても助かりました",
                            amount: 50,
                            chatType: "superchat",
                            timestamp: "09:15",
                            user: "学生A",
                            messageKind: "superchat",
                            isQuestion: false,
                            isAnonymous: false,
                            likeCount: 0,
                            recipientLabel: "田中TA",
                        }],
                        pinnedNotice: null,
                        boardSession: {
                            id: "current_board_session",
                            label: "第3回講義",
                            startedAt: "2026-04-07T09:00:00.000Z",
                            messageCount: 0,
                        },
                        boardSessionHistory: [{
                            id: "session_1",
                            label: "前回講義",
                            startedAt: "2026-04-01T09:00:00.000Z",
                            messageCount: 1,
                        }],
                        reactionSession: {
                            id: "current_session",
                            label: "第3回講義",
                            startedAt: "2026-04-07T09:00:00.000Z",
                            reactions: { understood: 4, repeat: 1, slow: 0, fast: 0 },
                        },
                        reactionHistory: [{
                            id: "session_1",
                            label: "前回講義",
                            startedAt: "2026-04-01T09:00:00.000Z",
                            reactions: { understood: 10, repeat: 2, slow: 1, fast: 0 },
                        }],
                    },
                }),
            });
        }, 0);
    }

    send(raw) {
        const message = JSON.parse(raw);
        if (message.type === "board-view-session") {
            setTimeout(() => {
                this.onmessage?.({
                    data: JSON.stringify({
                        type: "board-session-messages",
                        sessionId: message.sessionId,
                        messages: [{
                            id: "archived_1",
                            text: "前回講義の共有コメント",
                            amount: 0,
                            chatType: "normal",
                            timestamp: "09:10",
                            user: "学生A",
                            messageKind: "comment",
                            isQuestion: false,
                            isAnonymous: false,
                            likeCount: 0,
                        }],
                    }),
                });
            }, 0);
        }
    }

    close() {}
}

describe("Live_page", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        global.fetch = jest.fn().mockResolvedValue({ ok: true });
        global.WebSocket = MockWebSocket;
        Contracts_MetaMask.mockImplementation(() => ({
            get_user_data: jest.fn().mockResolvedValue(["田中TA"]),
        }));
        getAnnouncements.mockReturnValue([
            {
                id: "notice1",
                author: "TA",
                body: "資料URLを更新しました。",
                createdAt: "2026-04-07T08:59:00.000Z",
            },
        ]);
        subscribeAnnouncements.mockImplementation(() => () => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    test("shows announcements to students but hides teacher-only reaction history", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: false,
            isConnected: true,
            address: "0xstudent",
        });

        await act(async () => {
            render(<Live_page />);
        });

        expect(await screen.findByText("講義掲示板")).toBeInTheDocument();
        expect(screen.getByText("資料URLを更新しました。")).toBeInTheDocument();
        expect(screen.queryByText("授業別リアクション履歴")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "講義ごとの共有コメントを閉じる" }));
        fireEvent.click(screen.getByRole("button", { name: "講義ごとの共有コメントを開く" }));
        expect(screen.queryByRole("button", { name: "講義コメント設定を開く" })).not.toBeInTheDocument();
    });

    test("shows teacher-only reaction history for teachers", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        expect(await screen.findByText("授業別リアクション履歴")).toBeInTheDocument();
        expect(screen.getByText("この授業で集計開始")).toBeInTheDocument();
        expect(screen.getByText("選択した履歴を削除")).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    test("removes selected reaction history entries immediately from the current device", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        expect((await screen.findAllByText("前回講義")).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByText("選択した履歴を削除"));

        await waitFor(() => {
            expect(screen.queryByText("前回講義")).not.toBeInTheDocument();
        });
    });

    test("switches shared comments by lecture session", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        fireEvent.click(screen.getByRole("button", { name: "講義コメント設定を開く" }));
        const selector = await screen.findByDisplayValue("第3回講義（現在） / 1件");
        fireEvent.change(selector, { target: { value: "session_1" } });

        expect(screen.getByText("過去の授業コメントを表示中です。送信するには現在の授業へ切り替えてください。")).toBeInTheDocument();
    });

    test("removes selected shared comment history entries immediately from the current device", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        fireEvent.click(screen.getByRole("button", { name: "講義コメント設定を開く" }));
        expect(screen.getByText("共有コメント履歴")).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("checkbox")[1]);
        fireEvent.click(screen.getByText("選択したコメント履歴を削除"));

        await waitFor(() => {
            expect(screen.queryAllByText("前回講義").length).toBe(1);
        });
    });

    test("allows teachers to clear the highlighted superchat", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        expect(await screen.findByText("注目のスーパーチャット")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "注目表示を削除" }));

        await waitFor(() => {
            expect(screen.queryByText("注目のスーパーチャット")).not.toBeInTheDocument();
        });
    });

    test("allows teachers to delete visible board messages", async () => {
        useAccessControl.mockReturnValue({
            isLoading: false,
            canViewLive: true,
            canJoinLive: true,
            isTeacher: true,
            isConnected: true,
            address: "0xteacher",
        });

        await act(async () => {
            render(<Live_page />);
        });

        expect((await screen.findAllByText("とても助かりました")).length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);

        await waitFor(() => {
            expect(screen.queryByText("とても助かりました")).not.toBeInTheDocument();
        });
    });
});
