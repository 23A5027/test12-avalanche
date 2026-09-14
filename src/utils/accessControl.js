import { useEffect, useRef, useState } from "react";
import { WALLET_PROVIDER_CHANGED_EVENT } from "../contract/contractClients";
import { bootstrap_teacher_addresses, class_room_address, quiz_address } from "../contract/config";

const ACCESS_STATE_CACHE_SCOPE = [class_room_address, quiz_address]
    .map((value) => String(value || "").toLowerCase())
    .join("_");
const ACCESS_STATE_CACHE_KEY = `web3_access_state_cache_v1_${ACCESS_STATE_CACHE_SCOPE}`;
const ACCESS_STATE_CACHE_TTL_MS = 15 * 60 * 1000;

function createDefaultAccessState() {
    return {
        isLoading: true,
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
}

let lastResolvedAccessState = null;
let lastResolvedAt = 0;
let resolveAccessPromise = null;
const ACCESS_CACHE_TTL_MS = 45000;

function readCachedAccessState() {
    if (typeof localStorage === "undefined") return null;
    try {
        const parsed = JSON.parse(localStorage.getItem(ACCESS_STATE_CACHE_KEY) || "null");
        if (!parsed || typeof parsed !== "object") return null;
        if (Date.now() - Number(parsed.cachedAt || 0) > ACCESS_STATE_CACHE_TTL_MS) return null;
        if (!parsed.state || typeof parsed.state !== "object") return null;
        return {
            ...createDefaultAccessState(),
            ...parsed.state,
            isLoading: false,
        };
    } catch (error) {
        return null;
    }
}

function writeCachedAccessState(state) {
    if (typeof localStorage === "undefined") return;
    try {
        if (!state?.address) return;
        localStorage.setItem(ACCESS_STATE_CACHE_KEY, JSON.stringify({
            cachedAt: Date.now(),
            state,
        }));
    } catch (error) {
    }
}

function resetAccessStateCache() {
    lastResolvedAccessState = null;
    lastResolvedAt = 0;
    resolveAccessPromise = null;
}

function safeCall(target, methodName, ...args) {
    const method = target?.[methodName];
    if (typeof method !== "function") {
        return Promise.resolve(null);
    }
    return Promise.resolve(method.call(target, ...args)).catch(() => null);
}

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function isBootstrapTeacherAddress(address) {
    const normalizedTarget = normalizeAddress(address);
    if (!normalizedTarget) return false;
    return (bootstrap_teacher_addresses || []).some(
        (teacherAddress) => normalizeAddress(teacherAddress) === normalizedTarget
    );
}

function isSameAccessState(current, next) {
    return current.isLoading === next.isLoading
        && current.address === next.address
        && current.role === next.role
        && current.roleLabel === next.roleLabel
        && current.registeredBy === next.registeredBy
        && current.registeredAt === next.registeredAt
        && current.isConnected === next.isConnected
        && current.isStudent === next.isStudent
        && current.canViewLive === next.canViewLive
        && current.isTeacher === next.isTeacher
        && current.hasProfile === next.hasProfile
        && current.canBroadcastLive === next.canBroadcastLive
        && current.isAuthorizedUser === next.isAuthorizedUser
        && current.canAnswerQuiz === next.canAnswerQuiz
        && current.canJoinLive === next.canJoinLive;
}

function mergeAccessState(current, next, options = {}) {
    const allowSoftDisconnect = options.allowSoftDisconnect !== false;

    if (
        allowSoftDisconnect
        && current?.isConnected
        && current?.address
        && !next?.isConnected
        && !next?.address
    ) {
        return {
            ...current,
            isLoading: false,
        };
    }

    return next;
}

async function resolveAccessState(cont) {
    const now = Date.now();
    if (lastResolvedAccessState && now - lastResolvedAt < ACCESS_CACHE_TTL_MS) {
        return lastResolvedAccessState;
    }

    if (resolveAccessPromise) {
        return resolveAccessPromise;
    }

    const nextState = createDefaultAccessState();
    resolveAccessPromise = (async () => {
        try {
            const address = await cont?.get_address?.() || cont?.get_last_known_address?.() || "";
            if (!address) {
                const disconnectedState = {
                    ...nextState,
                    isLoading: false,
                };
                lastResolvedAccessState = disconnectedState;
                lastResolvedAt = Date.now();
                return disconnectedState;
            }

            nextState.address = address;
            nextState.isConnected = true;

            if (isBootstrapTeacherAddress(address)) {
                const bootstrapTeacherState = {
                    ...nextState,
                    role: "teacher",
                    roleLabel: "教員",
                    registeredBy: address,
                    registeredAt: 0,
                    isStudent: false,
                    canViewLive: true,
                    isTeacher: true,
                    hasProfile: true,
                    canBroadcastLive: true,
                    isAuthorizedUser: true,
                    canAnswerQuiz: true,
                    canJoinLive: true,
                    isLoading: false,
                };
                lastResolvedAccessState = bootstrapTeacherState;
                lastResolvedAt = Date.now();
                writeCachedAccessState(bootstrapTeacherState);
                return bootstrapTeacherState;
            }

            const [registrationSnapshot, roleSummaryResult, roleResult, isRegisteredResult, isTeacherResult, isStudentResult, userData] = await Promise.all([
                safeCall(cont, "getRegistrationDetails", address),
                safeCall(cont, "getRoleSummary", address),
                safeCall(cont, "getUserRole", address),
                safeCall(cont, "isRegistered", address),
                safeCall(cont, "isTeacher").then((value) => value === true),
                safeCall(cont, "isStudent", address),
                safeCall(cont, "get_user_data", address),
            ]);

            const normalizedRole = registrationSnapshot && typeof registrationSnapshot === "object" && registrationSnapshot.roleKey
                ? { key: registrationSnapshot.roleKey, label: registrationSnapshot.roleLabel || "未登録" }
                : roleSummaryResult && typeof roleSummaryResult === "object" && roleSummaryResult.roleKey
                ? { key: roleSummaryResult.roleKey, label: roleSummaryResult.roleLabel || "未登録" }
                : roleResult && typeof roleResult === "object"
                ? roleResult
                : isTeacherResult === true
                    ? { key: "teacher", label: "教員" }
                    : isStudentResult === true
                        ? { key: "student", label: "学生" }
                        : { key: "guest", label: "未登録" };

            nextState.role = normalizedRole.key;
            nextState.roleLabel = normalizedRole.label;
            nextState.registeredBy = String(registrationSnapshot?.addedBy || "");
            nextState.registeredAt = Number(registrationSnapshot?.addedAt || 0);
            nextState.isTeacher = registrationSnapshot?.isTeacher === true || roleSummaryResult?.isTeacher === true || normalizedRole.key === "teacher" || isTeacherResult === true;
            nextState.isStudent = registrationSnapshot?.isStudent === true || roleSummaryResult?.isStudent === true || normalizedRole.key === "student" || isStudentResult === true;
            nextState.hasProfile = Boolean(userData?.[3]);
            nextState.isAuthorizedUser = nextState.isTeacher
                || nextState.isStudent
                || Boolean(registrationSnapshot?.registered)
                || Boolean(roleSummaryResult?.registered)
                || Boolean(isRegisteredResult);
            nextState.canBroadcastLive = nextState.isTeacher;
            nextState.canViewLive = nextState.isConnected;
            nextState.canAnswerQuiz = nextState.isAuthorizedUser;
            nextState.canJoinLive = nextState.isAuthorizedUser;
        } catch (error) {
            console.error("Failed to resolve access state", error);
        }

        const resolvedState = {
            ...nextState,
            isLoading: false,
        };
        lastResolvedAccessState = resolvedState;
        lastResolvedAt = Date.now();
        if (resolvedState.address) {
            writeCachedAccessState(resolvedState);
        }
        return resolvedState;
    })();

    try {
        return await resolveAccessPromise;
    } finally {
        resolveAccessPromise = null;
    }
}

function useAccessControl(cont) {
    const cachedAccessStateRef = useRef(readCachedAccessState());
    const [accessState, setAccessState] = useState(() => cachedAccessStateRef.current || createDefaultAccessState());
    const loadInFlightRef = useRef(false);

    useEffect(() => {
        let active = true;

        const load = async ({ showLoading = false, allowSoftDisconnect = true } = {}) => {
            if (loadInFlightRef.current) return;
            loadInFlightRef.current = true;
            if (showLoading) {
                setAccessState((current) => ({ ...current, isLoading: true }));
            }
            try {
                const nextState = await resolveAccessState(cont);
                if (active) {
                    setAccessState((current) => {
                        const mergedState = mergeAccessState(current, nextState, { allowSoftDisconnect });
                        return isSameAccessState(current, mergedState) ? current : mergedState;
                    });
                }
            } finally {
                loadInFlightRef.current = false;
            }
        };

        load({ showLoading: !cachedAccessStateRef.current, allowSoftDisconnect: false });

        const handleRefresh = () => {
            if (document.visibilityState === "hidden") return;
            load({ showLoading: false, allowSoftDisconnect: true });
        };
        const handleWalletProviderChanged = () => {
            resetAccessStateCache();
            load({ showLoading: false, allowSoftDisconnect: false });
        };
        const interval = window.setInterval(() => {
            resetAccessStateCache();
            load({ showLoading: false, allowSoftDisconnect: true });
        }, 60000);
        window.addEventListener("focus", handleRefresh);
        document.addEventListener("visibilitychange", handleRefresh);
        window.addEventListener(WALLET_PROVIDER_CHANGED_EVENT, handleWalletProviderChanged);

        return () => {
            active = false;
            window.clearInterval(interval);
            window.removeEventListener("focus", handleRefresh);
            document.removeEventListener("visibilitychange", handleRefresh);
            window.removeEventListener(WALLET_PROVIDER_CHANGED_EVENT, handleWalletProviderChanged);
        };
    }, [cont]);

    return accessState;
}

export {
    mergeAccessState,
    resetAccessStateCache,
    resolveAccessState,
    useAccessControl,
};
