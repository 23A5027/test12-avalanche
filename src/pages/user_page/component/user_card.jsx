import { convertTftToPoint } from "../../../utils/quizRewardRate";
import { token_address, ttt_token_address } from "../../../contract/config";

function User_card(props) {
    const isCurrentWallet = String(props.connectedAddress || "").toLowerCase() === String(props.address || "").toLowerCase();
    const tokenBalance = Number(props.token || 0);
    const superchatBalance = Number(props.tttBalance || 0);
    const rank = Number(props.rank || 0);
    const studentCount = Number(props.num_of_student || 0);
    const registrationDate = props.registrationInfo?.addedAt
        ? new Date(Number(props.registrationInfo.addedAt) * 1000).toLocaleString("ja-JP")
        : "";
    const shortAddedBy = props.registrationInfo?.addedBy
        ? `${props.registrationInfo.addedBy.slice(0, 10)}...${props.registrationInfo.addedBy.slice(-6)}`
        : "未記録";

    const hasEthereumProvider = async () => Boolean(await props.cont?.getEthereumProviderReady?.() || props.cont?.getEthereumProvider?.());
    const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || "");

    const showManualTokenGuide = (symbol, address) => {
        const copiedMessage = address
            ? "\nコントラクトアドレスはクリップボードへコピー済みです。"
            : "";
        alert(
            `${symbol} の自動追加に対応しない環境のため、MetaMask で手動追加してください。\n`
            + `トークン名: ${symbol}\n`
            + `コントラクトアドレス: ${address}\n`
            + "Decimals: 18"
            + copiedMessage
        );
    };

    const addNetworkHandler = async () => {
        if (!(await hasEthereumProvider())) {
            if (isMobileDevice()) {
                alert("iPhone / Android では MetaMask アプリ内ブラウザで開くとネットワーク追加とトークン追加が使いやすくなります。");
                return;
            }
            alert("ウォレットが見つかりません。Chrome / Brave の MetaMask または Brave Wallet を有効化し、ページを再読み込みしてください。");
            return;
        }

        try {
            const result = await props.cont.add_or_switch_amoy_network();
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            await props.cont.ensure_wallet_connected();
            if (result?.changed) {
                alert("Avalanche Fuji を MetaMask に追加し、自動で切り替えました。");
                return true;
            }
            alert("すでに Avalanche Fuji に接続されています。");
            return true;
        } catch (error) {
            console.error("Failed to ensure Avalanche Fuji network", error);
            if (error?.code === 4001) {
                alert("MetaMask 側で操作がキャンセルされました。");
                return false;
            }
            alert("Avalanche Fuji の追加または切り替えに失敗しました。MetaMask のポップアップを確認してください。");
            return false;
        }
    };

    const addTokenHandler = async () => {
        if (!(await hasEthereumProvider())) {
            if (isMobileDevice()) {
                showManualTokenGuide("TFT", token_address);
                return;
            }
            alert("ウォレットが見つかりません。Chrome / Brave の MetaMask または Brave Wallet を有効化し、ページを再読み込みしてください。");
            return;
        }

        try {
            const ensured = await addNetworkHandler();
            if (!ensured) return;
            const result = await props.cont.add_token_wallet();
            if (result?.fallback === "manual") {
                showManualTokenGuide("TFT", result.address);
                return;
            }
            alert("TFT を MetaMask に追加しました。");
        } catch (error) {
            console.error("Failed to add token to MetaMask", error);
            alert("TFT の追加に失敗しました。MetaMask の確認画面を確認してください。");
        }
    };

    const addTTTTokenHandler = async () => {
        if (!(await hasEthereumProvider())) {
            if (isMobileDevice()) {
                showManualTokenGuide("TTT", ttt_token_address);
                return;
            }
            alert("ウォレットが見つかりません。Chrome / Brave の MetaMask または Brave Wallet を有効化し、ページを再読み込みしてください。");
            return;
        }

        try {
            const ensured = await addNetworkHandler();
            if (!ensured) return;
            const result = await props.cont.add_ttt_token_wallet();
            if (result?.fallback === "manual") {
                showManualTokenGuide("TTT", result.address);
                return;
            }
            alert("TTT を MetaMask に追加しました。");
        } catch (error) {
            console.error("Failed to add TTT token to MetaMask", error);
            if (error?.message === "ttt_token_address_missing") {
                alert("TTT はまだデプロイ前のため、コントラクトアドレスが未設定です。");
                return;
            }
            alert("TTT の追加に失敗しました。MetaMask の確認画面を確認してください。");
        }
    };

    return (
        <div className="user-card glass-card animate-slideUp">
            <div className="user-address">
                <span className="user-address-label">アドレス</span>
                <span className="user-address-value">
                    {props.address ? `${props.address.slice(0, 10)}...${props.address.slice(-6)}` : ""}
                </span>
            </div>

            <div className="user-stats">
                <div className="user-stat-item">
                    <div className="user-stat-icon">R</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">利用区分</span>
                        <span className="user-stat-value">{props.roleInfo?.label || "未登録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">T</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">保有トークン</span>
                        <span className="user-stat-value">{tokenBalance.toFixed(2)} TFT</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">#</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">順位</span>
                        <span className="user-stat-value">
                            {rank}位 / {studentCount}人
                        </span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">C</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">スーパーチャット残高</span>
                        <span className="user-stat-value">{superchatBalance.toFixed(2)} TTT</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">A</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">登録状態</span>
                        <span className="user-stat-value">{props.registrationInfo?.registered ? "登録済み" : "未登録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">W</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">現在の接続</span>
                        <span className="user-stat-value">{isCurrentWallet ? "現在接続中" : "別アドレスを表示中"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">B</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">追加した人</span>
                        <span className="user-stat-value">{shortAddedBy}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">D</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">登録日時</span>
                        <span className="user-stat-value">{registrationDate || "未記録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">S</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">獲得点数</span>
                        <span className="user-stat-value">{convertTftToPoint(props.result).toFixed(1)}点</span>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gap: "12px", marginTop: "var(--space-4)" }}>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addNetworkHandler}>
                    Avalanche Fuji を MetaMask に追加
                </button>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addTokenHandler}>
                    TFT を MetaMask に追加
                </button>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addTTTTokenHandler}>
                    TTT を MetaMask に追加
                </button>
            </div>
        </div>
    );
}

export default User_card;
