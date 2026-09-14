jest.mock("../contract/contractClients", () => ({
    WALLET_PROVIDER_CHANGED_EVENT: "wallet-provider-changed",
}));

jest.mock("../contract/config", () => ({
    bootstrap_teacher_addresses: ["0xd5670D7B88411d03741680451C2ea630B68C6944"],
}));

import { mergeAccessState, resetAccessStateCache, resolveAccessState } from "./accessControl";

describe("resolveAccessState", () => {
    beforeEach(() => {
        resetAccessStateCache();
        window.localStorage.clear();
    });

    test("keeps the previous connected teacher state on soft disconnect refreshes", () => {
        const current = {
            isLoading: false,
            address: "0xteacher",
            role: "teacher",
            roleLabel: "教員",
            registeredBy: "0xadmin",
            registeredAt: 1,
            isConnected: true,
            isStudent: false,
            canViewLive: true,
            isTeacher: true,
            hasProfile: true,
            canBroadcastLive: true,
            isAuthorizedUser: true,
            canAnswerQuiz: true,
            canJoinLive: true,
        };
        const next = {
            isLoading: false,
            address: "",
            role: "guest",
            roleLabel: "未登録",
            registeredBy: "",
            registeredAt: 0,
            isConnected: false,
            isStudent: false,
            canViewLive: false,
            isTeacher: false,
            hasProfile: false,
            canBroadcastLive: false,
            isAuthorizedUser: false,
            canAnswerQuiz: false,
            canJoinLive: false,
        };

        expect(mergeAccessState(current, next, { allowSoftDisconnect: true })).toEqual(current);
        expect(mergeAccessState(current, next, { allowSoftDisconnect: false })).toEqual(next);
    });

    test("returns disconnected state when wallet address is unavailable", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue(""),
        });

        expect(access.isLoading).toBe(false);
        expect(access.isConnected).toBe(false);
        expect(access.canAnswerQuiz).toBe(false);
        expect(access.canViewLive).toBe(false);
        expect(access.isTeacher).toBe(false);
        expect(access.role).toBe("guest");
    });

    test("uses the last known wallet address when the live wallet address is delayed", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue(""),
            get_last_known_address: jest.fn().mockReturnValue("0xstudent"),
            getRegistrationDetails: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: false,
                isStudent: true,
                roleKey: "student",
                roleLabel: "学生",
                addedBy: "0xteacher",
                addedAt: 456,
            }),
            getRoleSummary: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: false,
                isStudent: true,
                roleKey: "student",
                roleLabel: "学生",
            }),
            getUserRole: jest.fn().mockResolvedValue({ key: "student", label: "学生" }),
            isRegistered: jest.fn().mockResolvedValue(true),
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent: jest.fn().mockResolvedValue(true),
            get_user_data: jest.fn().mockResolvedValue([null, null, null, "Student"]),
        });

        expect(access.address).toBe("0xstudent");
        expect(access.isConnected).toBe(true);
        expect(access.role).toBe("student");
        expect(access.canAnswerQuiz).toBe(true);
    });

    test("grants teacher capabilities when the connected user is a teacher", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xteacher"),
            getRegistrationDetails: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: true,
                isStudent: false,
                roleKey: "teacher",
                roleLabel: "教員",
                addedBy: "0xadmin",
                addedAt: 123,
            }),
            getRoleSummary: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: true,
                isStudent: false,
                roleKey: "teacher",
                roleLabel: "教員",
            }),
            getUserRole: jest.fn().mockResolvedValue({ key: "teacher", label: "教員" }),
            isRegistered: jest.fn().mockResolvedValue(true),
            isTeacher: jest.fn().mockResolvedValue(true),
            isStudent: jest.fn().mockResolvedValue(false),
            get_user_data: jest.fn().mockResolvedValue([null, null, null, "Teacher Name"]),
        });

        expect(access.address).toBe("0xteacher");
        expect(access.role).toBe("teacher");
        expect(access.roleLabel).toBe("教員");
        expect(access.isTeacher).toBe(true);
        expect(access.registeredBy).toBe("0xadmin");
        expect(access.registeredAt).toBe(123);
        expect(access.canBroadcastLive).toBe(true);
        expect(access.canAnswerQuiz).toBe(true);
        expect(access.canViewLive).toBe(true);
        expect(access.isAuthorizedUser).toBe(true);
    });

    test("treats bootstrap teacher addresses as teacher even when contract role APIs fail", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944"),
            getRegistrationDetails: jest.fn().mockResolvedValue(null),
            getRoleSummary: jest.fn().mockResolvedValue(null),
            getUserRole: jest.fn().mockResolvedValue({ key: "guest", label: "未登録" }),
            isRegistered: jest.fn().mockResolvedValue(false),
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent: jest.fn().mockResolvedValue(false),
            get_user_data: jest.fn().mockResolvedValue(null),
        });

        expect(access.role).toBe("teacher");
        expect(access.roleLabel).toBe("教員");
        expect(access.isTeacher).toBe(true);
        expect(access.isAuthorizedUser).toBe(true);
        expect(access.canAnswerQuiz).toBe(true);
    });

    test("keeps method context when contract methods rely on this", async () => {
        const contractLike = {
            teacherAddress: "0xstudent",
            get_address: jest.fn().mockResolvedValue("0xstudent"),
            getRegistrationDetails(address) {
                return Promise.resolve({
                    registered: address === this.teacherAddress,
                    isTeacher: false,
                    isStudent: address === this.teacherAddress,
                    roleKey: address === this.teacherAddress ? "student" : "guest",
                    roleLabel: address === this.teacherAddress ? "学生" : "未登録",
                    addedBy: "0xteacher",
                    addedAt: 123,
                });
            },
            getRoleSummary(address) {
                return Promise.resolve({
                    registered: address === this.teacherAddress,
                    isTeacher: false,
                    isStudent: address === this.teacherAddress,
                    roleKey: address === this.teacherAddress ? "student" : "guest",
                    roleLabel: address === this.teacherAddress ? "学生" : "未登録",
                });
            },
            getUserRole(address) {
                return Promise.resolve({
                    key: address === this.teacherAddress ? "student" : "guest",
                    label: address === this.teacherAddress ? "学生" : "未登録",
                });
            },
            isRegistered(address) {
                return Promise.resolve(address === this.teacherAddress);
            },
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent(address) {
                return Promise.resolve(address === this.teacherAddress);
            },
            get_user_data: jest.fn().mockResolvedValue([null, null, null, "Student"]),
        };

        const access = await resolveAccessState(contractLike);

        expect(access.role).toBe("student");
        expect(access.roleLabel).toBe("学生");
        expect(access.isAuthorizedUser).toBe(true);
        expect(access.canAnswerQuiz).toBe(true);
    });

    test("keeps connected but unregistered users in view-only mode when registration APIs are unavailable", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xstudent"),
            getRegistrationDetails: jest.fn().mockResolvedValue(null),
            getRoleSummary: jest.fn().mockRejectedValue(new Error("missing method")),
            getUserRole: jest.fn().mockRejectedValue(new Error("missing method")),
            isRegistered: jest.fn().mockRejectedValue(new Error("missing method")),
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent: jest.fn().mockRejectedValue(new Error("missing method")),
            get_user_data: jest.fn().mockResolvedValue([null, null, null, "Student"]),
        });

        expect(access.isConnected).toBe(true);
        expect(access.isTeacher).toBe(false);
        expect(access.isAuthorizedUser).toBe(false);
        expect(access.canAnswerQuiz).toBe(false);
        expect(access.canJoinLive).toBe(false);
        expect(access.canViewLive).toBe(true);
    });

    test("blocks connected users when the contract explicitly reports they are not registered", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xguest"),
            getRegistrationDetails: jest.fn().mockResolvedValue({
                registered: false,
                isTeacher: false,
                isStudent: false,
                roleKey: "guest",
                roleLabel: "未登録",
                addedBy: "",
                addedAt: 0,
            }),
            getRoleSummary: jest.fn().mockResolvedValue({
                registered: false,
                isTeacher: false,
                isStudent: false,
                roleKey: "guest",
                roleLabel: "未登録",
            }),
            getUserRole: jest.fn().mockResolvedValue({ key: "guest", label: "未登録" }),
            isRegistered: jest.fn().mockResolvedValue(false),
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent: jest.fn().mockResolvedValue(false),
            get_user_data: jest.fn().mockResolvedValue(null),
        });

        expect(access.isConnected).toBe(true);
        expect(access.isAuthorizedUser).toBe(false);
        expect(access.canAnswerQuiz).toBe(false);
        expect(access.canViewLive).toBe(true);
    });

    test("marks registered students as student role when the new role API is available", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xstudent"),
            getRegistrationDetails: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: false,
                isStudent: true,
                roleKey: "student",
                roleLabel: "学生",
                addedBy: "0xteacher",
                addedAt: 456,
            }),
            getRoleSummary: jest.fn().mockResolvedValue({
                registered: true,
                isTeacher: false,
                isStudent: true,
                roleKey: "student",
                roleLabel: "学生",
            }),
            getUserRole: jest.fn().mockResolvedValue({ key: "student", label: "学生" }),
            isRegistered: jest.fn().mockResolvedValue(true),
            isTeacher: jest.fn().mockResolvedValue(false),
            isStudent: jest.fn().mockResolvedValue(true),
            get_user_data: jest.fn().mockResolvedValue([null, null, null, "Student"]),
        });

        expect(access.role).toBe("student");
        expect(access.roleLabel).toBe("学生");
        expect(access.registeredBy).toBe("0xteacher");
        expect(access.registeredAt).toBe(456);
        expect(access.isStudent).toBe(true);
        expect(access.isAuthorizedUser).toBe(true);
    });

    test("does not treat a failed teacher check as teacher access", async () => {
        const access = await resolveAccessState({
            get_address: jest.fn().mockResolvedValue("0xguest"),
            getRegistrationDetails: jest.fn().mockResolvedValue(null),
            getRoleSummary: jest.fn().mockResolvedValue(null),
            getUserRole: jest.fn().mockResolvedValue({ key: "guest", label: "未登録" }),
            isRegistered: jest.fn().mockResolvedValue(false),
            isTeacher: jest.fn().mockResolvedValue([]),
            isStudent: jest.fn().mockResolvedValue(false),
            get_user_data: jest.fn().mockResolvedValue(null),
        });

        expect(access.isTeacher).toBe(false);
        expect(access.isAuthorizedUser).toBe(false);
        expect(access.canAnswerQuiz).toBe(false);
    });
});
