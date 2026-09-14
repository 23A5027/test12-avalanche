import { createSectionedCsv, createWorkbookXml } from "./platformExport";

describe("platformExport", () => {
    test("creates workbook xml with multiple sheets", () => {
        const xml = createWorkbookXml([
            { name: "Students", rows: [{ name: "学生A", score: 1.5 }] },
            { name: "Answers", rows: [{ quiz_id: 1, answer_text: "1/6" }] },
        ]);

        expect(xml).toContain('<Worksheet ss:Name="Students">');
        expect(xml).toContain('<Worksheet ss:Name="Answers">');
        expect(xml).toContain("学生A");
        expect(xml).toContain("1/6");
    });

    test("creates sectioned csv with headers and section titles", () => {
        const csv = createSectionedCsv([
            { name: "Students", rows: [{ name: "学生A", score: 1.5 }] },
            { name: "Answers", rows: [{ quiz_id: 1, answer_text: "1/6" }] },
        ]);

        expect(csv).toContain("[Students]");
        expect(csv).toContain("name,score");
        expect(csv).toContain("[Answers]");
        expect(csv).toContain("quiz_id,answer_text");
    });
});
