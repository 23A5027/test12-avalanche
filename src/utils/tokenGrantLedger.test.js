import {
    TOKEN_GRANT_KEYS,
    clearGrantedToken,
    getAddressGrantStatus,
    hasGrantedToken,
    markGrantedToken,
} from "./tokenGrantLedger";

describe("tokenGrantLedger", () => {
    const address = "0x1111111111111111111111111111111111111111";

    beforeEach(() => {
        localStorage.clear();
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-05-27T10:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("does not treat failed pending starter-token grants as permanently granted", () => {
        markGrantedToken(address, TOKEN_GRANT_KEYS.TFT, {
            grantedAt: new Date().toISOString(),
            amount: 50,
            txHash: "",
            source: "bulk_pending",
            confirmed: false,
        });

        expect(hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT)).toBe(true);

        jest.advanceTimersByTime(10 * 60 * 1000 + 1000);

        expect(hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT)).toBe(false);
    });

    test("keeps confirmed grants active until explicitly cleared", () => {
        markGrantedToken(address, TOKEN_GRANT_KEYS.TFT, {
            grantedAt: new Date().toISOString(),
            amount: 50,
            txHash: "0xabc",
            source: "bulk_selected",
            confirmed: true,
        });

        jest.advanceTimersByTime(10 * 60 * 1000 + 1000);

        expect(hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT)).toBe(true);

        clearGrantedToken(address, TOKEN_GRANT_KEYS.TFT, {
            grantedAt: new Date().toISOString(),
            amount: 50,
            source: "manual_clear",
        });

        expect(hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT)).toBe(false);
        expect(getAddressGrantStatus(address)[TOKEN_GRANT_KEYS.TFT]?.active).toBe(false);
    });
});
