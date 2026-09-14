import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";

function formatInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function Add_teacher(props) {
    const [addTeacher, setAddTeacher] = useState("");
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitError, setSubmitError] = useState("");
    const normalizedAddress = useMemo(
        () => props.cont.normalizeAddressList([addTeacher.trim()])[0] || "",
        [addTeacher, props.cont]
    );
    const duplicateDetail = useMemo(() => {
        if (!normalizedAddress) return null;
        const normalized = props.cont.normalizeAddress(normalizedAddress);
        const teacherIndex = (teachers || []).findIndex((item) => props.cont.normalizeAddress(item) === normalized);
        if (teacherIndex >= 0) {
            return {
                address: normalizedAddress,
                roleLabel: "教員",
                internalId: formatInternalId("STAFF", teacherIndex),
            };
        }
        const studentIndex = (students || []).findIndex((item) => props.cont.normalizeAddress(item) === normalized);
        if (studentIndex >= 0) {
            return {
                address: normalizedAddress,
                roleLabel: "学生",
                internalId: formatInternalId("USER", studentIndex),
            };
        }
        return null;
    }, [normalizedAddress, teachers, students, props.cont]);

    async function loadTeachers() {
        try {
            const [teacherResult, studentResult] = await Promise.all([
                props.cont.get_teachers(),
                props.cont.get_student_list(),
            ]);
            setTeachers(Array.isArray(teacherResult) ? teacherResult : []);
            setStudents(Array.isArray(studentResult) ? studentResult : []);
        } catch (error) {
            console.error("Failed to load teachers", error);
            setTeachers([]);
            setStudents([]);
        }
    }

    async function add_teacher() {
        if (!addTeacher.trim()) return;
        try {
            if (!normalizedAddress) {
                setSubmitError("有効なウォレットアドレスを入力してください。");
                return;
            }
            const registered = new Set([...(teachers || []), ...(students || [])].map((item) => props.cont.normalizeAddress(item)));
            if (registered.has(props.cont.normalizeAddress(normalizedAddress))) {
                setSubmitError("このアドレスはすでに学生または教員として登録済みです。");
                return;
            }
            setSubmitError("");
            await props.cont.add_teacher(normalizedAddress);
            appendActivityLog(ACTION_TYPES.ADMIN_ADD_TEACHER, {
                page: "admin",
                address: normalizedAddress,
            });
            setAddTeacher("");
            await loadTeachers();
        } catch (error) {
            console.error("Failed to add teacher", error);
            setSubmitError(error?.message || "先生 / TA の追加に失敗しました。");
        }
    }

    useEffect(() => {
        loadTeachers();
    }, [props.cont]);

    return (
        <div>
            <h3 className="section-title">先生 / TA を追加</h3>
            <p className="section-desc">
                追加する教員側アカウントのウォレットアドレスを入力してください。現在のコントラクトでは TA・先生・教授はまとめて `教員` として扱います。
            </p>

            <Form>
                <Form.Group controlId="form_teacher" style={{ textAlign: "left" }}>
                    <Form.Label>ウォレットアドレス</Form.Label>
                    <Form.Control
                        type="text"
                        value={addTeacher}
                        onChange={(event) => setAddTeacher(event.target.value)}
                        placeholder="0x1234..."
                    />
                </Form.Group>
            </Form>

            {duplicateDetail && (
                <div className="address-list" style={{ marginBottom: "var(--space-4)" }}>
                    <div className="address-list-title">このアドレスはすでに登録済みです</div>
                    <div className="address-item">
                        <div className="address-item-id">{duplicateDetail.internalId}</div>
                        <div>
                            <div>{duplicateDetail.address}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                                既登録: {duplicateDetail.roleLabel}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {submitError && (
                <div className="address-item" style={{ borderLeftColor: "#ff7b72", color: "#ffd7d7", marginBottom: "var(--space-4)" }}>
                    {submitError}
                </div>
            )}

            <button className="btn-action" onClick={add_teacher}>
                先生 / TA をコントラクトに追加
            </button>

            <div className="address-list" style={{ marginTop: "var(--space-8)" }}>
                <div className="address-list-title">登録済み先生 / TA ({teachers.length}件)</div>
                {teachers.length === 0 ? (
                    <div className="address-item">登録済みの先生 / TA はまだありません。</div>
                ) : (
                    teachers.map((item, index) => (
                        <div key={`${item}-${index}`} className="address-item">
                            <div className="address-item-id">{formatInternalId("STAFF", index)}</div>
                            <div>{item}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Add_teacher;
