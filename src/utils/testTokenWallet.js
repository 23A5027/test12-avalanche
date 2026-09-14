const STORAGE_KEY = "web3_quiz_ttt_wallet_v1";
const DAILY_LOGIN_REWARD = 100;
const UPDATE_KEY = "web3_quiz_ttt_wallet_updated_v1";

function readState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
        console.error("Failed to read TTT wallet state", error);
        return {};
    }
}

function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(UPDATE_KEY, String(Date.now()));
    window.dispatchEvent(new Event("ttt-wallet-updated"));
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function ensureAccount(state, address) {
    if (!address) return state;
    if (!state[address]) {
        state[address] = {
            balance: 0,
            lastLoginRewardDate: "",
            history: [],
        };
    }
    return state;
}

function getTestTokenBalance(address) {
    const state = ensureAccount(readState(), address);
    return Number(state[address]?.balance || 0);
}

function claimLoginReward(address, amount = DAILY_LOGIN_REWARD) {
    const state = ensureAccount(readState(), address);
    if (!address) {
        return { granted: false, amount: 0, balance: 0 };
    }

    const todayKey = getTodayKey();
    const account = state[address];
    if (account.lastLoginRewardDate === todayKey) {
        return { granted: false, amount: 0, balance: account.balance };
    }

    account.balance += Number(amount);
    account.lastLoginRewardDate = todayKey;
    account.history.unshift({
        id: `reward_${Date.now()}`,
        type: "login_reward",
        amount: Number(amount),
        createdAt: new Date().toISOString(),
    });
    writeState(state);
    return { granted: true, amount: Number(amount), balance: account.balance };
}

function spendTestTokens(address, amount, message = "") {
    const state = ensureAccount(readState(), address);
    const account = state[address];
    const numericAmount = Number(amount);

    if (!address || numericAmount <= 0) {
        throw new Error("invalid_ttt_spend");
    }
    if (account.balance < numericAmount) {
        throw new Error("insufficient_ttt_balance");
    }

    account.balance -= numericAmount;
    account.history.unshift({
        id: `superchat_${Date.now()}`,
        type: "superchat",
        amount: numericAmount,
        message,
        createdAt: new Date().toISOString(),
    });
    writeState(state);
    return { balance: account.balance };
}

function subscribeToTestTokenWallet(callback) {
    const handleStorage = (event) => {
        if (event.key === UPDATE_KEY || event.key === STORAGE_KEY) {
            callback();
        }
    };
    const handleCustom = () => callback();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ttt-wallet-updated", handleCustom);
    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener("ttt-wallet-updated", handleCustom);
    };
}

export {
    DAILY_LOGIN_REWARD,
    claimLoginReward,
    getTestTokenBalance,
    spendTestTokens,
    subscribeToTestTokenWallet,
};
