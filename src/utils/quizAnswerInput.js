export const QUIZ_INPUT_MODE_REGEX = "regex";
export const QUIZ_INPUT_MODE_PLAIN = "plain";

export function createDefaultQuizInputConfig() {
    return {
        inputMode: QUIZ_INPUT_MODE_REGEX,
        pattern: "",
        placeholder: "",
        example: "",
    };
}

export function parseQuizInputAnswerData(rawValue) {
    const defaultConfig = createDefaultQuizInputConfig();
    const serialized = Array.isArray(rawValue) ? rawValue[0] || "" : String(rawValue || "");

    if (!serialized) {
        return defaultConfig;
    }

    try {
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === "object") {
            const inputMode = parsed.inputMode === QUIZ_INPUT_MODE_PLAIN ? QUIZ_INPUT_MODE_PLAIN : QUIZ_INPUT_MODE_REGEX;
            return {
                inputMode,
                pattern: String(parsed.pattern || ""),
                placeholder: String(parsed.placeholder || ""),
                example: String(parsed.example || ""),
            };
        }
    } catch (error) {
        // Legacy quizzes still store "pattern,example" as plain text.
    }

    const legacyParts = serialized.split(",");
    const legacyPattern = legacyParts.shift() || "";
    const legacyExample = legacyParts.join(",");
    return {
        inputMode: QUIZ_INPUT_MODE_REGEX,
        pattern: legacyPattern,
        placeholder: "",
        example: legacyExample,
    };
}

export function encodeQuizInputAnswerData(config) {
    return JSON.stringify({
        inputMode: config.inputMode === QUIZ_INPUT_MODE_PLAIN ? QUIZ_INPUT_MODE_PLAIN : QUIZ_INPUT_MODE_REGEX,
        pattern: String(config.pattern || ""),
        placeholder: String(config.placeholder || ""),
        example: String(config.example || ""),
    });
}

export function isRegexPatternValid(pattern) {
    if (!pattern) {
        return false;
    }

    try {
        new RegExp(pattern);
        return true;
    } catch (error) {
        return false;
    }
}

export function testRegexPattern(pattern, value) {
    if (!isRegexPatternValid(pattern)) {
        return false;
    }

    try {
        return new RegExp(pattern).test(value);
    } catch (error) {
        return false;
    }
}
