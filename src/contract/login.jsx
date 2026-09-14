import { useEffect, useMemo, useState } from "react";
import { ReactComponent as MetaMaskLogo } from "./images/metamask-icon.svg";
import { Contracts_MetaMask } from "./contracts";
import { ACTION_TYPES, appendActivityLog, logPageView, setActor } from "../utils/activityLog";
import { useTokenSymbol } from "../utils/tokenMeta";
import "./login.css";

function Login() {
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState("");
    const [rewardMessage, setRewardMessage] = useState("");
    const contract = useMemo(() => new Contracts_MetaMask(), []);
    const tokenSymbol = useTokenSymbol(contract);

    useEffect(() => {
        logPageView("login", { action: ACTION_TYPES.LOGIN_PAGE_VIEWED });
        appendActivityLog(ACTION_TYPES.LOGIN_PAGE_VIEWED, { page: "login" });
    }, []);

    const connectMetaMaskHandler = async () => {
        const startedAt = performance.now();
        setConnecting(true);
        setError("");
        setRewardMessage("");
        appendActivityLog(ACTION_TYPES.LOGIN_ATTEMPT, {
            page: "login",
            wallet: "MetaMask",
            hasEthereumProvider: Boolean(contract.getEthereumProvider()),
            clickTarget: "metamask_button",
        });

        const provider = await contract.getEthereumProviderReady();
        if (!provider) {
            setError("ウォレットが見つかりません。Chrome / Brave の MetaMask または Brave Wallet を有効化し、ページを再読み込みしてください。");
            appendActivityLog(ACTION_TYPES.WALLET_PROVIDER_MISSING, {
                page: "login",
                wallet: "MetaMask",
            });
            appendActivityLog(ACTION_TYPES.LOGIN_FAILURE, {
                page: "login",
                wallet: "MetaMask",
                reason: "provider_missing",
            });
            setConnecting(false);
            return;
        }

        try {
            const accounts = await provider.request({ method: "eth_requestAccounts" });
            const address = accounts?.[0] || "";
            setActor(address || "guest_wallet");

            await contract.ensure_amoy_network();
            await contract.add_token_wallet();
            await contract.add_ttt_token_wallet().catch(() => false);
            const tttBalance = await contract.get_ttt_balance(address);
            setRewardMessage(`現在の TTT 残高: ${tttBalance} TTT`);

            appendActivityLog(ACTION_TYPES.LOGIN_SUCCESS, {
                page: "login",
                wallet: "MetaMask",
                address,
                tokenLinked: true,
                durationMs: Math.round(performance.now() - startedAt),
            });
        } catch (err) {
            console.error(err);
            setError("接続に失敗しました。ウォレット承認やネットワーク設定を確認してください。");
            appendActivityLog(ACTION_TYPES.LOGIN_FAILURE, {
                page: "login",
                wallet: "MetaMask",
                reason: err?.message || "unknown_error",
                durationMs: Math.round(performance.now() - startedAt),
                errorCode: err?.code || "",
            });
        }

        setConnecting(false);
    };

    return (
        <div className="login-page">
            <div className="login-bg-orb login-bg-orb--1"></div>
            <div className="login-bg-orb login-bg-orb--2"></div>
            <div className="login-bg-orb login-bg-orb--3"></div>

            <div className="login-container animate-slideUp">
                <div className="login-card glass-card">
                    <div className="login-header">
                        <h1 className="login-title">
                            <span className="login-title-icon">認証</span>
                            Web3 Quiz
                        </h1>
                        <p className="login-subtitle">
                            MetaMask / Brave Wallet を接続すると Avalanche Fuji C-Chain と独自トークンを自動で連携します。
                        </p>
                    </div>

                    <div className="login-wallets">
                        <button
                            className={`wallet-option ${connecting ? "wallet-option--connecting" : ""}`}
                            onClick={connectMetaMaskHandler}
                            disabled={connecting}
                        >
                            <div className="wallet-option-left">
                                <div className="wallet-icon-wrapper">
                                    <MetaMaskLogo className="wallet-icon" />
                                </div>
                                <div className="wallet-info">
                                    <span className="wallet-name">ウォレット接続</span>
                                    <span className="wallet-desc">MetaMask / Brave Wallet</span>
                                </div>
                            </div>
                            <div className="wallet-option-right">
                                {connecting ? <div className="connecting-spinner animate-spin"></div> : <span className="wallet-badge">Popular</span>}
                            </div>
                        </button>
                    </div>

                    {error && <div className="login-error animate-slideUp">{error}</div>}
                    {rewardMessage && <div className="login-error animate-slideUp" style={{ borderColor: "rgba(56, 189, 248, 0.5)", color: "#bfe9ff" }}>{rewardMessage}</div>}

                    <div className="login-footer">
                        <p className="login-footer-text">接続後に Avalanche Fuji ネットワーク切替と {tokenSymbol} / TTT の追加を自動で実行し、現在の TTT 残高を確認できます。</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
