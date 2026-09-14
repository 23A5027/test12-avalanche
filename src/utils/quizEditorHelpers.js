function escapeHtml(value = "") {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function appendColoredText(content = "", text = "", color = "#ef4444") {
    const trimmedText = String(text || "").trim();
    if (!trimmedText) return String(content || "");

    const current = String(content || "").replace(/\s+$/, "");
    const nextLine = `<span style="color:${color}; font-weight:700;">${escapeHtml(trimmedText)}</span>`;
    return current ? `${current}\n\n${nextLine}` : nextLine;
}

export {
    appendColoredText,
    escapeHtml,
};
