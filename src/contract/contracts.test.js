import { Contracts_MetaMask } from "./contracts";

const mockWaitForTransactionReceipt = jest.fn();
const mockAllowance = jest.fn();
const mockWriteContract = jest.fn();
const mockEstimateContractGas = jest.fn();
const mockEstimateFeesPerGas = jest.fn();

jest.mock("./contractClients", () => ({
    ethereum: {},
    walletClient: {
        writeContract: (...args) => mockWriteContract(...args),
    },
    publicClient: {
        waitForTransactionReceipt: (...args) => mockWaitForTransactionReceipt(...args),
        readContract: jest.fn(),
        estimateContractGas: (...args) => mockEstimateContractGas(...args),
        estimateFeesPerGas: (...args) => mockEstimateFeesPerGas(...args),
    },
    token_abi: [],
    quiz_abi: [],
    bootstrap_teacher_addresses: [],
    token_address: "0x021e416bb6bfA1e76Aa4E280828b1d55F2d5f2F0",
    ttt_token_address: "0x22b6457aC35b2A839EE6eb47c91f0941E1b21476",
    class_room_address: "0xa9AA6D24ecF43fEd6203680866f78B9A4798A8e0",
    quiz_address: "0xeb196c161EFA30939f78170694bb908E17fd1479",
    legacy_quiz_addresses: [
        "0x55B3977C7B7b913eaf175A7364c8375732d22241",
        "0xEbBD4E3276bcb847838E18DDA7585Ac8925a5eA6",
    ],
    tokenContract: {
        read: {
            allowance: (...args) => mockAllowance(...args),
        },
    },
    tttTokenContract: { read: {} },
    quizContract: { read: {} },
    amoy: { id: 43113 },
    sliceByNumber: (array, size) => {
        const chunks = [];
        for (let index = 0; index < array.length; index += size) {
            chunks.push(array.slice(index, index + size));
        }
        return chunks;
    },
    getEthereumProvider: jest.fn(() => ({})),
    waitForEthereumProvider: jest.fn(async () => ({})),
}));

jest.mock("../utils/quizCorrectAnswerStore", () => ({
    getRegisteredCorrectAnswer: jest.fn(() => ""),
}));

const mockGetRewardPayoutEntries = jest.fn(() => []);
const mockGetGrantLedgerEntries = jest.fn(() => []);

jest.mock("../utils/rewardPayoutLedger", () => ({
    getRewardPayoutEntries: (...args) => mockGetRewardPayoutEntries(...args),
}));

jest.mock("../utils/tokenGrantLedger", () => ({
    TOKEN_GRANT_KEYS: {
        POL: "answer_pol",
        TFT: "answer_thanks_tft",
        TTT: "board_ttt",
    },
    getGrantLedgerEntries: (...args) => mockGetGrantLedgerEntries(...args),
    normalizeGrantRecord: jest.fn((record) => {
        if (!record) return null;
        return {
            grantedAt: record.grantedAt || "",
            amount: record.amount ?? null,
            txHash: record.txHash || "",
            source: record.source || "",
            confirmed: record.confirmed !== false,
            active: record.active !== false,
            history: Array.isArray(record.history) ? record.history : [],
        };
    }),
    isGrantActive: jest.fn((record) => Boolean(record?.active !== false && record?.confirmed !== false && record?.grantedAt)),
}));

describe("Contracts_MetaMask legacy quiz settlement", () => {
    const { publicClient } = require("./contractClients");

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockGetRewardPayoutEntries.mockReturnValue([]);
        mockGetGrantLedgerEntries.mockReturnValue([]);
        mockWaitForTransactionReceipt.mockResolvedValue({ status: "success" });
        mockAllowance.mockResolvedValue(0n);
        mockWriteContract.mockResolvedValue("0xwrite");
        mockEstimateContractGas.mockResolvedValue(21000n);
        mockEstimateFeesPerGas.mockResolvedValue({
            maxFeePerGas: 100n,
            maxPriorityFeePerGas: 10n,
        });
    });

    test("settle_quiz_rewards_manually sends payout to the original quiz contract address", async () => {
        const contract = new Contracts_MetaMask();
        const legacyQuizAddress = "0x55B3977C7B7b913eaf175A7364c8375732d22241";

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract._payment_of_reward_manual = jest.fn().mockResolvedValue("0x1234");
        contract._investment_to_quiz = jest.fn().mockResolvedValue("");
        contract.approve = jest.fn().mockResolvedValue("");
        contract._adding_reward = jest.fn().mockResolvedValue("");
        contract.waitForReceiptWithRetry = jest.fn().mockResolvedValue({ status: "success", transactionHash: "0x1234" });

        await contract.settle_quiz_rewards_manually(
            4,
            0,
            "1/6",
            ["0x1111111111111111111111111111111111111111"],
            [],
            "true",
            legacyQuizAddress
        );

        expect(contract._payment_of_reward_manual).toHaveBeenCalledWith(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            4,
            "1/6",
            ["0x1111111111111111111111111111111111111111"],
            [],
            true,
            legacyQuizAddress
        );
    });

    test("settle_quiz_rewards_auto_existing sends pending students to the original quiz contract in manual chunks", async () => {
        const contract = new Contracts_MetaMask();
        const legacyQuizAddress = "0x55B3977C7B7b913eaf175A7364c8375732d22241";
        const students = Array.from({ length: 16 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract.buildAutoRewardChunks = jest.fn().mockResolvedValue([
            { correctStudents: students.slice(0, 10), incorrectStudents: students.slice(10, 15) },
            { correctStudents: students.slice(15), incorrectStudents: [] },
        ]);
        contract._payment_of_reward_manual = jest.fn()
            .mockResolvedValueOnce("0xhash1")
            .mockResolvedValueOnce("0xhash2");
        contract.waitForReceiptWithRetry = jest.fn()
            .mockResolvedValueOnce({ status: "success", transactionHash: "0xhash1" })
            .mockResolvedValueOnce({ status: "success", transactionHash: "0xhash2" });
        contract.invalidateQuizSimpleCache = jest.fn();

        const result = await contract.settle_quiz_rewards_auto_existing(
            7,
            "1/6",
            students,
            legacyQuizAddress
        );

        expect(contract._payment_of_reward_manual).toHaveBeenNthCalledWith(
            1,
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            7,
            "1/6",
            students.slice(0, 10),
            students.slice(10, 15),
            false,
            legacyQuizAddress
        );
        expect(contract._payment_of_reward_manual).toHaveBeenNthCalledWith(
            2,
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            7,
            "1/6",
            students.slice(15),
            [],
            true,
            legacyQuizAddress
        );
        expect(result.payoutHashes).toEqual(["0xhash1", "0xhash2"]);
    });

    test("buildManualRewardChunks keeps payout chunks at 15 recipients or fewer before fee-based splitting", async () => {
        const contract = new Contracts_MetaMask();
        const students = Array.from({ length: 16 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);

        mockEstimateContractGas.mockResolvedValue(200000n);
        mockEstimateFeesPerGas.mockResolvedValue({
            maxFeePerGas: 10_000_000_000n,
            maxPriorityFeePerGas: 1_000_000_000n,
        });

        const chunks = await contract.buildManualRewardChunks(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            7,
            "1/6",
            students,
            [],
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );

        expect(chunks).toEqual([
            { correctStudents: students.slice(0, 15), incorrectStudents: [] },
            { correctStudents: students.slice(15), incorrectStudents: [] },
        ]);
    });

    test("settle_quiz_rewards_auto_existing stops when quiz payout is already finalized", async () => {
        const contract = new Contracts_MetaMask();
        const students = ["0x0000000000000000000000000000000000000001"];

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract._payment_of_reward_manual = jest.fn();
        contract.get_is_payment = jest.fn().mockResolvedValue(true);

        await expect(
            contract.settle_quiz_rewards_auto_existing(7, "1/6", students, "0xeb196c161EFA30939f78170694bb908E17fd1479")
        ).rejects.toThrow("quiz_reward_already_finalized");

        expect(contract._payment_of_reward_manual).not.toHaveBeenCalled();
    });

    test("settle_quiz_rewards_manually stops when quiz payout is already finalized", async () => {
        const contract = new Contracts_MetaMask();

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract.get_is_payment = jest.fn().mockResolvedValue(true);
        contract._payment_of_reward_manual = jest.fn();

        await expect(
            contract.settle_quiz_rewards_manually(
                4,
                0,
                "1/6",
                ["0x1111111111111111111111111111111111111111"],
                [],
                "true",
                "0x55B3977C7B7b913eaf175A7364c8375732d22241"
            )
        ).rejects.toThrow("quiz_reward_already_finalized");

        expect(contract._payment_of_reward_manual).not.toHaveBeenCalled();
    });

    test("buildAutoRewardChunks classifies students then reuses manual chunk builder", async () => {
        const contract = new Contracts_MetaMask();
        const students = [
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000002",
        ];
        contract.get_student_answer_detail = jest.fn()
            .mockResolvedValueOnce({ answerText: "1/6" })
            .mockResolvedValueOnce({ answerText: "1/3" });
        contract.buildManualRewardChunks = jest.fn().mockResolvedValue([
            { correctStudents: [students[0]], incorrectStudents: [students[1]] },
        ]);

        const chunks = await contract.buildAutoRewardChunks(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            7,
            "1/6",
            students,
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );

        expect(contract.buildManualRewardChunks).toHaveBeenCalledWith(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            7,
            "1/6",
            [students[0]],
            [students[1]],
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );
        expect(chunks).toEqual([{ correctStudents: [students[0]], incorrectStudents: [students[1]] }]);
    });

    test("investment_to_quiz auto payout uses manual chunk settlement instead of per-student direct transfers", async () => {
        const contract = new Contracts_MetaMask();
        const legacyQuizAddress = "0x55B3977C7B7b913eaf175A7364c8375732d22241";
        const students = Array.from({ length: 16 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract.readTokenAllowance = jest.fn().mockResolvedValue(1000n * 10n ** 18n);
        contract.get_is_payment = jest.fn().mockResolvedValue(false);
        contract.buildAutoRewardChunks = jest.fn().mockResolvedValue([
            { correctStudents: students.slice(0, 15), incorrectStudents: [] },
            { correctStudents: students.slice(15), incorrectStudents: [] },
        ]);
        contract._payment_of_reward_manual = jest.fn()
            .mockResolvedValueOnce("0xhash1")
            .mockResolvedValueOnce("0xhash2");
        contract.waitForReceiptWithRetry = jest.fn()
            .mockResolvedValueOnce({ status: "success", transactionHash: "0xhash1" })
            .mockResolvedValueOnce({ status: "success", transactionHash: "0xhash2" });
        contract._investment_to_quiz = jest.fn();
        contract._payment_of_reward = jest.fn();

        const result = await contract.investment_to_quiz(
            4,
            "0",
            "1/6",
            "false",
            16,
            "true",
            students,
            legacyQuizAddress
        );

        expect(contract._payment_of_reward_manual).toHaveBeenNthCalledWith(
            1,
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            4,
            "1/6",
            students.slice(0, 15),
            [],
            false,
            legacyQuizAddress
        );
        expect(contract._payment_of_reward_manual).toHaveBeenNthCalledWith(
            2,
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            4,
            "1/6",
            students.slice(15),
            [],
            true,
            legacyQuizAddress
        );
        expect(contract._payment_of_reward).not.toHaveBeenCalled();
        expect(result.payoutHashes).toEqual(["0xhash1", "0xhash2"]);
    });

    test("buildAutoRewardChunks splits payout groups when estimated fee is too high", async () => {
        const contract = new Contracts_MetaMask();
        const students = [
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000002",
        ];

        contract.get_student_answer_detail = jest.fn()
            .mockResolvedValueOnce({ answerText: "1/6" })
            .mockResolvedValueOnce({ answerText: "1/6" });
        mockEstimateContractGas
            .mockResolvedValueOnce(2000000n)
            .mockResolvedValueOnce(200000n)
            .mockResolvedValueOnce(200000n);
        mockEstimateFeesPerGas.mockResolvedValue({
            maxFeePerGas: 30_000_000_000n,
            maxPriorityFeePerGas: 1_000_000_000n,
        });

        const chunks = await contract.buildAutoRewardChunks(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            3,
            "1/6",
            students,
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );

        expect(chunks).toEqual([
            { correctStudents: [students[0]], incorrectStudents: [] },
            { correctStudents: [students[1]], incorrectStudents: [] },
        ]);
    });

    test("buildManualRewardChunks splits payout groups when estimated fee is too high", async () => {
        const contract = new Contracts_MetaMask();
        const correctStudents = [
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000002",
        ];

        mockEstimateContractGas
            .mockResolvedValueOnce(2000000n)
            .mockResolvedValueOnce(200000n)
            .mockResolvedValueOnce(200000n);
        mockEstimateFeesPerGas.mockResolvedValue({
            maxFeePerGas: 30_000_000_000n,
            maxPriorityFeePerGas: 1_000_000_000n,
        });

        const chunks = await contract.buildManualRewardChunks(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            3,
            "1/6",
            correctStudents,
            [],
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );

        expect(chunks).toEqual([
            { correctStudents: [correctStudents[0]], incorrectStudents: [] },
            { correctStudents: [correctStudents[1]], incorrectStudents: [] },
        ]);
    });

    test("settle_quiz_rewards_manually does not add extra investment tx when additional reward is zero", async () => {
        const contract = new Contracts_MetaMask();
        const legacyQuizAddress = "0x55B3977C7B7b913eaf175A7364c8375732d22241";

        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract.readTokenAllowance = jest.fn().mockResolvedValue(0n);
        contract._investment_to_quiz = jest.fn();
        contract._payment_of_reward_manual = jest.fn().mockResolvedValue("0xpayout");
        contract.waitForReceiptWithRetry = jest.fn().mockResolvedValue({ status: "success", transactionHash: "0xpayout" });

        await contract.settle_quiz_rewards_manually(
            4,
            "0",
            "1/6",
            ["0x1111111111111111111111111111111111111111"],
            [],
            "true",
            legacyQuizAddress
        );

        expect(contract._investment_to_quiz).not.toHaveBeenCalled();
        expect(contract._payment_of_reward_manual).toHaveBeenCalled();
    });

    test("ensure_wallet_connected reuses existing accounts before requesting access again", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xabc"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);
        contract.request_wallet_access = jest.fn();

        const accounts = await contract.ensure_wallet_connected();

        expect(provider.request).toHaveBeenCalledWith({ method: "eth_accounts" });
        expect(contract.request_wallet_access).not.toHaveBeenCalled();
        expect(accounts).toEqual(["0xabc"]);
    });

    test("request_wallet_access caches the connected account immediately", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xdef"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);

        const accounts = await contract.request_wallet_access();

        expect(accounts).toEqual(["0xdef"]);
        await expect(contract.get_address()).resolves.toBe("0xdef");
    });

    test("ensure_wallet_connected reuses cached account without extra provider requests", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xaaa"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);
        await contract.request_wallet_access();

        provider.request.mockClear();
        const accounts = await contract.ensure_wallet_connected();

        expect(accounts).toEqual(["0xaaa"]);
        expect(provider.request).not.toHaveBeenCalled();
    });

    test("create_answer uses the account returned by ensure_wallet_connected", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.get_read_account_cached = jest.fn().mockResolvedValue("");
        contract.ensure_wallet_connected = jest.fn().mockResolvedValue(["0x999"]);
        contract._save_answer = jest.fn().mockResolvedValue("0xhash");
        contract.waitForReceiptWithRetry = jest.fn().mockResolvedValue({ status: "success", transactionHash: "0xhash" });
        contract.invalidateQuizSimpleCache = jest.fn();

        const setShow = jest.fn();
        const setContent = jest.fn();

        await contract.create_answer(2, "A", setShow, setContent, "");

        expect(contract._save_answer).toHaveBeenCalledWith("0x999", 2, "A", "");
        expect(contract.waitForReceiptWithRetry).toHaveBeenCalledWith("0xhash");
    });

    test("edit_quiz uses the connected write account and amoy preflight", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0x777");
        contract._edit_quiz = jest.fn().mockResolvedValue("0xedit");

        mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: "success" });

        const receipt = await contract.edit_quiz(1, "0xowner", "t", "e", "u", "c", "2026-05-20T10:00", "2026-05-20T11:00", jest.fn(), "");

        expect(contract.ensure_amoy_network).toHaveBeenCalled();
        expect(contract._edit_quiz).toHaveBeenCalledWith(
            "0x777",
            1,
            "0xowner",
            "t",
            "e",
            "u",
            "c",
            "2026-05-20T10:00",
            "2026-05-20T11:00",
            ""
        );
        expect(receipt).toEqual({ status: "success" });
    });

    test("add_quiz_reward_delta reads allowance via public read helper", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0x777");
        contract.readTokenAllowance = jest.fn().mockResolvedValue(0n);
        contract.approve = jest.fn().mockResolvedValue("0xapprove");
        contract._investment_to_quiz = jest.fn().mockResolvedValue("0xinvest");

        mockWaitForTransactionReceipt
            .mockResolvedValueOnce({ status: "success" })
            .mockResolvedValueOnce({ status: "success" });

        await contract.add_quiz_reward_delta(2, "10", 5, jest.fn(), "");

        expect(contract.readTokenAllowance).toHaveBeenCalledWith(
            "0x777",
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );
        expect(contract.approve).toHaveBeenCalled();
        expect(contract._investment_to_quiz).toHaveBeenCalled();
    });

    test("providerRequestWithRetry retries provider limit errors", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn()
                .mockRejectedValueOnce(new Error("Request exceeds defined limit."))
                .mockResolvedValueOnce(["0xabc"]),
        };

        const result = await contract.providerRequestWithRetry(provider, { method: "eth_accounts" }, 2, 1);

        expect(result).toEqual(["0xabc"]);
        expect(provider.request).toHaveBeenCalledTimes(2);
    });

    test("writeContractDirect retries provider limit errors from wallet writes", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensureWalletWriteReady = jest.fn().mockResolvedValue("0xabc");
        mockWriteContract
            .mockRejectedValueOnce(new Error("Request exceeds defined limit."))
            .mockResolvedValueOnce("0xretry");

        const hash = await contract.writeContractDirect({
            account: "0xabc",
            address: "0xdef",
            abi: [],
            functionName: "save_answer",
            args: [1, "A"],
        });

        expect(hash).toBe("0xretry");
        expect(mockWriteContract).toHaveBeenCalledTimes(2);
    });

    test("writeContractDirect keeps manual gas override as a minimum floor", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensureWalletWriteReady = jest.fn().mockResolvedValue("0xabc");
        mockWriteContract.mockResolvedValueOnce("0xgas");

        await contract.writeContractDirect({
            account: "0xabc",
            address: "0xdef",
            abi: [],
            functionName: "payment_of_reward",
            args: [1, "1/6", ["0x1"]],
            gasOverride: 500000n,
        });

        expect(mockEstimateContractGas).toHaveBeenCalled();
        expect(mockWriteContract).toHaveBeenCalledWith(expect.objectContaining({ gas: 500000n }));
    });

    test("writeContractDirect increases payout gas when estimate is higher than the manual floor", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensureWalletWriteReady = jest.fn().mockResolvedValue("0xabc");
        mockEstimateContractGas.mockResolvedValueOnce(600000n);
        mockWriteContract.mockResolvedValueOnce("0xgas2");

        await contract.writeContractDirect({
            account: "0xabc",
            address: "0xdef",
            abi: [],
            functionName: "payment_of_reward_manual",
            args: [1, "1/6", ["0x1"], [], true],
            gasOverride: 500000n,
        });

        expect(mockWriteContract).toHaveBeenCalledWith(expect.objectContaining({ gas: 960000n }));
    });

    test("ensureWalletWriteReady explicitly requests accounts on mobile", async () => {
        const contract = new Contracts_MetaMask();
        const provider = { request: jest.fn().mockResolvedValue(["0xmobile"]) };
        contract.isMobileDevice = jest.fn().mockReturnValue(true);
        contract.providerRequestWithRetry = jest.fn().mockResolvedValue(["0xmobile"]);

        const account = await contract.ensureWalletWriteReady(provider, "");

        expect(contract.providerRequestWithRetry).toHaveBeenCalledWith(
            provider,
            { method: "eth_requestAccounts" },
            2,
            700
        );
        expect(account).toBe("0xmobile");
    });

    test("get_quiz_simple throws instead of returning empty placeholder when read fails without cache", async () => {
        const contract = new Contracts_MetaMask();
        contract.get_read_account_cached = jest.fn().mockResolvedValue("");
        jest.spyOn(publicClient, "readContract").mockRejectedValueOnce(new Error("rpc_failed"));

        await expect(contract.get_quiz_simple(1, "0xeb196c161EFA30939f78170694bb908E17fd1479"))
            .rejects
            .toThrow("rpc_failed");
    });

    test("getQuizInventory falls back to persisted cache when live length reads collapse to zero", async () => {
        const contract = new Contracts_MetaMask();
        contract.invalidateQuizInventoryCache();
        window.localStorage.setItem("web3_quiz_inventory_cache_v1", JSON.stringify({
            fetchedAt: Date.now() - 120000,
            value: [
                { id: 2, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
                { id: 1, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
            ],
        }));
        contract.get_quiz_lenght = jest.fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0);

        const inventory = await contract.getQuizInventory(true);

        expect(inventory).toEqual([
            { id: 2, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
            { id: 1, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
        ]);
    });

    test("get_quiz_lenght falls back to cached inventory length when live aggregate reads fail", async () => {
        const contract = new Contracts_MetaMask();
        contract.invalidateQuizInventoryCache();
        window.localStorage.setItem("web3_quiz_inventory_cache_v1", JSON.stringify({
            fetchedAt: Date.now() - 120000,
            value: [
                { id: 2, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
                { id: 1, address: "0xeb196c161EFA30939f78170694bb908E17fd1479" },
                { id: 0, address: "0x55B3977C7B7b913eaf175A7364c8375732d22241" },
            ],
        }));
        jest.spyOn(publicClient, "readContract").mockRejectedValue(new Error("rpc_failed"));

        const length = await contract.get_quiz_lenght();

        expect(length).toBe(3);
    });

    test("get_quiz_reward_tft includes confirmed reward payout ledger entries", async () => {
        const contract = new Contracts_MetaMask();
        contract.get_user_history_len = jest.fn().mockResolvedValue(0);
        contract.getQuizInventory = jest.fn().mockResolvedValue([
            { id: 2, address: "0x55B3977C7B7b913eaf175A7364c8375732d22241" },
        ]);
        contract.get_student_answer_detail = jest.fn()
            .mockResolvedValueOnce({ reward: 0n });
        mockGetRewardPayoutEntries.mockReturnValue([
            {
                quizId: 2,
                sourceAddress: "0x55b3977c7b7b913eaf175a7364c8375732d22241",
                studentAddress: "0xabc",
                rewardTft: 30,
                resultState: "correct",
                confirmed: true,
                txHash: "0xhash",
            },
        ]);

        const score = await contract.get_quiz_reward_tft("0xabc");

        expect(score).toBe(30);
    });

    test("get_quiz_reward_tft keeps token history total when it exceeds partial on-chain and ledger data", async () => {
        const contract = new Contracts_MetaMask();
        contract.get_user_history_len = jest.fn().mockResolvedValue(3);
        contract.getQuizInventory = jest.fn().mockResolvedValue([
            { id: 2, address: "0x55B3977C7B7b913eaf175A7364c8375732d22241" },
        ]);
        contract.get_student_answer_detail = jest.fn().mockResolvedValueOnce({ reward: 15000000000000000000n });
        contract.get_token_history = jest.fn().mockResolvedValue([
            ["", "", "", "", 15000000000000000000n, "correct answer"],
            ["", "", "", "", 30000000000000000000n, "correct answer"],
            ["", "", "", "", 1000000000000000000n, "other"],
        ]);
        mockGetRewardPayoutEntries.mockReturnValue([]);

        const score = await contract.get_quiz_reward_tft("0xabc");

        expect(score).toBe(45);
    });

    test("get_quiz_reward_tft excludes manual TFT grants from score calculation", async () => {
        const contract = new Contracts_MetaMask();
        contract.get_user_history_len = jest.fn().mockResolvedValue(0);
        contract.getQuizInventory = jest.fn().mockResolvedValue([]);
        mockGetRewardPayoutEntries.mockReturnValue([]);
        mockGetGrantLedgerEntries.mockReturnValue([
            {
                address: "0xabc",
                status: {
                    answer_thanks_tft: {
                        grantedAt: "2026-05-29T00:00:00.000Z",
                        amount: 50,
                        txHash: "0xmanual",
                        source: "single",
                        confirmed: true,
                        active: true,
                    },
                },
            },
        ]);

        const score = await contract.get_quiz_reward_tft("0xabc");

        expect(score).toBe(0);
    });

    test("get_quiz_reward_tft returns the fixed displayed baseline for listed addresses", async () => {
        const contract = new Contracts_MetaMask();
        const address = "0x5a9e3C52085F8D4427186E95aB2F05480569455A";
        contract.get_user_history_len = jest.fn().mockResolvedValue(2);
        contract.get_token_history = jest.fn().mockResolvedValue([
            { epoch_time: 1717900000, _value: 600000000000000000000n, _explanation: "correct answer" },
            { epoch_time: 1781020800, _value: 15000000000000000000n, _explanation: "correct answer" },
        ]);
        mockGetRewardPayoutEntries.mockReturnValue([
            {
                quizId: 99,
                sourceAddress: "0xeb196c161efa30939f78170694bb908e17fd1479",
                studentAddress: address,
                rewardTft: 15,
                resultState: "correct",
                confirmed: true,
                txHash: "0xfuture",
                paidAt: "2026-06-10T12:00:00.000Z",
            },
        ]);

        const score = await contract.get_quiz_reward_tft(address);

        expect(score).toBe(750);
    });

    test("get_quiz_reward_tft keeps zero baseline addresses at zero without adding history", async () => {
        const contract = new Contracts_MetaMask();
        const address = "0xf5bA28e82F86100f3fe1f6C7a1C7A4639b7Ac544";
        contract.get_user_history_len = jest.fn().mockResolvedValue(2);
        contract.get_token_history = jest.fn().mockResolvedValue([
            { epoch_time: 1717900000, _value: 300000000000000000000n, _explanation: "correct answer" },
            { epoch_time: 1781020800, _value: 15000000000000000000n, _explanation: "correct answer" },
        ]);
        mockGetRewardPayoutEntries.mockReturnValue([]);

        const score = await contract.get_quiz_reward_tft(address);

        expect(score).toBe(0);
    });

});
