import { useEffect, useState } from "react";
import { WALLET_PROVIDER_CHANGED_EVENT } from "../../contract/contractClients";
import "./../../contract/wait_Modal.css";

const NETWORK_LABEL = "Avalanche Fuji C-Chain";
const NETWORK_CONFIG = {
    chainId: "43113",
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    fallbackRpcUrls: [],
    symbol: "AVAX",
    explorer: "https://explorer-test.avax.network/c-chain/",
};

function normalizeChainId(chainId) {
    if (chainId == null || chainId === "") return null;
    if (typeof chainId === "string") {
        const trimmed = chainId.trim();
        if (!trimmed) return null;
        if (/^0x/i.test(trimmed)) {
            const parsedHex = Number.parseInt(trimmed, 16);
            return Number.isFinite(parsedHex) ? parsedHex : null;
        }
        const parsedNumber = Number(trimmed);
        return Number.isFinite(parsedNumber) ? parsedNumber : null;
    }
    const parsedNumber = Number(chainId);
    return Number.isFinite(parsedNumber) ? parsedNumber : null;
}

function Modal_change_network(props) {
    const [currentChainId, setCurrentChainId] = useState(() => normalizeChainId(props.chain_id));
    const [hasEthereumProvider, setHasEthereumProvider] = useState(Boolean(props.cont?.getEthereumProvider?.()));
    const [chainResolved, setChainResolved] = useState(() => normalizeChainId(props.chain_id) != null);
    const [autoAttempted, setAutoAttempted] = useState(false);
    const isVisible = hasEthereumProvider && chainResolved && currentChainId !== 43113;

    useEffect(() => {
        const normalizedChainId = normalizeChainId(props.chain_id);
        setCurrentChainId(normalizedChainId);
        if (normalizedChainId != null) {
            setChainResolved(true);
        }
    }, [props.chain_id]);

    useEffect(() => {
        const syncProviderState = async () => {
            const provider = await props.cont?.getEthereumProviderReady?.();
            setHasEthereumProvider(Boolean(provider || props.cont?.getEthereumProvider?.()));
        };

        syncProviderState();
        window.addEventListener("ethereum#initialized", syncProviderState);
        window.addEventListener("focus", syncProviderState);

        return () => {
            window.removeEventListener("ethereum#initialized", syncProviderState);
            window.removeEventListener("focus", syncProviderState);
        };
    }, [props.cont]);

    useEffect(() => {
        if (!hasEthereumProvider) return undefined;
        const provider = props.cont?.getEthereumProvider?.();
        if (!provider) return undefined;

        const syncChainId = async () => {
            const nextChainId = normalizeChainId(await props.cont?.get_chain_id?.());
            if (nextChainId != null) {
                setCurrentChainId(nextChainId);
                setChainResolved(true);
            }
        };

        const handleChainChanged = (chainIdHex) => {
            const normalizedChainId = normalizeChainId(chainIdHex);
            setCurrentChainId(normalizedChainId);
            setChainResolved(normalizedChainId != null);
        };

        const handleAccountsChanged = () => {
            syncChainId().catch((error) => {
                console.error("Failed to sync chain id", error);
            });
        };

        syncChainId().catch((error) => {
            console.error("Failed to sync chain id", error);
        });
        const shouldKeepPolling = currentChainId !== 43113 && !props.cont?.isMobileDevice?.();
        let timer = null;
        if (shouldKeepPolling) {
            timer = window.setInterval(() => {
                syncChainId().catch((error) => {
                    console.error("Failed to sync chain id", error);
                });
            }, 15000);
        }

        provider.on?.("chainChanged", handleChainChanged);
        provider.on?.("accountsChanged", handleAccountsChanged);

        return () => {
            if (timer) {
                window.clearInterval(timer);
            }
            provider.removeListener?.("chainChanged", handleChainChanged);
            provider.removeListener?.("accountsChanged", handleAccountsChanged);
        };
    }, [currentChainId, hasEthereumProvider, props.cont]);

    const copyNetworkField = async (label, value) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(String(value || ""));
                alert(`${label} をコピーしました。`);
                return;
            }
        } catch (error) {
            console.error(`Failed to copy ${label}`, error);
        }

        try {
            const input = document.createElement("textarea");
            input.value = String(value || "");
            input.setAttribute("readonly", "readonly");
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.focus();
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
            alert(`${label} をコピーしました。`);
        } catch (error) {
            console.error(`Failed to copy ${label}`, error);
            alert(`${label} のコピーに失敗しました。手動で入力してください。`);
        }
    };

    const handleSwitchNetwork = async () => {
        try {
            await props.cont.add_or_switch_amoy_network();
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            const accounts = await props.cont.ensure_wallet_connected();
            if (!Array.isArray(accounts) || accounts.length === 0) {
                throw new Error("wallet_not_connected_after_network_switch");
            }
            setCurrentChainId(await props.cont.get_chain_id());
            window.dispatchEvent(new CustomEvent(WALLET_PROVIDER_CHANGED_EVENT, {
                detail: {
                    type: "networkSwitchCompleted",
                    accounts,
                },
            }));
        } catch (error) {
            console.error("Failed to add or switch Avalanche Fuji", error);
            if (error?.message === "metamask_not_found" || error?.message === "ethereum_not_found") {
                alert("ウォレットが見つかりません。Chrome / Brave の MetaMask または Brave Wallet を有効化し、ページを再読み込みしてください。");
                setHasEthereumProvider(false);
                return;
            }
            if (error?.message === "wallet_not_connected_after_network_switch") {
                alert("Avalanche Fuji への切り替え後にウォレット接続の確認が取れませんでした。もう一度ボタンを押してください。");
                return;
            }
            if (error?.code === 4001) {
                alert("MetaMask 側で操作がキャンセルされました。画面下のボタンから再度実行してください。");
                return;
            }
            alert("Avalanche Fuji への追加または切り替えに失敗しました。MetaMask のポップアップを確認してください。");
        }
    };

    useEffect(() => {
        if (isVisible && hasEthereumProvider && !autoAttempted && props.cont) {
            setAutoAttempted(true);
            const timer = setTimeout(() => {
                handleSwitchNetwork();
            }, 1000); // モーダル表示から1秒後に自動でポップアップを起動
            return () => clearTimeout(timer);
        }
    }, [isVisible, hasEthereumProvider, autoAttempted, props.cont]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isVisible) {
        return <></>;
    }

    return (
        <div className="network-modal-overlay">
            <div
                className="network-modal-content animate-scaleIn"
                style={{
                    maxWidth: "960px",
                    width: "min(92vw, 960px)",
                    padding: 0,
                    overflowX: "hidden",
                    overflowY: "auto",
                    maxHeight: "calc(100dvh - 24px)",
                    background: "linear-gradient(180deg, #102842 0%, #1ba5c4 100%)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "28px",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
                }}
            >
                <div style={{ padding: "48px 40px 24px", color: "#fff", textAlign: "center" }}>
                    <div
                        className="network-modal-icon"
                        style={{
                            background: "rgba(255,255,255,0.14)",
                            color: "#fff",
                            width: "72px",
                            height: "72px",
                            margin: "0 auto 20px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                        }}
                    >
                        P
                    </div>
                    <h2 className="heading-lg" style={{ marginBottom: "16px", textAlign: "center", color: "#fff" }}>
                        まず Avalanche Fuji に接続してください
                    </h2>
                    <p style={{ margin: "0 auto", maxWidth: "680px", color: "rgba(255,255,255,0.88)", lineHeight: 1.8 }}>
                        このプラットフォームは Avalanche Fuji C-Chain を利用します。最初に MetaMask へネットワークを追加し、
                        そのまま Avalanche Fuji へ切り替えてください。
                    </p>
                </div>

                <div style={{ padding: "0 40px 40px" }}>
                    <div
                        style={{
                            display: "grid",
                            gap: "20px",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            marginBottom: "24px",
                        }}
                    >
                        <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "24px", padding: "24px", color: "#10263f" }}>
                            <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "12px" }}>1</div>
                            <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.5 }}>
                                ネットワークを
                                <br />
                                MetaMask に追加する
                            </div>
                            <div style={{ marginTop: "14px", fontSize: "15px", lineHeight: 1.8 }}>
                                下のボタンを押すと MetaMask が開きます。表示された確認画面で {NETWORK_LABEL} の追加を許可してください。
                            </div>
                        </div>

                        <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "24px", padding: "24px", color: "#10263f" }}>
                            <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "12px" }}>2</div>
                            <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.5 }}>
                                MetaMask で
                                <br />
                                ネットワークを切り替える
                            </div>
                            <div style={{ marginTop: "14px", fontSize: "15px", lineHeight: 1.8 }}>
                                続けて表示される画面で「ネットワークを切り替える」を押してください。完了後、この案内は自動で閉じます。
                            </div>
                        </div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "18px 20px", marginBottom: "20px", color: "#fff" }}>
                        <div style={{ fontWeight: 700, marginBottom: "10px" }}>登録するネットワーク情報</div>
                        <div style={{ display: "grid", gap: "8px", fontSize: "14px", color: "rgba(255,255,255,0.92)" }}>
                            <div>Network Name: {NETWORK_LABEL}</div>
                            <div>RPC URL: {NETWORK_CONFIG.rpcUrl}</div>
                            {NETWORK_CONFIG.fallbackRpcUrls.map((rpcUrl, index) => (
                                <div key={rpcUrl}>予備 RPC {index + 1}: {rpcUrl}</div>
                            ))}
                            <div>Chain ID: {NETWORK_CONFIG.chainId}</div>
                            <div>Currency Symbol: {NETWORK_CONFIG.symbol}</div>
                            <div>Block Explorer URL: {NETWORK_CONFIG.explorer}</div>
                            <div>POL は Avalanche Fuji 上で回答送信に使う手数料用のトークンです。</div>
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                            <button type="button" className="btn-secondary-custom" onClick={() => copyNetworkField("RPC URL", NETWORK_CONFIG.rpcUrl)}>
                                RPC URL をコピー
                            </button>
                            {NETWORK_CONFIG.fallbackRpcUrls.map((rpcUrl, index) => (
                                <button key={rpcUrl} type="button" className="btn-secondary-custom" onClick={() => copyNetworkField(`予備RPC ${index + 1}`, rpcUrl)}>
                                    予備RPC {index + 1} をコピー
                                </button>
                            ))}
                            <button type="button" className="btn-secondary-custom" onClick={() => copyNetworkField("Chain ID", NETWORK_CONFIG.chainId)}>
                                Chain ID をコピー
                            </button>
                        </div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "18px 20px", marginBottom: "20px", color: "#fff" }}>
                        <div style={{ fontWeight: 700, marginBottom: "10px" }}>Edge / Brave でまだ接続できない場合</div>
                        <div style={{ display: "grid", gap: "8px", fontSize: "14px", lineHeight: 1.8, color: "rgba(255,255,255,0.92)" }}>
                            <div>1. MetaMask を開き、既存の Avalanche Fuji がある場合は RPC URL を `{NETWORK_CONFIG.rpcUrl}` に修正してください。</div>
                            <div>2. `RPCを更新` が失敗する場合は、予備 RPC を順番に試してください。</div>
                            <div>3. 大学内 Wi-Fi で失敗する場合は、最初のネットワーク追加だけスマホ回線や自宅回線で行い、その後に学内 Wi-Fi へ戻してください。</div>
                            <div>4. 既存の Avalanche Fuji を削除してから、この画面のボタンで再追加すると改善する場合があります。</div>
                            <div>5. Edge / Brave では MetaMask 拡張を有効化した状態で、このページを強制再読み込みしてから再実行してください。</div>
                            <div>6. 学内の混雑時間帯は RPC 応答が遅くなるため、最初の設定だけ講義前に済ませると安定しやすいです。</div>
                        </div>
                    </div>

                    {!hasEthereumProvider && (
                        <div
                            style={{
                                marginBottom: "20px",
                                padding: "14px 16px",
                                borderRadius: "16px",
                                background: "rgba(255,255,255,0.14)",
                                color: "#fff",
                                lineHeight: 1.7,
                            }}
                        >
                            このブラウザでウォレットが見つかりません。MetaMask 拡張または Brave Wallet を有効化した後に、ページを再読み込みしてください。
                        </div>
                    )}

                    <button
                        className="btn-primary-custom"
                        style={{
                            width: "100%",
                            padding: "18px 20px",
                            fontSize: "18px",
                            fontWeight: 800,
                            borderRadius: "18px",
                        }}
                        onClick={handleSwitchNetwork}
                    >
                        Avalanche Fuji を MetaMask に追加して切り替える
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Modal_change_network;
