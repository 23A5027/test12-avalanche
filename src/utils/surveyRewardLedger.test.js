import {
    buildSurveyRewardStatusMap,
    hasSurveyRewardBeenGranted,
    hasSurveyRewardReserved,
    normalizeCampaignKey,
} from "./surveyRewardLedger";

describe("surveyRewardLedger", () => {
    beforeEach(() => {
        localStorage.clear();
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("allows repeated TFT grants across different survey campaigns", () => {
        const address = "0x1111111111111111111111111111111111111111";
        const campaignOne = normalizeCampaignKey("第1回アンケート");
        const campaignTwo = normalizeCampaignKey("第2回アンケート");
        const entries = [
            {
                id: "grant-1",
                address,
                campaignKey: campaignOne,
                campaignLabel: "第1回アンケート",
                amount: 50,
                txHash: "0xabc",
                createdAt: new Date().toISOString(),
                type: "grant",
                confirmed: true,
            },
        ];

        expect(hasSurveyRewardBeenGranted(address, campaignOne, entries)).toBe(true);
        expect(hasSurveyRewardBeenGranted(address, campaignTwo, entries)).toBe(false);
    });

    test("does not treat expired pending survey reward records as permanently reserved", () => {
        const address = "0x1111111111111111111111111111111111111111";
        const campaign = normalizeCampaignKey("第1回アンケート");
        const entries = [
            {
                id: "pending-1",
                address,
                campaignKey: campaign,
                campaignLabel: "第1回アンケート",
                amount: 50,
                createdAt: new Date().toISOString(),
                type: "pending",
                confirmed: false,
            },
        ];

        expect(hasSurveyRewardReserved(address, campaign, entries)).toBe(true);

        jest.advanceTimersByTime(10 * 60 * 1000 + 1000);

        expect(hasSurveyRewardReserved(address, campaign, entries)).toBe(false);
    });

    test("status map keeps the latest event for each survey campaign and student", () => {
        const address = "0x1111111111111111111111111111111111111111";
        const campaign = normalizeCampaignKey("第1回アンケート");
        const entries = [
            {
                id: "pending-1",
                address,
                campaignKey: campaign,
                campaignLabel: "第1回アンケート",
                amount: 50,
                createdAt: "2026-06-10T10:00:00.000Z",
                type: "pending",
                confirmed: false,
            },
            {
                id: "grant-1",
                address,
                campaignKey: campaign,
                campaignLabel: "第1回アンケート",
                amount: 50,
                txHash: "0xabc",
                createdAt: "2026-06-10T10:01:00.000Z",
                type: "grant",
                confirmed: true,
            },
        ];

        const statusMap = buildSurveyRewardStatusMap(entries);
        const status = statusMap.get(`${campaign}:${address}`);

        expect(status?.latestEntry?.type).toBe("grant");
        expect(status?.history).toHaveLength(2);
    });
});
