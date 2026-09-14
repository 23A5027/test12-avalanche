import React, { useState } from "react";
import Add_students from "./components/add_student";
import Add_teacher from "./components/add_teacher";
import View_result from "./components/view_results";
import View_answers from "./components/view_answers";
import Analytics_dashboard from "./components/analytics_dashboard";
import View_live_history from "./components/view_live_history";
import Course_operations_panel from "./components/course_operations_panel";
import Token_grant_panel from "./components/token_grant_panel";
import Reward_burn_panel from "./components/reward_burn_panel";
import Platform_export_panel from "./components/platform_export_panel";
import Bulk_reward_panel from "./components/bulk_reward_panel";
import { useAccessControl } from "../../utils/accessControl";
import "./admin.css";

function Admin_page(props) {
    const [component, setComponent] = useState("Add_students");
    const access = useAccessControl(props.cont);
    const isTeacher = access.isTeacher;

    if (access.isLoading) {
        return <div className="admin-not-authorized">権限を確認中です...</div>;
    }

    if (!isTeacher) {
        return <div className="admin-not-authorized">このページは教員アカウント専用です。</div>;
    }

    return (
        <div className="admin-page">
            <div className="page-header">
                <h1 className="page-title">管理パネル</h1>
                <p className="page-subtitle">学生管理、成績確認、分析ログ出力をまとめて扱えます。</p>
            </div>

            <div className="admin-tabs">
                <button className={`admin-tab-btn ${component === "Add_students" ? "active" : ""}`} onClick={() => setComponent("Add_students")}>学生を追加</button>
                <button className={`admin-tab-btn ${component === "Add_teacher" ? "active" : ""}`} onClick={() => setComponent("Add_teacher")}>教員を追加</button>
                <button className={`admin-tab-btn ${component === "Token_grant" ? "active" : ""}`} onClick={() => setComponent("Token_grant")}>トークン付与</button>
                <button className={`admin-tab-btn ${component === "Bulk_reward" ? "active" : ""}`} onClick={() => setComponent("Bulk_reward")}>全問題一括報酬配布</button>
                <button className={`admin-tab-btn ${component === "Platform_export" ? "active" : ""}`} onClick={() => setComponent("Platform_export")}>全体出力</button>
                <button className={`admin-tab-btn ${component === "Reward_burn" ? "active" : ""}`} onClick={() => setComponent("Reward_burn")}>報酬バーン</button>
                <button className={`admin-tab-btn ${component === "View_result" ? "active" : ""}`} onClick={() => setComponent("View_result")}>成績を見る</button>
                <button className={`admin-tab-btn ${component === "View_answers" ? "active" : ""}`} onClick={() => setComponent("View_answers")}>回答を見る</button>
                <button className={`admin-tab-btn ${component === "Live_history" ? "active" : ""}`} onClick={() => setComponent("Live_history")}>掲示板監視</button>
                <button className={`admin-tab-btn ${component === "Analytics" ? "active" : ""}`} onClick={() => setComponent("Analytics")}>分析ログ</button>
                <button className={`admin-tab-btn ${component === "Operations" ? "active" : ""}`} onClick={() => setComponent("Operations")}>運営補助</button>
            </div>

            <div className="admin-panel">
                {component === "Add_students" && <Add_students cont={props.cont} />}
                {component === "Add_teacher" && <Add_teacher cont={props.cont} />}
                {component === "Token_grant" && <Token_grant_panel cont={props.cont} />}
                {component === "Bulk_reward" && <Bulk_reward_panel cont={props.cont} />}
                {component === "Platform_export" && <Platform_export_panel cont={props.cont} />}
                {component === "Reward_burn" && <Reward_burn_panel cont={props.cont} />}
                {component === "View_result" && <View_result cont={props.cont} />}
                {component === "View_answers" && <View_answers cont={props.cont} />}
                {component === "Live_history" && <View_live_history />}
                {component === "Analytics" && <Analytics_dashboard cont={props.cont} />}
                {component === "Operations" && <Course_operations_panel cont={props.cont} />}
            </div>
        </div>
    );
}

export default Admin_page;
