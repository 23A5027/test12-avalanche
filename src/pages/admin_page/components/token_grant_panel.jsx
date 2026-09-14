import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";
import {
    clearGrantedToken,
    getAddressGrantStatus,
    getGrantLedgerEntries,
    hasGrantedToken,
    isGrantActive,
    isGrantReserved,
    markGrantedToken,
    normalizeGrantRecord,
    persistGrantRecordToServer,
    removeGrantRecordFromServer,
    syncGrantLedgerFromServer,
    TOKEN_GRANT_KEYS,
} from "../../../utils/tokenGrantLedger";
import {
    buildSurveyRewardStatusMap,
    getSurveyRewardEntries,
    hasSurveyRewardReserved,
    normalizeCampaignKey,
    persistSurveyRewardEntriesToServer,
    syncSurveyRewardLedgerFromServer,
} from "../../../utils/surveyRewardLedger";

const AMOY_EXPLORER_TX_BASE = "https://explorer-test.avax.network/c-chain/tx/";
const AMOY_EXPLORER_ADDRESS_BASE = "https://explorer-test.avax.network/c-chain/address/";

function formatInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function normalizeAddressLines(rawValue) {
    return rawValue
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function formatDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    } catch (error) {
        return String(value);
    }
}

function shortenHash(value = "") {
    if (!value || value.length < 14) return value || "-";
    return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function getSelectedAssetTargets(polAmount, tftAmount, tttAmount) {
    return [
        { enabled: Number(polAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.POL, amount: Number(polAmount || 0), label: "AVAX" },
        { enabled: Number(tftAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.TFT, amount: Number(tftAmount || 0), label: "TFT" },
        { enabled: Number(tttAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.TTT, amount: Number(tttAmount || 0), label: "TTT" },
    ];
}

const ASSET_LABELS = [
    { key: TOKEN_GRANT_KEYS.POL, label: "AVAX" },
    { key: TOKEN_GRANT_KEYS.TFT, label: "TFT" },
    { key: TOKEN_GRANT_KEYS.TTT, label: "TTT" },
];

function isManualMarkedRecord(record) {
    return String(record?.source || "").includes("manual_mark");
}

function hasManualMarkHistory(record) {
    return (record?.history || []).some((entry) => entry?.type === "manual_mark");
}

function formatSurveyStatusLabel(entry) {
    if (!entry) return "未付与";
    if (entry.type === "grant" && entry.confirmed !== false) return "付与済み";
    if (entry.type === "pending") return "送金処理中";
    if (entry.type === "rollback") return "未付与";
    return "未付与";
}

function Token_grant_panel(props) {
    const [singleAddress, setSingleAddress] = useState("");
    const [bulkAddresses, setBulkAddresses] = useState("");
    const [students, setStudents] = useState([]);
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [polAmount, setPolAmount] = useState("1");
    const [tftAmount, setTftAmount] = useState("50");
    const [tttAmount, setTttAmount] = useState("1000");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [grantLedgerEntries, setGrantLedgerEntries] = useState([]);
    const [grantSyncError, setGrantSyncError] = useState("");
    const [studentNameMap, setStudentNameMap] = useState({});
    const [surveyCampaignLabel, setSurveyCampaignLabel] = useState("");
    const [surveyTftAmount, setSurveyTftAmount] = useState("50");
    const [surveyRewardEntries, setSurveyRewardEntries] = useState([]);
    const [surveyBulkAddresses, setSurveyBulkAddresses] = useState("");

    const typedAddresses = useMemo(() => normalizeAddressLines(bulkAddresses), [bulkAddresses]);
    const surveyTypedAddresses = useMemo(() => normalizeAddressLines(surveyBulkAddresses), [surveyBulkAddresses]);
    const manualGrantEntries = useMemo(
        () => grantLedgerEntries.filter((entry) => ASSET_LABELS.some((item) => {
            const record = normalizeGrantRecord(entry?.status?.[item.key]);
            return isGrantActive(record) && hasManualMarkHistory(record);
        })),
        [grantLedgerEntries]
    );
    const studentIndexMap = useMemo(
        () => new Map((students || []).map((address, index) => [props.cont.normalizeAddress(address), formatInternalId("USER", index)])),
        [students, props.cont]
    );
    const tokenGrantExportRows = useMemo(() => (
        grantLedgerEntries.flatMap((entry) => (
            ASSET_LABELS.flatMap((asset) => {
                const record = normalizeGrantRecord(entry?.status?.[asset.key]);
                const history = Array.isArray(record?.history) ? record.history : [];
                return history.map((historyEntry, index) => ({
                    address: entry.address,
                    student_id: studentIndexMap.get(props.cont.normalizeAddress(entry.address)) || "",
                    student_name: studentNameMap[props.cont.normalizeAddress(entry.address)] || "",
                    asset: asset.label,
                    current_status: record ? (isGrantActive(record) ? (isManualMarkedRecord(record) ? "既付与登録" : "付与済み") : isGrantReserved(record) ? "送金処理中" : "未付与") : "未付与",
                    current_amount: record?.amount ?? "",
                    current_tx_hash: record?.txHash || "",
                    current_tx_url: record?.txHash ? `${AMOY_EXPLORER_TX_BASE}${record.txHash}` : "",
                    current_granted_at: record?.grantedAt || "",
                    history_index: index + 1,
                    history_type: historyEntry?.type === "manual_mark" ? "既付与登録" : historyEntry?.type === "clear" ? "既付与解除" : "送金確認",
                    amount: historyEntry?.amount ?? "",
                    timestamp: historyEntry?.at || "",
                    tx_hash: historyEntry?.txHash || "",
                    tx_url: historyEntry?.txHash ? `${AMOY_EXPLORER_TX_BASE}${historyEntry.txHash}` : "",
                    address_url: `${AMOY_EXPLORER_ADDRESS_BASE}${entry.address}`,
                    source: historyEntry?.source || "",
                    confirmed: historyEntry?.confirmed !== false ? "true" : "false",
                    active: historyEntry?.active !== false ? "true" : "false",
                }));
            })
        ))
    ), [grantLedgerEntries, studentIndexMap, studentNameMap, props.cont]);
    const surveyRewardStatusMap = useMemo(
        () => buildSurveyRewardStatusMap(surveyRewardEntries),
        [surveyRewardEntries]
    );
    const surveyRewardExportRows = useMemo(() => (
        surveyRewardEntries.map((entry, index) => {
            const status = surveyRewardStatusMap.get(`${entry.campaignKey}:${props.cont.normalizeAddress(entry.address)}`);
            const latestEntry = status?.latestEntry || null;
            const currentStatus = latestEntry?.type === "grant"
                ? "付与済み"
                : latestEntry?.type === "pending"
                    ? "送金処理中"
                    : latestEntry?.type === "rollback"
                        ? "未付与"
                        : "未付与";

            return {
                row_index: index + 1,
                campaign_label: entry.campaignLabel,
                campaign_key: entry.campaignKey,
                address: entry.address,
                student_id: studentIndexMap.get(props.cont.normalizeAddress(entry.address)) || entry.studentId || "",
                student_name: studentNameMap[props.cont.normalizeAddress(entry.address)] || entry.studentName || "",
                amount_tft: Number(entry.amount || 0),
                event_type: entry.type === "grant" ? "送金確認" : entry.type === "pending" ? "送金処理中" : "送金失敗/解除",
                timestamp: entry.createdAt || "",
                tx_hash: entry.txHash || "",
                tx_url: entry.txHash ? `${AMOY_EXPLORER_TX_BASE}${entry.txHash}` : "",
                current_status: currentStatus,
                source: entry.source || "",
                confirmed: entry.confirmed !== false ? "true" : "false",
            };
        })
    ), [props.cont, studentIndexMap, studentNameMap, surveyRewardEntries, surveyRewardStatusMap]);
    const combinedGrantExportRows = useMemo(() => {
        const starterRows = tokenGrantExportRows.map((row) => ({
            category: "starter_or_manual",
            campaign_label: "",
            campaign_key: "",
            ...row,
        }));
        const surveyRows = surveyRewardExportRows.map((row) => ({
            category: "survey_reward",
            address: row.address,
            student_id: row.student_id,
            student_name: row.student_name,
            asset: "TFT",
            current_status: row.current_status,
            current_amount: row.amount_tft,
            current_tx_hash: row.tx_hash,
            current_tx_url: row.tx_url,
            current_granted_at: row.timestamp,
            history_index: row.row_index,
            history_type: row.event_type,
            amount: row.amount_tft,
            timestamp: row.timestamp,
            tx_hash: row.tx_hash,
            tx_url: row.tx_url,
            address_url: `${AMOY_EXPLORER_ADDRESS_BASE}${row.address}`,
            source: row.source,
            confirmed: row.confirmed,
            active: row.current_status === "付与済み" ? "true" : "false",
            campaign_label: row.campaign_label,
            campaign_key: row.campaign_key,
            category: "survey_reward",
        }));
        return [...starterRows, ...surveyRows];
    }, [surveyRewardExportRows, tokenGrantExportRows]);

    async function refreshGrantLedger() {
        try {
            await syncGrantLedgerFromServer();
            setGrantSyncError("");
            setGrantLedgerEntries(getGrantLedgerEntries());
            return true;
        } catch (error) {
            console.error("Failed to sync token grant ledger", error);
            setGrantSyncError("付与履歴の共有同期に失敗しました。二重送金防止のため、同期が戻るまで付与を停止しています。");
            setGrantLedgerEntries(getGrantLedgerEntries());
            return false;
        }
    }

    async function refreshSurveyRewardLedger() {
        try {
            const entries = await syncSurveyRewardLedgerFromServer();
            setSurveyRewardEntries(Array.isArray(entries) ? entries : getSurveyRewardEntries());
            return true;
        } catch (error) {
            console.error("Failed to sync survey reward ledger", error);
            setSurveyRewardEntries(getSurveyRewardEntries());
            return false;
        }
    }

    async function loadStudents() {
        try {
            const result = await props.cont.get_student_list();
            const nextStudents = Array.isArray(result) ? result : [];
            setStudents(nextStudents);
            const profileEntries = await Promise.all(
                nextStudents.map(async (student) => {
                    try {
                        const userData = await props.cont.get_user_data(student);
                        return [props.cont.normalizeAddress(student), String(userData?.[0] || "")];
                    } catch (error) {
                        return [props.cont.normalizeAddress(student), ""];
                    }
                })
            );
            setStudentNameMap(Object.fromEntries(profileEntries));
        } catch (error) {
            console.error("Failed to load students for token grant panel", error);
            setStudents([]);
            setStudentNameMap({});
        }
    }

    useEffect(() => {
        loadStudents();
        refreshGrantLedger();
        refreshSurveyRewardLedger();
    }, [props.cont]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            refreshGrantLedger();
            refreshSurveyRewardLedger();
        }, 5000);
        const handleSync = () => {
            if (document.visibilityState === "visible") {
                refreshGrantLedger();
                refreshSurveyRewardLedger();
            }
        };
        document.addEventListener("visibilitychange", handleSync);
        window.addEventListener("focus", handleSync);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", handleSync);
            window.removeEventListener("focus", handleSync);
        };
    }, []);

    function toggleStudent(address) {
        setSelectedStudents((current) => (
            current.includes(address)
                ? current.filter((item) => item !== address)
                : [...current, address]
        ));
    }

    function applyPreset() {
        setPolAmount("1");
        setTftAmount("50");
        setTttAmount("1000");
    }

    function buildGrantPlan(addresses) {
        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        const requestedAmounts = {
            POL: Number(polAmount || 0),
            TFT: Number(tftAmount || 0),
            TTT: Number(tttAmount || 0),
        };

        const plan = normalizedTargets.map((address) => ({
            address,
            shouldGrant: {
                POL: requestedAmounts.POL > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.POL),
                TFT: requestedAmounts.TFT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT),
                TTT: requestedAmounts.TTT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TTT),
            },
        }));

        return {
            requestedAmounts,
            normalizedTargets,
            plan,
        };
    }

    async function markAddressesAsAlreadyGranted(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴を同期できないため、既付与登録も停止しました。少し待ってから再試行してください。");
            return;
        }

        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("対象アドレスを入力または選択してください。");
            return;
        }

        setIsSubmitting(true);
        try {
            for (const address of normalizedTargets) {
                const targets = getSelectedAssetTargets(polAmount, tftAmount, tttAmount);

                for (const target of targets) {
                    if (!target.enabled || hasGrantedToken(address, target.assetKey)) continue;

                    const payload = {
                        grantedAt: new Date().toISOString(),
                        amount: target.amount,
                        txHash: "",
                        source: `${sourceLabel}_manual_mark`,
                        confirmed: true,
                    };
                    markGrantedToken(address, target.assetKey, payload);
                    await persistGrantRecordToServer(address, target.assetKey, payload);
                }
            }

            await refreshGrantLedger();
            alert(`${normalizedTargets.length}件を既付与として登録しました。今後は二重送金対象から外れます。`);
        } catch (error) {
            console.error("Failed to mark addresses as granted", error);
            alert("既付与登録に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function clearAlreadyGrantedMarks(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴を同期できないため、既付与解除も停止しました。少し待ってから再試行してください。");
            return;
        }

        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("対象アドレスを入力または選択してください。");
            return;
        }

        const targets = getSelectedAssetTargets(polAmount, tftAmount, tttAmount).filter((target) => target.enabled);
        if (targets.length === 0) {
            alert("解除したい資産の数量を 0 より大きくしてください。");
            return;
        }

        setIsSubmitting(true);
        try {
            let removedCount = 0;

            for (const address of normalizedTargets) {
                const status = getAddressGrantStatus(address);
                for (const target of targets) {
                    const currentRecord = status?.[target.assetKey];
                    if (!currentRecord) continue;

                    const clearPayload = {
                        grantedAt: new Date().toISOString(),
                        amount: currentRecord?.amount ?? target.amount,
                        source: `${sourceLabel}_clear_manual_mark`,
                    };
                    clearGrantedToken(address, target.assetKey, clearPayload);
                    await removeGrantRecordFromServer(address, target.assetKey, clearPayload);
                    removedCount += 1;
                }
            }

            await refreshGrantLedger();
            alert(
                removedCount > 0
                    ? `${removedCount}件の既付与登録を解除しました。必要ならこのあと改めて送金できます。`
                    : "解除できる既付与登録はありませんでした。"
            );

            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: `${sourceLabel}_clear_manual_mark`,
                recipientCount: normalizedTargets.length,
                polAmount: Number(polAmount || 0),
                tftAmount: Number(tftAmount || 0),
                tttAmount: Number(tttAmount || 0),
            });
        } catch (error) {
            console.error("Failed to clear already granted marks", error);
            alert("既付与登録の解除に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function grantToAddresses(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴をサーバーと同期できなかったため、二重送金防止のため送金を止めました。少し待ってから再試行してください。");
            return;
        }
        const { requestedAmounts, normalizedTargets, plan } = buildGrantPlan(addresses);
        if (normalizedTargets.length === 0) {
            alert("付与先アドレスを入力または選択してください。");
            return;
        }

        const grantableTargets = plan.filter((item) => item.shouldGrant.POL || item.shouldGrant.TFT || item.shouldGrant.TTT);
        if (grantableTargets.length === 0) {
            alert("選択した学生には、指定した AVAX / TFT / TTT はすでに付与済みです。二重送金は行いません。");
            return;
        }

        setIsSubmitting(true);
        try {
            const results = [];

            for (const item of grantableTargets) {
                const pendingTargets = getSelectedAssetTargets(
                    item.shouldGrant.POL ? requestedAmounts.POL : 0,
                    item.shouldGrant.TFT ? requestedAmounts.TFT : 0,
                    item.shouldGrant.TTT ? requestedAmounts.TTT : 0,
                ).filter((target) => target.enabled);

                for (const target of pendingTargets) {
                    const pendingPayload = {
                        grantedAt: new Date().toISOString(),
                        amount: target.amount,
                        txHash: "",
                        source: `${sourceLabel}_pending`,
                        confirmed: false,
                    };
                    markGrantedToken(item.address, target.assetKey, pendingPayload);
                    await persistGrantRecordToServer(item.address, target.assetKey, pendingPayload);
                }

                try {
                    const recipientResults = await props.cont.grantStudentStarterTokens([item.address], {
                        pol: item.shouldGrant.POL ? requestedAmounts.POL : 0,
                        tft: item.shouldGrant.TFT ? requestedAmounts.TFT : 0,
                        ttt: item.shouldGrant.TTT ? requestedAmounts.TTT : 0,
                    });
                    results.push(...recipientResults);
                    const settledAssetKeys = new Set();

                    for (const result of recipientResults) {
                        const assetKey =
                            result.asset === "AVAX"
                                ? TOKEN_GRANT_KEYS.POL
                                : result.asset === "TFT"
                                    ? TOKEN_GRANT_KEYS.TFT
                                    : TOKEN_GRANT_KEYS.TTT;
                        settledAssetKeys.add(assetKey);

                        const payload = {
                            grantedAt: new Date().toISOString(),
                            amount: result.amount,
                            txHash: result.hash,
                            source: sourceLabel,
                            confirmed: result.confirmed !== false,
                        };

                        if (result.confirmed !== false) {
                            markGrantedToken(item.address, assetKey, payload);
                            await persistGrantRecordToServer(item.address, assetKey, payload);
                        } else {
                            const clearPayload = {
                                grantedAt: new Date().toISOString(),
                                amount: result.amount,
                                source: `${sourceLabel}_rollback_pending`,
                            };
                            clearGrantedToken(item.address, assetKey, clearPayload);
                            await removeGrantRecordFromServer(item.address, assetKey, clearPayload);
                        }
                    }

                    for (const target of pendingTargets) {
                        if (settledAssetKeys.has(target.assetKey)) continue;
                        const clearPayload = {
                            grantedAt: new Date().toISOString(),
                            amount: target.amount,
                            source: `${sourceLabel}_rollback_pending`,
                        };
                        clearGrantedToken(item.address, target.assetKey, clearPayload);
                        await removeGrantRecordFromServer(item.address, target.assetKey, clearPayload);
                    }
                } catch (error) {
                    for (const target of pendingTargets) {
                        const clearPayload = {
                            grantedAt: new Date().toISOString(),
                            amount: target.amount,
                            source: `${sourceLabel}_rollback_pending`,
                        };
                        clearGrantedToken(item.address, target.assetKey, clearPayload);
                        await removeGrantRecordFromServer(item.address, target.assetKey, clearPayload);
                    }
                    throw error;
                }
            }

            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: sourceLabel,
                recipientCount: grantableTargets.length,
                skippedCount: normalizedTargets.length - grantableTargets.length,
                polAmount: requestedAmounts.POL,
                tftAmount: requestedAmounts.TFT,
                tttAmount: requestedAmounts.TTT,
            });

            await refreshGrantLedger();

            const skippedTargets = plan
                .filter((item) => !item.shouldGrant.POL && !item.shouldGrant.TFT && !item.shouldGrant.TTT)
                .map((item) => item.address);

            alert(
                `${grantableTargets.length}件に付与しました。\n`
                + `AVAX: ${requestedAmounts.POL}\n`
                + `TFT: ${requestedAmounts.TFT}\n`
                + `TTT: ${requestedAmounts.TTT}\n`
                + `処理件数: ${results.length}`
                + (skippedTargets.length > 0 ? `\n未送金（付与済み）: ${skippedTargets.length}件` : "")
            );
        } catch (error) {
            console.error("Failed to grant tokens", error);
            alert(error?.shortMessage || error?.message || "トークン付与に失敗しました。MetaMask の承認と残高を確認してください。");
        } finally {
            setIsSubmitting(false);
        }
    }

    function renderAddressMeta(address) {
        if (!address) return null;
        return (
            <div className="token-grant-address-meta">
                <a
                    href={`${AMOY_EXPLORER_ADDRESS_BASE}${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="token-grant-link"
                >
                    Avalanche Explorer でアドレス確認
                </a>
            </div>
        );
    }

    function renderGrantStatusSummary(address) {
        const status = getAddressGrantStatus(address);

        return (
            <div className="token-grant-status-list">
                {ASSET_LABELS.map((item) => {
                    const record = status?.[item.key];
                    return (
                        <div key={item.key} className={`token-grant-status-badge ${record ? "granted" : "pending"}`}>
                            <span>{item.label}</span>
                            <span>
                                {record && isGrantActive(record)
                                    ? `${isManualMarkedRecord(record) ? "既付与登録" : "付与済み"}${record.amount ? ` ${record.amount}` : ""}`
                                    : record && isGrantReserved(record)
                                        ? `送金処理中${record.amount ? ` ${record.amount}` : ""}`
                                    : "未付与"}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderGrantStatusDetails(address) {
        const status = getAddressGrantStatus(address);

        return (
            <div className="token-grant-status-list detailed">
                {ASSET_LABELS.map((item) => {
                    const record = normalizeGrantRecord(status?.[item.key]);
                    const history = [...(record?.history || [])].sort((left, right) => String(right.at).localeCompare(String(left.at)));
                    return (
                        <div key={item.key} className={`token-grant-status-badge ${record ? "granted" : "pending"} detailed`}>
                            <div className="token-grant-status-heading">
                                <span>{item.label}</span>
                                <span>
                                    {record && isGrantActive(record)
                                        ? `${isManualMarkedRecord(record) ? "既付与登録" : "付与済み"}${record.amount ? ` ${record.amount}` : ""}`
                                        : record && isGrantReserved(record)
                                            ? `送金処理中${record.amount ? ` ${record.amount}` : ""}`
                                        : "未付与"}
                                </span>
                            </div>
                            {record ? (
                                <div className="token-grant-status-meta">
                                    <div>状態: {isGrantActive(record) ? (isManualMarkedRecord(record) ? "過去配布済みとして登録（送金なし）" : "送金確認済み") : isGrantReserved(record) ? "送金処理中" : "現在は未付与"}</div>
                                    <div>現在状態の時刻: {formatDateTime(record.grantedAt)}</div>
                                    <div>
                                        現在状態の Tx:
                                        {" "}
                                        {record.txHash ? (
                                            <a
                                                href={`${AMOY_EXPLORER_TX_BASE}${record.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="token-grant-link"
                                            >
                                                {shortenHash(record.txHash)}
                                            </a>
                                        ) : (
                                            isManualMarkedRecord(record) ? "既付与登録のため送金なし" : "-"
                                        )}
                                    </div>
                                    {history.length > 0 && (
                                        <div style={{ marginTop: "var(--space-2)" }}>
                                            <div style={{ fontWeight: 600, color: "#fff3cd" }}>履歴</div>
                                            {history.map((entry, index) => (
                                                <div key={`${item.key}-${index}-${entry.at}`} style={{ marginTop: "0.25rem" }}>
                                                    {formatDateTime(entry.at)}
                                                    {" / "}
                                                    {entry.type === "manual_mark" ? "既付与登録" : entry.type === "clear" ? "既付与解除" : "送金確認"}
                                                    {" / "}
                                                    {entry.txHash ? (
                                                        <a
                                                            href={`${AMOY_EXPLORER_TX_BASE}${entry.txHash}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="token-grant-link"
                                                        >
                                                            {shortenHash(entry.txHash)}
                                                        </a>
                                                    ) : (
                                                        "送金なし"
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="token-grant-status-meta">
                                    <div>まだ送っていません</div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    function getSurveyStatusesForAddress(address) {
        const normalizedAddress = props.cont.normalizeAddress(address);
        return Array.from(surveyRewardStatusMap.values())
            .filter((status) => props.cont.normalizeAddress(status?.address) === normalizedAddress)
            .sort((left, right) => String(right?.latestEntry?.createdAt || "").localeCompare(String(left?.latestEntry?.createdAt || "")));
    }

    function renderSurveyRewardSummary(address) {
        const statuses = getSurveyStatusesForAddress(address);
        const currentCampaignKey = normalizeCampaignKey(surveyCampaignLabel);
        const preferredStatuses = currentCampaignKey
            ? [
                ...statuses.filter((status) => status.campaignKey === currentCampaignKey),
                ...statuses.filter((status) => status.campaignKey !== currentCampaignKey),
            ]
            : statuses;
        const visibleStatuses = preferredStatuses.slice(0, 2);

        if (visibleStatuses.length === 0) {
            return (
                <div className="token-grant-status-list">
                    <div className="token-grant-status-badge pending">
                        <span>アンケート</span>
                        <span>未付与</span>
                    </div>
                </div>
            );
        }

        return (
            <div className="token-grant-status-list">
                {visibleStatuses.map((status) => {
                    const latestEntry = status?.latestEntry;
                    const label = formatSurveyStatusLabel(latestEntry);
                    return (
                        <div key={`${status.campaignKey}:${status.address}`} className={`token-grant-status-badge ${label === "付与済み" ? "granted" : "pending"}`}>
                            <span>{status.campaignLabel || status.campaignKey}</span>
                            <span>{label}{latestEntry?.amount ? ` ${latestEntry.amount}` : ""}</span>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderSurveyRewardDetails(address) {
        const statuses = getSurveyStatusesForAddress(address);
        if (statuses.length === 0) {
            return (
                <div className="token-grant-status-list detailed">
                    <div className="token-grant-status-badge pending detailed">
                        <div className="token-grant-status-heading">
                            <span>アンケート報酬</span>
                            <span>未付与</span>
                        </div>
                        <div className="token-grant-status-meta">
                            <div>まだアンケート報酬の履歴はありません</div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="token-grant-status-list detailed">
                {statuses.map((status) => {
                    const latestEntry = status?.latestEntry;
                    const history = Array.isArray(status?.history) ? [...status.history].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))) : [];
                    const statusLabel = formatSurveyStatusLabel(latestEntry);
                    return (
                        <div key={`${status.campaignKey}:${status.address}`} className={`token-grant-status-badge ${statusLabel === "付与済み" ? "granted" : "pending"} detailed`}>
                            <div className="token-grant-status-heading">
                                <span>{status.campaignLabel || status.campaignKey}</span>
                                <span>{statusLabel}{latestEntry?.amount ? ` ${latestEntry.amount} TFT` : ""}</span>
                            </div>
                            <div className="token-grant-status-meta">
                                <div>現在状態: {statusLabel}</div>
                                <div>現在状態の時刻: {formatDateTime(latestEntry?.createdAt)}</div>
                                <div>
                                    現在状態の Tx:
                                    {" "}
                                    {latestEntry?.txHash ? (
                                        <a
                                            href={`${AMOY_EXPLORER_TX_BASE}${latestEntry.txHash}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="token-grant-link"
                                        >
                                            {shortenHash(latestEntry.txHash)}
                                        </a>
                                    ) : (
                                        "-"
                                    )}
                                </div>
                                {history.length > 0 && (
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                        <div style={{ fontWeight: 600, color: "#fff3cd" }}>履歴</div>
                                        {history.map((entry, index) => (
                                            <div key={`${status.campaignKey}-${index}-${entry.createdAt}`}>
                                                {formatDateTime(entry.createdAt)}
                                                {" / "}
                                                {entry.type === "grant" ? "送金確認" : entry.type === "pending" ? "送金処理中" : "送金失敗/解除"}
                                                {" / "}
                                                {entry.txHash ? (
                                                    <a
                                                        href={`${AMOY_EXPLORER_TX_BASE}${entry.txHash}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="token-grant-link"
                                                    >
                                                        {shortenHash(entry.txHash)}
                                                    </a>
                                                ) : (
                                                    "送金なし"
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderManualGrantAssets(address) {
        const status = getAddressGrantStatus(address);
        const manualAssets = ASSET_LABELS
            .filter((item) => {
                const record = normalizeGrantRecord(status?.[item.key]);
                return isGrantActive(record) && hasManualMarkHistory(record);
            })
            .map((item) => {
                const record = normalizeGrantRecord(status?.[item.key]);
                return `${item.label}${record?.amount ? ` ${record.amount}` : ""}`;
            });
        return manualAssets.join(" / ");
    }

    function renderLedgerSummary(entry, summaryLabel = "") {
        return (
            <summary className="token-grant-ledger-summary">
                <div className="token-grant-ledger-summary-main">
                    <div className="token-grant-ledger-address">{entry.address}</div>
                    {summaryLabel ? (
                        <div className="token-grant-card-desc token-grant-summary-label">{summaryLabel}</div>
                    ) : null}
                </div>
                <div className="token-grant-ledger-summary-side">
                    {renderGrantStatusSummary(entry.address)}
                    <span className="token-grant-ledger-toggle-text">開閉</span>
                </div>
            </summary>
        );
    }

    function renderLedgerDetails(entry, summaryLabel = "") {
        return (
            <details className="token-grant-ledger-collapsible">
                {renderLedgerSummary(entry, summaryLabel)}
                <div className="token-grant-ledger-body">
                    {summaryLabel ? (
                        <div className="token-grant-card-desc" style={{ marginBottom: "var(--space-2)" }}>
                            {summaryLabel}
                        </div>
                    ) : null}
                    {renderAddressMeta(entry.address)}
                    {renderGrantStatusDetails(entry.address)}
                </div>
            </details>
        );
    }

    function handleExportTokenGrantJson() {
        downloadTextFile(
            `token_grant_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
            JSON.stringify(combinedGrantExportRows, null, 2),
            "application/json;charset=utf-8"
        );
    }

    function handleExportTokenGrantCsv() {
        const header = [
            "category",
            "campaign_label",
            "campaign_key",
            "address",
            "student_id",
            "student_name",
            "asset",
            "current_status",
            "current_amount",
            "current_tx_hash",
            "current_tx_url",
            "current_granted_at",
            "history_index",
            "history_type",
            "amount",
            "timestamp",
            "tx_hash",
            "tx_url",
            "address_url",
            "source",
            "confirmed",
            "active",
        ];
        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
        const rows = [
            header.join(","),
            ...combinedGrantExportRows.map((row) => header.map((key) => escapeCsv(row[key])).join(",")),
        ];
        downloadTextFile(
            `token_grant_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
            rows.join("\n"),
            "text/csv;charset=utf-8"
        );
    }

    function handleExportSurveyRewardJson() {
        downloadTextFile(
            `survey_reward_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
            JSON.stringify(surveyRewardExportRows, null, 2),
            "application/json;charset=utf-8"
        );
    }

    function handleExportSurveyRewardCsv() {
        const header = [
            "row_index",
            "campaign_label",
            "campaign_key",
            "address",
            "student_id",
            "student_name",
            "amount_tft",
            "event_type",
            "timestamp",
            "tx_hash",
            "tx_url",
            "current_status",
            "source",
            "confirmed",
        ];
        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
        const rows = [
            header.join(","),
            ...surveyRewardExportRows.map((row) => header.map((key) => escapeCsv(row[key])).join(",")),
        ];
        downloadTextFile(
            `survey_reward_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
            rows.join("\n"),
            "text/csv;charset=utf-8"
        );
    }

    async function grantSurveyRewards(addresses, sourceLabel) {
        const campaignLabel = String(surveyCampaignLabel || "").trim();
        const campaignKey = normalizeCampaignKey(campaignLabel);
        const amount = Number(surveyTftAmount || 0);
        if (!campaignLabel || !campaignKey) {
            alert("アンケート名を入力してください。");
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            alert("アンケート報酬のTFT数を 0 より大きく入力してください。");
            return;
        }

        const synced = await refreshSurveyRewardLedger();
        if (!synced) {
            alert("アンケート報酬履歴を同期できないため、二重送金防止のため送金を止めました。少し待ってから再試行してください。");
            return;
        }

        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("対象の学生アドレスを入力または選択してください。");
            return;
        }

        const grantableTargets = normalizedTargets.filter((address) => !hasSurveyRewardReserved(address, campaignKey, surveyRewardEntries));
        if (grantableTargets.length === 0) {
            alert("選択した学生には、このアンケート名ですでに配布済み、または送金処理中です。");
            return;
        }

        setIsSubmitting(true);
        try {
            const actorAddress = props.cont.normalizeAddress(await props.cont.get_address());

            for (const address of grantableTargets) {
                const normalizedAddress = props.cont.normalizeAddress(address);
                const studentName = studentNameMap[normalizedAddress] || "";
                const studentId = studentIndexMap.get(normalizedAddress) || "";
                const pendingEntry = {
                    id: `${campaignKey}:${normalizedAddress}:${Date.now()}:pending`,
                    address: normalizedAddress,
                    campaignKey,
                    campaignLabel,
                    amount,
                    txHash: "",
                    createdAt: new Date().toISOString(),
                    type: "pending",
                    confirmed: false,
                    actorAddress,
                    source: `${sourceLabel}_pending`,
                    studentName,
                    studentId,
                };
                await persistSurveyRewardEntriesToServer([pendingEntry]);

                try {
                    const results = await props.cont.grantStudentStarterTokens([normalizedAddress], { pol: 0, tft: amount, ttt: 0 });
                    const successfulTransfer = (Array.isArray(results) ? results : []).find((result) => result?.asset === "TFT" && result?.confirmed !== false);
                    if (!successfulTransfer?.hash) {
                        throw new Error((Array.isArray(results) ? results : []).find((result) => result?.asset === "TFT")?.error || "survey_reward_transfer_failed");
                    }

                    const confirmedEntry = {
                        id: `${campaignKey}:${normalizedAddress}:${successfulTransfer.hash}:grant`,
                        address: normalizedAddress,
                        campaignKey,
                        campaignLabel,
                        amount,
                        txHash: successfulTransfer.hash,
                        createdAt: new Date().toISOString(),
                        type: "grant",
                        confirmed: true,
                        actorAddress,
                        source: sourceLabel,
                        studentName,
                        studentId,
                    };
                    await persistSurveyRewardEntriesToServer([confirmedEntry]);
                } catch (error) {
                    const rollbackEntry = {
                        id: `${campaignKey}:${normalizedAddress}:${Date.now()}:rollback`,
                        address: normalizedAddress,
                        campaignKey,
                        campaignLabel,
                        amount,
                        txHash: "",
                        createdAt: new Date().toISOString(),
                        type: "rollback",
                        confirmed: true,
                        actorAddress,
                        source: `${sourceLabel}_rollback`,
                        studentName,
                        studentId,
                    };
                    await persistSurveyRewardEntriesToServer([rollbackEntry]);
                    throw error;
                }
            }

            await refreshSurveyRewardLedger();
            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: `${sourceLabel}_survey_reward`,
                campaignLabel,
                recipientCount: grantableTargets.length,
                skippedCount: normalizedTargets.length - grantableTargets.length,
                tftAmount: amount,
            });
            alert(
                `${campaignLabel} の報酬として ${grantableTargets.length}件に ${amount} TFT を配布しました。`
                + (grantableTargets.length !== normalizedTargets.length ? `\n未送金（同じ回で配布済み/処理中）: ${normalizedTargets.length - grantableTargets.length}件` : "")
            );
        } catch (error) {
            console.error("Failed to grant survey rewards", error);
            alert(error?.shortMessage || error?.message || "アンケート報酬の配布に失敗しました。MetaMask の承認と残高を確認してください。");
        } finally {
            setIsSubmitting(false);
            await refreshSurveyRewardLedger();
        }
    }

    return (
        <div>
            <h3 className="section-title">学生へのトークン付与</h3>
            <p className="section-desc">
                公開アドレスを提出した学生に、回答用 AVAX、回答お礼の TFT、掲示板用 TTT を個別またはまとめて配布できます。
            </p>
            <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                <button className="btn-action" onClick={handleExportTokenGrantCsv}>📤 トークン付与履歴を CSV 出力</button>
                <button className="btn-action" onClick={handleExportTokenGrantJson}>📤 トークン付与履歴を JSON 出力</button>
                <button className="btn-action" onClick={handleExportSurveyRewardCsv}>📤 アンケート報酬履歴を CSV 出力</button>
                <button className="btn-action" onClick={handleExportSurveyRewardJson}>📤 アンケート報酬履歴を JSON 出力</button>
            </div>
            {grantSyncError && (
                <div className="address-item" style={{ borderLeftColor: "#ff9800", color: "#ffe0a3", marginBottom: "var(--space-4)" }}>
                    {grantSyncError}
                </div>
            )}

            <div className="token-grant-grid">
                <div className="token-grant-card">
                    <div className="token-grant-card-title">付与レート</div>
                    <div className="token-grant-card-desc">
                        初期値は 1 AVAX / 50 TFT / 1000 TTT です。必要に応じて数を変更できます。
                    </div>
                    <div className="token-grant-card-desc" style={{ color: "#ffd8a8" }}>
                        「既付与登録」は送金ではなく、過去にすでに配布済みだった学生を二重送金対象から外すための印です。間違えた場合はあとで解除できます。
                    </div>
                    <div className="token-grant-inputs">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>AVAX</Form.Label>
                            <Form.Control type="number" min="0" step="0.01" value={polAmount} onChange={(event) => setPolAmount(event.target.value)} />
                        </Form.Group>
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>TFT</Form.Label>
                            <Form.Control type="number" min="0" step="1" value={tftAmount} onChange={(event) => setTftAmount(event.target.value)} />
                        </Form.Group>
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>TTT</Form.Label>
                            <Form.Control type="number" min="0" step="1" value={tttAmount} onChange={(event) => setTttAmount(event.target.value)} />
                        </Form.Group>
                    </div>
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" onClick={applyPreset}>
                            標準値に戻す
                        </button>
                    </div>
                </div>

                <div className="token-grant-card">
                    <div className="token-grant-card-title">個別に付与</div>
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>対象のウォレットアドレス</Form.Label>
                        <Form.Control
                            type="text"
                            value={singleAddress}
                            onChange={(event) => setSingleAddress(event.target.value)}
                            placeholder="0x1234..."
                        />
                    </Form.Group>
                    {singleAddress && (
                        <>
                            {renderAddressMeta(singleAddress)}
                            {renderGrantStatusDetails(singleAddress)}
                            {renderSurveyRewardDetails(singleAddress)}
                        </>
                    )}
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses([singleAddress], "single")}>
                            1件に付与
                        </button>
                        <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted([singleAddress], "single")}>
                            既付与として登録
                        </button>
                        <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks([singleAddress], "single")}>
                            既付与登録を解除
                        </button>
                    </div>
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">入力したアドレスへまとめて付与</div>
                <div className="token-grant-card-desc">改行区切りで複数アドレスを貼り付けると、一括で送れます。</div>
                <Form.Group style={{ textAlign: "left" }}>
                    <Form.Label>付与先アドレス一覧</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={Math.max(typedAddresses.length + 3, 6)}
                        value={bulkAddresses}
                        onChange={(event) => setBulkAddresses(event.target.value)}
                        placeholder={"0x1234...\n0x5678..."}
                    />
                </Form.Group>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses(typedAddresses, "bulk_input")}>
                        入力済みアドレスへ一括付与
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted(typedAddresses, "bulk_input")}>
                        入力済みアドレスを既付与登録
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks(typedAddresses, "bulk_input")}>
                        入力済みアドレスの既付与解除
                    </button>
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">アンケート回答報酬の一括TFT配布</div>
                <div className="token-grant-card-desc">
                    回ごとに名前を付けて、回答した学生へまとめて TFT を配布できます。同じアンケート名では同じ学生へ二重送金しません。
                </div>
                <div className="token-grant-inputs">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>アンケート名</Form.Label>
                        <Form.Control
                            type="text"
                            value={surveyCampaignLabel}
                            onChange={(event) => setSurveyCampaignLabel(event.target.value)}
                            placeholder="例: 第1回アンケート / 講義後アンケート"
                        />
                    </Form.Group>
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>配布するTFT数</Form.Label>
                        <Form.Control
                            type="number"
                            min="1"
                            step="1"
                            value={surveyTftAmount}
                            onChange={(event) => setSurveyTftAmount(event.target.value)}
                        />
                    </Form.Group>
                </div>
                <Form.Group style={{ textAlign: "left", marginTop: "var(--space-3)" }}>
                    <Form.Label>付与先アドレス一覧</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={Math.max(surveyTypedAddresses.length + 3, 6)}
                        value={surveyBulkAddresses}
                        onChange={(event) => setSurveyBulkAddresses(event.target.value)}
                        placeholder={"0x1234...\n0x5678..."}
                    />
                    <Form.Text style={{ color: "#d7e7ff" }}>
                        改行区切りで複数アドレスを貼り付けると、アンケート報酬をまとめて配布できます。
                    </Form.Text>
                </Form.Group>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantSurveyRewards(selectedStudents, "survey_selected")}>
                        選択した学生へアンケート報酬を配布
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => grantSurveyRewards(surveyTypedAddresses, "survey_bulk_input")}>
                        入力済みアドレスへアンケート報酬を配布
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => grantSurveyRewards([singleAddress], "survey_single")}>
                        個別アドレスへアンケート報酬を配布
                    </button>
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">登録済み学生から選んで付与</div>
                <div className="token-grant-card-desc">
                    提出済みアドレスの学生を選んでまとめて付与できます。上の個別入力にもクリックで反映できます。
                </div>
                <div className="token-grant-actions" style={{ marginBottom: "var(--space-4)" }}>
                    <button className="btn-action" type="button" onClick={() => setSelectedStudents(students)}>
                        全員選択
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" onClick={() => setSelectedStudents([])}>
                        選択解除
                    </button>
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses(selectedStudents, "bulk_selected")}>
                        選択した学生へ一括付与
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted(selectedStudents, "bulk_selected")}>
                        選択した学生を既付与登録
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks(selectedStudents, "bulk_selected")}>
                        選択した学生の既付与解除
                    </button>
                </div>
                <div className="token-grant-student-list">
                    {students.length === 0 ? (
                        <div className="address-item">登録済み学生はまだありません。</div>
                    ) : (
                        students.map((student, index) => (
                            <div key={`${student}-${index}`} className="token-grant-student-item">
                                <input
                                    type="checkbox"
                                    checked={selectedStudents.includes(student)}
                                    onChange={() => toggleStudent(student)}
                                />
                                <div>
                                    <button
                                        type="button"
                                        className="token-grant-address-btn"
                                        onClick={() => setSingleAddress(student)}
                                    >
                                        {student}
                                    </button>
                                    {renderGrantStatusSummary(student)}
                                    {renderSurveyRewardSummary(student)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">アンケート報酬の配布履歴</div>
                <div className="token-grant-card-desc">
                    アンケートごとに誰へ何TFT配布したか、Tx ハッシュつきで確認できます。
                </div>
                <div className="token-grant-ledger-list">
                    {surveyRewardExportRows.length === 0 ? (
                        <div className="address-item">まだアンケート報酬の履歴はありません。</div>
                    ) : (
                        surveyRewardExportRows.map((row) => (
                            <div key={`${row.campaign_key}-${row.address}-${row.timestamp}-${row.event_type}`} className="token-grant-ledger-item">
                                <details className="token-grant-ledger-collapsible">
                                    <summary className="token-grant-ledger-summary">
                                        <div className="token-grant-ledger-summary-main">
                                            <div className="token-grant-ledger-address">{row.campaign_label}</div>
                                            <div className="token-grant-card-desc token-grant-summary-label">
                                                {row.student_name || row.student_id || row.address}
                                            </div>
                                        </div>
                                        <div className="token-grant-ledger-summary-side">
                                            <div className="token-grant-status-list">
                                                <div className={`token-grant-status-badge ${row.current_status === "付与済み" ? "granted" : "pending"}`}>
                                                    <span>TFT</span>
                                                    <span>{row.current_status} {row.amount_tft}</span>
                                                </div>
                                            </div>
                                            <span className="token-grant-ledger-toggle-text">開閉</span>
                                        </div>
                                    </summary>
                                    <div className="token-grant-ledger-body">
                                        <div className="token-grant-status-meta">
                                            <div>学生: {row.student_name || "-"} {row.student_id ? `(${row.student_id})` : ""}</div>
                                            <div>アドレス: {row.address}</div>
                                            <div>配布量: {row.amount_tft} TFT</div>
                                            <div>状態: {row.current_status}</div>
                                            <div>履歴種別: {row.event_type}</div>
                                            <div>時刻: {formatDateTime(row.timestamp)}</div>
                                            <div>
                                                Tx:
                                                {" "}
                                                {row.tx_hash ? (
                                                    <a href={row.tx_url} target="_blank" rel="noreferrer" className="token-grant-link">
                                                        {shortenHash(row.tx_hash)}
                                                    </a>
                                                ) : (
                                                    "-"
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">既付与登録した学生一覧</div>
                <div className="token-grant-card-desc">
                    過去にすでに配布済みとして送金せず印だけ付けた学生をここで確認できます。解除したいときは上の各解除ボタンを使ってください。
                </div>
                <div className="token-grant-ledger-list">
                    {manualGrantEntries.length === 0 ? (
                        <div className="address-item">既付与登録した学生はまだありません。</div>
                    ) : (
                        manualGrantEntries.map((entry) => (
                            <div key={`manual-${entry.address}`} className="token-grant-ledger-item manual-mark">
                                {renderLedgerDetails(entry, `既付与登録: ${renderManualGrantAssets(entry.address)}`)}
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">付与状況の一覧</div>
                <div className="token-grant-card-desc">
                    何を誰に付与済みか、まだ付与していないかをここで確認できます。Tx ハッシュから実際の送金も確認できます。
                </div>
                <div className="token-grant-ledger-list">
                    {grantLedgerEntries.length === 0 ? (
                        <div className="address-item">まだ付与履歴はありません。</div>
                    ) : (
                        grantLedgerEntries.map((entry) => (
                            <div key={entry.address} className="token-grant-ledger-item">
                                {renderLedgerDetails(entry)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Token_grant_panel;
