import {
    legacy_current_route_address,
    legacy_quiz_addresses,
    quiz_address,
    routed_quiz_addresses,
} from "../contract/config";

function normalizeAddress(value = "") {
    return String(value || "").trim().toLowerCase();
}

const uniqueLegacyAddresses = (legacy_quiz_addresses || []).filter(
    (address, index, list) => {
        const normalized = normalizeAddress(address);
        return Boolean(normalized) && list.findIndex((item) => normalizeAddress(item) === normalized) === index;
    }
);

const uniqueRoutedAddresses = (routed_quiz_addresses || []).filter(
    (address, index, list) => {
        const normalized = normalizeAddress(address);
        return Boolean(normalized) && list.findIndex((item) => normalizeAddress(item) === normalized) === index;
    }
);

const LEGACY_ADDRESS = uniqueLegacyAddresses[0] || "";

// Backward-compatible mapping for older numeric URLs that were already shared.
const LEGACY_NUMERIC_MAPPED_QUIZZES = [
    { address: LEGACY_ADDRESS, id: 0 },
    { address: LEGACY_ADDRESS, id: 1 },
    { address: LEGACY_ADDRESS, id: 2 },
    { address: LEGACY_ADDRESS, id: 3 },
    { address: LEGACY_ADDRESS, id: 4 },
    { address: LEGACY_ADDRESS, id: 5 },
    { address: LEGACY_ADDRESS, id: 6 },
    { address: quiz_address, id: 0 },
    { address: quiz_address, id: 3 },
    { address: quiz_address, id: 4 },
    { address: quiz_address, id: 5 },
    { address: quiz_address, id: 6 },
];

export function toGlobalId(localId, sourceAddress) {
    const normAddress = normalizeAddress(sourceAddress || quiz_address);
    const numericLocalId = Number(localId);

    if (!Number.isFinite(numericLocalId) || numericLocalId < 0) {
        return String(localId ?? "");
    }

    const routedIndex = uniqueRoutedAddresses.findIndex(
        (address) => normalizeAddress(address) === normAddress
    );
    if (routedIndex >= 0) {
        return `q${routedIndex}-${numericLocalId}`;
    }

    const legacyIndex = uniqueLegacyAddresses.findIndex(
        (address) => normalizeAddress(address) === normAddress
    );
    if (legacyIndex >= 0) {
        return `l${legacyIndex}-${numericLocalId}`;
    }

    return `u-${normAddress}-${numericLocalId}`;
}

export function resolveGlobalId(globalId) {
    const raw = String(globalId ?? "").trim();

    const currentMatch = raw.match(/^c-(\d+)$/i);
    if (currentMatch) {
        return {
            address: legacy_current_route_address || quiz_address,
            id: Number(currentMatch[1]),
        };
    }

    const routedMatch = raw.match(/^q(\d+)-(\d+)$/i);
    if (routedMatch) {
        const routedAddress = uniqueRoutedAddresses[Number(routedMatch[1])] || quiz_address;
        return {
            address: routedAddress,
            id: Number(routedMatch[2]),
        };
    }

    const legacyMatch = raw.match(/^l(\d+)-(\d+)$/i);
    if (legacyMatch) {
        const legacyAddress = uniqueLegacyAddresses[Number(legacyMatch[1])] || quiz_address;
        return {
            address: legacyAddress,
            id: Number(legacyMatch[2]),
        };
    }

    const customMatch = raw.match(/^u-(0x[a-f0-9]+)-(\d+)$/i);
    if (customMatch) {
        return {
            address: customMatch[1],
            id: Number(customMatch[2]),
        };
    }

    const numericGlobalId = Number(raw);
    if (Number.isFinite(numericGlobalId) && numericGlobalId >= 0) {
        if (numericGlobalId < LEGACY_NUMERIC_MAPPED_QUIZZES.length) {
            return LEGACY_NUMERIC_MAPPED_QUIZZES[numericGlobalId];
        }

        const offset = numericGlobalId - LEGACY_NUMERIC_MAPPED_QUIZZES.length;
        return {
            address: quiz_address,
            id: 7 + offset,
        };
    }

    return { id: Number(raw) || 0, address: quiz_address };
}
