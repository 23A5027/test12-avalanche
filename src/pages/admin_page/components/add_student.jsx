import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";

function formatInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function Add_students(props) {
    const [addStudent, setAddStudent] = useState("");
    const [students, setStudents] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [submitError, setSubmitError] = useState("");
    const addStudent_list = useMemo(
        () => addStudent.split("\n").map((item) => item.trim()).filter(Boolean),
        [addStudent]
    );
    const normalizedCandidates = useMemo(
        () => props.cont.normalizeAddressList(addStudent_list),
        [addStudent_list, props.cont]
    );
    const registeredAddressSet = useMemo(
        () => new Set([...(students || []), ...(teachers || [])].map((item) => props.cont.normalizeAddress(item))),
        [students, teachers, props.cont]
    );
    const duplicateRegisteredAddresses = useMemo(
        () => normalizedCandidates.filter((item) => registeredAddressSet.has(props.cont.normalizeAddress(item))),
        [normalizedCandidates, registeredAddressSet, props.cont]
    );
    const duplicateRegisteredDetails = useMemo(
        () => duplicateRegisteredAddresses.map((address) => {
            const normalized = props.cont.normalizeAddress(address);
            const teacherIndex = (teachers || []).findIndex((item) => props.cont.normalizeAddress(item) === normalized);
            if (teacherIndex >= 0) {
                return {
                    address,
                    roleLabel: "教員",
                    internalId: formatInternalId("STAFF", teacherIndex),
                };
            }
            const studentIndex = (students || []).findIndex((item) => props.cont.normalizeAddress(item) === normalized);
            if (studentIndex >= 0) {
                return {
                    address,
                    roleLabel: "学生",
                    internalId: formatInternalId("USER", studentIndex),
                };
            }
            return {
                address,
                roleLabel: "登録済みユーザー",
                internalId: "-",
            };
        }),
        [duplicateRegisteredAddresses, teachers, students, props.cont]
    );
    const newStudentTargets = useMemo(
        () => normalizedCandidates.filter((item) => !registeredAddressSet.has(props.cont.normalizeAddress(item))),
        [normalizedCandidates, registeredAddressSet, props.cont]
    );

    const loadStudents = async () => {
        try {
            const [studentResult, teacherResult] = await Promise.all([
                props.cont.get_student_list(),
                props.cont.get_teachers(),
            ]);
            setStudents(Array.isArray(studentResult) ? studentResult : []);
            setTeachers(Array.isArray(teacherResult) ? teacherResult : []);
        } catch (error) {
            console.error("Failed to load registered students", error);
            setStudents([]);
            setTeachers([]);
        }
    };

    const add_student = async () => {
        if (!addStudent_list.length) return;
        if (!newStudentTargets.length) {
            setSubmitError("入力したアドレスはすべて既登録です。重複登録は行いません。");
            return;
        }
        try {
            setSubmitError("");
            await props.cont.add_student(newStudentTargets);
            appendActivityLog(ACTION_TYPES.ADMIN_ADD_STUDENT, {
                page: "admin",
                count: newStudentTargets.length,
                skippedCount: duplicateRegisteredAddresses.length,
            });
            setAddStudent("");
            await loadStudents();
        } catch (error) {
            console.error("Failed to add students", error);
            setSubmitError(error?.message || "学生の追加に失敗しました。");
        }
    };

    useEffect(() => {
        loadStudents();
    }, [props.cont]);

    return (
        <div>
            <h3 className="section-title">学生を追加</h3>
            <p className="section-desc">追加する学生のウォレットアドレスを改行区切りで入力してください。下側で登録済み学生も確認できます。</p>

            <Form.Group style={{ textAlign: "left", marginBottom: "var(--space-4)" }}>
                <Form.Label>ウォレットアドレス一覧</Form.Label>
                <Form.Control
                    as="textarea"
                    rows={Math.max(addStudent.split("\n").length + 3, 6)}
                    value={addStudent}
                    onChange={(event) => setAddStudent(event.target.value)}
                    placeholder={"0x1234...\n0x5678..."}
                />
            </Form.Group>

            {addStudent_list.length > 0 && (
                <div className="address-list">
                    <div className="address-list-title">入力アドレス ({normalizedCandidates.length}件)</div>
                    {normalizedCandidates.map((item, index) => (
                        <div key={`${item}-${index}`} className="address-item">{item}</div>
                    ))}
                </div>
            )}

            {duplicateRegisteredAddresses.length > 0 && (
                <div className="address-list" style={{ marginTop: "var(--space-4)" }}>
                    <div className="address-list-title">既登録のため追加しないアドレス ({duplicateRegisteredAddresses.length}件)</div>
                    {duplicateRegisteredDetails.map((item, index) => (
                        <div key={`${item.address}-duplicate-${index}`} className="address-item">
                            <div className="address-item-id">{item.internalId}</div>
                            <div>
                                <div>{item.address}</div>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                                    既登録: {item.roleLabel}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {submitError && (
                <div className="address-item" style={{ borderLeftColor: "#ff7b72", color: "#ffd7d7", marginTop: "var(--space-4)" }}>
                    {submitError}
                </div>
            )}

            <button className="btn-action" onClick={add_student}>
                学生をコントラクトに追加
            </button>

            <div className="address-list" style={{ marginTop: "var(--space-8)" }}>
                <div className="address-list-title">登録済み学生 ({students.length}件)</div>
                {students.length === 0 ? (
                    <div className="address-item">登録済み学生はまだありません。</div>
                ) : (
                    students.map((item, index) => (
                        <div key={`${item}-${index}`} className="address-item">
                            <div className="address-item-id">{formatInternalId("USER", index)}</div>
                            <div>{item}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Add_students;
