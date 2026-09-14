/**
 * Contract Clients - Shared viem client initialization
 *
 * viemのclient初期化とコントラクトインスタンスの共通設定を一元管理。
 * 各モジュールからimportして利用する。
 */
import { createPublicClient, createWalletClient, http, getContract, custom, fallback } from "viem";
import token_contract from "./token_abi.json";
import quiz_contract from "./quiz_abi.json";
import { class_room_address, quiz_address, legacy_quiz_addresses, token_address, ttt_token_address, bootstrap_teacher_addresses, rpc_urls } from "./config";
import { amoy } from "./network";

/* eslint-disable no-restricted-globals */

const WALLET_PROVIDER_CHANGED_EVENT = "wallet-provider-changed";
let ethereum = null;
let walletClient = null;
let tokenContract = null;
let tttTokenContract = null;
let quizContract = null;
const eip6963Providers = [];

/* ── Public Client (RPC) ── */
const rpcTransports = (rpc_urls || [])
    .filter(Boolean)
    .map((url) =>
        http(url, {
            batch: false,
            retryCount: 0,
            retryDelay: 120,
            timeout: 2500,
        })
    );

const publicClient = createPublicClient({
    chain: amoy,
    transport: rpcTransports.length > 1 ? fallback(rpcTransports) : rpcTransports[0],
});

/* ── ABI ── */
const token_abi = token_contract.abi;
const quiz_abi = quiz_contract.abi;

function rememberEip6963Provider(detail) {
    const provider = detail?.provider;
    if (!provider) return;
    if (!eip6963Providers.some((entry) => entry.provider === provider)) {
        eip6963Providers.push({
            provider,
            info: detail?.info || {},
        });
    }
}

function getProviderScore(provider, info = {}) {
    const rdns = String(info?.rdns || "").toLowerCase();
    const name = String(info?.name || "").toLowerCase();
    if (rdns.includes("io.metamask") || name.includes("metamask")) return 100;
    if (provider?.isMetaMask && !provider?.isBraveWallet) return 90;
    if (provider?.isMetaMask) return 80;
    if (provider?.isBraveWallet) return 60;
    return 10;
}

function pickBestProvider(candidates) {
    return candidates
        .filter((entry) => entry?.provider)
        .sort((a, b) => getProviderScore(b.provider, b.info) - getProviderScore(a.provider, a.info))[0]?.provider || null;
}

function detectEthereumProvider() {
    if (typeof window === "undefined") return null;

    const eip6963Provider = pickBestProvider(eip6963Providers);
    if (eip6963Provider) return eip6963Provider;

    const braveFallback = window.braveEthereum || window.braveWalletProvider || null;
    const injected = window.ethereum || braveFallback || null;
    if (!injected) return null;

    if (Array.isArray(injected.providers) && injected.providers.length > 0) {
        return pickBestProvider(injected.providers.map((provider) => ({ provider }))) || injected;
    }

    return injected || braveFallback;
}

function syncInjectedClients() {
    ethereum = detectEthereumProvider();
    walletClient = ethereum
        ? createWalletClient({
              chain: amoy,
              transport: custom(ethereum),
          })
        : null;

    const clientConfig = walletClient
        ? { walletClient, publicClient }
        : { publicClient };

    tokenContract = getContract({
        address: token_address,
        abi: token_abi,
        ...clientConfig,
    });

    tttTokenContract = getContract({
        address: ttt_token_address,
        abi: token_abi,
        ...clientConfig,
    });

    quizContract = getContract({
        address: quiz_address,
        abi: quiz_abi,
        ...clientConfig,
    });

    return ethereum;
}

function getEthereumProvider() {
    return syncInjectedClients();
}

function requestEip6963Providers() {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new Event("eip6963:requestProvider"));
    } catch (error) {
        console.log("Failed to request EIP-6963 providers", error);
    }
}

async function waitForEthereumProvider(timeoutMs = 5000) {
    const currentProvider = syncInjectedClients();
    if (currentProvider) return currentProvider;
    if (typeof window === "undefined") return null;

    requestEip6963Providers();

    return await new Promise((resolve) => {
        let done = false;
        let pollTimer = null;
        const finish = (provider) => {
            if (done) return;
            done = true;
            window.removeEventListener("ethereum#initialized", handleEthereumInitialized);
            window.removeEventListener("eip6963:announceProvider", handleEip6963Provider);
            window.removeEventListener("DOMContentLoaded", handleEthereumInitialized);
            window.removeEventListener("load", handleEthereumInitialized);
            window.clearTimeout(timer);
            if (pollTimer) {
                window.clearInterval(pollTimer);
            }
            resolve(provider || syncInjectedClients());
        };

        const handleEthereumInitialized = () => {
            finish(syncInjectedClients());
        };

        const handleEip6963Provider = (event) => {
            rememberEip6963Provider(event?.detail);
            finish(syncInjectedClients());
        };

        const timer = window.setTimeout(() => {
            finish(syncInjectedClients());
        }, timeoutMs);

        pollTimer = window.setInterval(() => {
            const detectedProvider = syncInjectedClients();
            if (detectedProvider) {
                finish(detectedProvider);
            }
        }, 250);

        window.addEventListener("ethereum#initialized", handleEthereumInitialized, { once: true });
        window.addEventListener("eip6963:announceProvider", handleEip6963Provider);
        window.addEventListener("DOMContentLoaded", handleEthereumInitialized, { once: true });
        window.addEventListener("load", handleEthereumInitialized, { once: true });
    });
}

function bindWalletProviderEvents() {
    if (typeof window === "undefined" || window.__web3QuizWalletEventsBound) return;

    const provider = syncInjectedClients();
    if (!provider) return;

    const notifyWalletProviderChanged = (detail) => {
        syncInjectedClients();
        window.dispatchEvent(new CustomEvent(WALLET_PROVIDER_CHANGED_EVENT, { detail }));
    };

    provider.on?.("chainChanged", (chainIdHex) => {
        notifyWalletProviderChanged({ type: "chainChanged", chainIdHex });
    });

    provider.on?.("accountsChanged", (accounts) => {
        notifyWalletProviderChanged({ type: "accountsChanged", accounts });
    });

    window.__web3QuizWalletEventsBound = true;
}

syncInjectedClients();

if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", (event) => {
        rememberEip6963Provider(event?.detail);
        syncInjectedClients();
        bindWalletProviderEvents();
        window.dispatchEvent(new CustomEvent(WALLET_PROVIDER_CHANGED_EVENT, { detail: { type: "providerAnnounced" } }));
    });
    requestEip6963Providers();
    bindWalletProviderEvents();
    window.addEventListener("ethereum#initialized", bindWalletProviderEvents, { once: false });
    window.addEventListener("load", bindWalletProviderEvents, { once: true });
}

/* ── Utility Functions ── */

/** 配列を指定サイズで分割 */
const sliceByNumber = (array, number) => {
    const length = Math.ceil(array.length / number);
    return new Array(length)
        .fill()
        .map((_, i) => array.slice(i * number, (i + 1) * number));
};

/** 全角数字→半角数字 変換 */
const convertFullWidthNumbersToHalf = (() => {
    const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
    return (text) =>
        text.replace(/[０-９]/g, (m) =>
            String.fromCharCode(m.charCodeAt(0) - diff)
        );
})();

/** MetaMaskのアドレスを取得 */
async function getAddress() {
    try {
        syncInjectedClients();
        if (ethereum && walletClient) {
            return (await walletClient.requestAddresses())[0];
        } else {
            console.log("Ethereum object does not exist");
        }
    } catch (err) {
        console.log(err);
    }
}

export {
    ethereum,
    walletClient,
    publicClient,
    token_abi,
    quiz_abi,
    token_address,
    ttt_token_address,
    bootstrap_teacher_addresses,
    class_room_address,
    quiz_address,
    legacy_quiz_addresses,
    tokenContract,
    tttTokenContract,
    quizContract,
    amoy,
    sliceByNumber,
    convertFullWidthNumbersToHalf,
    getAddress,
    getEthereumProvider,
    waitForEthereumProvider,
    WALLET_PROVIDER_CHANGED_EVENT,
};
