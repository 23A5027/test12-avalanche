function escapeXml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function escapeCsv(value) {
    const normalized = String(value ?? "");
    if (!/[",\n]/.test(normalized)) return normalized;
    return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function normalizeSheetName(name, index) {
    const fallback = `Sheet${index + 1}`;
    const raw = String(name || fallback).replace(/[\\/*?:[\]]/g, "_").trim() || fallback;
    return raw.slice(0, 31);
}

function getColumnKeys(rows = []) {
    const keys = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return;
        Object.keys(row).forEach((key) => keys.add(key));
    });
    return [...keys];
}

function toCell(value) {
    if (value == null) {
        return `<Cell><Data ss:Type="String"></Data></Cell>`;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
    }

    if (typeof value === "boolean") {
        return `<Cell><Data ss:Type="String">${value ? "true" : "false"}</Data></Cell>`;
    }

    return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function buildWorksheetXml(sheetName, rows = [], index = 0) {
    const columns = getColumnKeys(rows);
    const headerXml = columns.length > 0
        ? `<Row>${columns.map((key) => toCell(key)).join("")}</Row>`
        : `<Row>${toCell("no_data")}</Row>`;
    const bodyXml = columns.length > 0
        ? rows.map((row) => `<Row>${columns.map((key) => toCell(row?.[key])).join("")}</Row>`).join("")
        : `<Row>${toCell("データがありません")}</Row>`;

    return `
        <Worksheet ss:Name="${escapeXml(normalizeSheetName(sheetName, index))}">
            <Table>
                ${headerXml}
                ${bodyXml}
            </Table>
        </Worksheet>
    `;
}

function createWorkbookXml(sheets = []) {
    const worksheetXml = (Array.isArray(sheets) ? sheets : [])
        .map((sheet, index) => buildWorksheetXml(sheet?.name, sheet?.rows || [], index))
        .join("");

    return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
    <Styles>
        <Style ss:ID="Header">
            <Font ss:Bold="1"/>
        </Style>
    </Styles>
    ${worksheetXml}
</Workbook>`;
}

function createSectionedCsv(sections = []) {
    const lines = [];
    (Array.isArray(sections) ? sections : []).forEach((section) => {
        const rows = Array.isArray(section?.rows) ? section.rows : [];
        const columns = getColumnKeys(rows);
        lines.push([`[${String(section?.name || "section")}]`].join(","));
        if (columns.length > 0) {
            lines.push(columns.map((key) => escapeCsv(key)).join(","));
            rows.forEach((row) => {
                lines.push(columns.map((key) => escapeCsv(row?.[key])).join(","));
            });
        } else {
            lines.push("no_data");
        }
        lines.push("");
    });
    return lines.join("\n");
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadWorkbookXml(filename, sheets = []) {
    downloadTextFile(
        filename,
        createWorkbookXml(sheets),
        "application/vnd.ms-excel;charset=utf-8"
    );
}

export {
    createSectionedCsv,
    createWorkbookXml,
    downloadTextFile,
    downloadWorkbookXml,
};
