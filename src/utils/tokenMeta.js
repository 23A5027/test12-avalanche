import { useEffect, useState } from "react";
import { token_address } from "../contract/config";

const TOKEN_SYMBOL_KEY = `web3_quiz_token_symbol_${String(token_address || "").toLowerCase()}`;
const DEFAULT_SYMBOL = "TOKEN";

function getStoredTokenSymbol() {
    try {
        return localStorage.getItem(TOKEN_SYMBOL_KEY) || DEFAULT_SYMBOL;
    } catch (error) {
        return DEFAULT_SYMBOL;
    }
}

function setStoredTokenSymbol(symbol) {
    const normalized = String(symbol || "").trim();
    if (!normalized) return DEFAULT_SYMBOL;
    try {
        localStorage.setItem(TOKEN_SYMBOL_KEY, normalized);
    } catch (error) {
    }
    return normalized;
}

async function resolveTokenSymbol(contract) {
    if (!contract || typeof contract.get_token_symbol !== "function") {
        return getStoredTokenSymbol();
    }

    try {
        const symbol = await contract.get_token_symbol();
        return setStoredTokenSymbol(symbol);
    } catch (error) {
        return getStoredTokenSymbol();
    }
}

function useTokenSymbol(contract, fallback = DEFAULT_SYMBOL) {
    const [tokenSymbol, setTokenSymbol] = useState(() => getStoredTokenSymbol() || fallback);

    useEffect(() => {
        let mounted = true;
        resolveTokenSymbol(contract).then((symbol) => {
            if (mounted) {
                setTokenSymbol(symbol || fallback);
            }
        });
        return () => {
            mounted = false;
        };
    }, [contract, fallback]);

    return tokenSymbol || fallback;
}

export {
    DEFAULT_SYMBOL,
    getStoredTokenSymbol,
    resolveTokenSymbol,
    setStoredTokenSymbol,
    useTokenSymbol,
};
