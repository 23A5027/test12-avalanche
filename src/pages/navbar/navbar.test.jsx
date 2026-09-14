import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Nav_menu from "./navbar";
import { useAccessControl } from "../../utils/accessControl";

const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};

jest.mock("./Modal_change_network", () => () => null);
jest.mock("../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));
jest.mock("../../contract/contractClients", () => ({
    WALLET_PROVIDER_CHANGED_EVENT: "wallet-provider-changed",
}));

describe("Nav_menu", () => {
    let cont;

    beforeEach(() => {
        jest.clearAllMocks();
        cont = {
            get_chain_id: jest.fn().mockResolvedValue("0xA869"),
            get_address: jest.fn().mockResolvedValue("0xabc123"),
        };
    });

    test("shows teacher tabs only for teachers", async () => {
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        useAccessControl.mockReturnValue({
            canViewLive: true,
            isTeacher: true,
        });

        await act(async () => {
            render(
                <MemoryRouter future={routerFuture}>
                    <Nav_menu cont={cont} />
                </MemoryRouter>
            );
        });

        expect(await screen.findByText("掲示板")).toBeInTheDocument();
        expect(screen.getByText("作成")).toBeInTheDocument();
        expect(screen.getByText("管理")).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole("link", { name: /マイページ/i })).toHaveAttribute("href", "/user_page/0xabc123");
        });
        consoleErrorSpy.mockRestore();
    });

    test("hides teacher-only tabs for students", async () => {
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        useAccessControl.mockReturnValue({
            canViewLive: true,
            isTeacher: false,
        });

        await act(async () => {
            render(
                <MemoryRouter future={routerFuture}>
                    <Nav_menu cont={cont} />
                </MemoryRouter>
            );
        });

        expect(await screen.findByText("掲示板")).toBeInTheDocument();
        expect(screen.queryByText("作成")).not.toBeInTheDocument();
        expect(screen.queryByText("管理")).not.toBeInTheDocument();
        consoleErrorSpy.mockRestore();
    });
});
