const PROFANITY_PATTERNS = [
    /ばか/i,
    /あほ/i,
    /死ね/i,
    /殺す/i,
    /くそ/i,
    /fuck/i,
    /shit/i,
    /bitch/i,
    /spam/i,
    /死\s*ね/i,
];

const URL_PATTERN = /(https?:\/\/|www\.)/i;
const REPEATED_CHARACTER_PATTERN = /(.)\1{7,}/;
const FALLBACK_EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function countEmojiCharacters(text) {
    try {
        return [...text].filter((char) => /\p{Extended_Pictographic}/u.test(char)).length;
    } catch (error) {
        return [...text].filter((char) => FALLBACK_EMOJI_PATTERN.test(char)).length;
    }
}

function scoreComment(text) {
    const normalized = String(text || "").trim();
    const categories = [];
    let score = 0;

    if (!normalized) {
        return { blocked: true, score: 100, categories: ["empty"], reason: "コメントが空です。" };
    }

    if (PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
        score += 80;
        categories.push("abuse");
    }

    if (URL_PATTERN.test(normalized)) {
        score += 30;
        categories.push("link");
    }

    if (REPEATED_CHARACTER_PATTERN.test(normalized)) {
        score += 35;
        categories.push("spam");
    }

    if (normalized.length > 160) {
        score += 20;
        categories.push("long");
    }

    const uniqueChars = new Set(normalized).size;
    if (normalized.length >= 12 && uniqueChars <= 3) {
        score += 40;
        categories.push("repetition");
    }

    const emojiCount = countEmojiCharacters(normalized);
    if (emojiCount >= 8) {
        score += 20;
        categories.push("emoji_spam");
    }

    if (normalized.split(/\s+/).length >= 12 && normalized.length < 30) {
        score += 15;
        categories.push("token_spam");
    }

    const blocked = score >= 60;
    let reason = "";
    if (categories.includes("abuse")) {
        reason = "不適切な表現が含まれています。";
    } else if (categories.includes("spam")) {
        reason = "スパムと判断されるため送信できません。";
    } else if (categories.includes("link")) {
        reason = "リンクを含むコメントは送信できません。";
    } else if (blocked) {
        reason = "コメント内容を確認してください。";
    }

    return {
        blocked,
        score,
        categories,
        reason,
    };
}

function moderateLiveComment(text) {
    return scoreComment(text);
}

export {
    moderateLiveComment,
};
