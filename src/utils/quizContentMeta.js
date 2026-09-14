const QUIZ_META_PREFIX = "<!--web3quiz:";
const QUIZ_META_SUFFIX = "-->";

function createDefaultQuizContentMeta() {
    return {
        allowMultipleAnswers: false,
    };
}

function parseQuizContentMeta(rawContent = "") {
    const content = String(rawContent || "");
    const defaults = createDefaultQuizContentMeta();

    if (!content.startsWith(QUIZ_META_PREFIX)) {
        return defaults;
    }

    const endIndex = content.indexOf(QUIZ_META_SUFFIX);
    if (endIndex === -1) {
        return defaults;
    }

    const serialized = content.slice(QUIZ_META_PREFIX.length, endIndex).trim();
    try {
        const parsed = JSON.parse(serialized);
        return {
            allowMultipleAnswers: Boolean(parsed?.allowMultipleAnswers),
        };
    } catch (error) {
        return defaults;
    }
}

function stripQuizContentMeta(rawContent = "") {
    const content = String(rawContent || "");
    if (!content.startsWith(QUIZ_META_PREFIX)) {
        return content;
    }

    const endIndex = content.indexOf(QUIZ_META_SUFFIX);
    if (endIndex === -1) {
        return content;
    }

    return content.slice(endIndex + QUIZ_META_SUFFIX.length).replace(/^\s+/, "");
}

function withQuizContentMeta(rawContent = "", meta = {}) {
    const content = stripQuizContentMeta(rawContent);
    const payload = {
        allowMultipleAnswers: Boolean(meta?.allowMultipleAnswers),
    };

    return `${QUIZ_META_PREFIX}${JSON.stringify(payload)}${QUIZ_META_SUFFIX}\n${content}`;
}

export {
    createDefaultQuizContentMeta,
    parseQuizContentMeta,
    stripQuizContentMeta,
    withQuizContentMeta,
};
