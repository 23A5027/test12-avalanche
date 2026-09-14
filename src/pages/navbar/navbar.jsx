import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { AiOutlineUnorderedList, AiOutlineUser } from "react-icons/ai";
import { FaTrophy } from "react-icons/fa";
import { IoNotificationsOutline } from "react-icons/io5";
import { MdDashboard, MdOutlineQuiz } from "react-icons/md";
import { RiFileSettingsLine, RiMessage2Line } from "react-icons/ri";
import Modal_change_network from "./Modal_change_network";
import { useAccessControl } from "../../utils/accessControl";
import { WALLET_PROVIDER_CHANGED_EVENT } from "../../contract/contractClients";
import "./navbar.css";

function Nav_menu(props) {
    const [useing_address, Set_useing_address] = useState(() => props.cont?.get_last_known_address?.() || null);
    const [chain_id, setChain_id] = useState(null);
    const access = useAccessControl(props.cont);

    useEffect(() => {
        const get_variable = async () => {
            const [nextChainId, nextAddress] = await Promise.all([
                props.cont.get_chain_id(),
                props.cont?.get_last_known_address?.()
                    ? Promise.resolve(props.cont.get_last_known_address())
                    : props.cont.get_address(),
            ]);
            if (nextChainId != null) {
                setChain_id(nextChainId);
            }
            if (nextAddress) {
                Set_useing_address(nextAddress);
            }
        };
        get_variable();

        window.addEventListener(WALLET_PROVIDER_CHANGED_EVENT, get_variable);
        return () => {
            window.removeEventListener(WALLET_PROVIDER_CHANGED_EVENT, get_variable);
        };
    }, [props.cont]);

    useEffect(() => {
        Set_useing_address(access.address || props.cont?.get_last_known_address?.() || null);
    }, [access.address, props.cont]);

    return (
        <>
            <Modal_change_network chain_id={chain_id} cont={props.cont} />
            <nav className="bottom-nav">
                <div className="nav-inner">
                    <NavLink
                        to="/dashboard"
                        className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                    >
                        <MdDashboard className="nav-icon" />
                        <span className="nav-label">ホーム</span>
                    </NavLink>

                    <NavLink
                        to="/list_quiz"
                        className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                    >
                        <AiOutlineUnorderedList className="nav-icon" />
                        <span className="nav-label">クイズ</span>
                    </NavLink>

                    <NavLink
                        to="/ranking"
                        className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                    >
                        <FaTrophy className="nav-icon" />
                        <span className="nav-label">ランキング</span>
                    </NavLink>

                    {access.canViewLive && (
                        <NavLink
                            to="/live"
                            className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                        >
                            <RiMessage2Line className="nav-icon" />
                            <span className="nav-label">掲示板</span>
                        </NavLink>
                    )}

                    <NavLink
                        to="/notifications"
                        className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                    >
                        <IoNotificationsOutline className="nav-icon" />
                        <span className="nav-label">通知</span>
                    </NavLink>

                    {access.isTeacher && (
                        <NavLink
                            to="/create_quiz"
                            className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                        >
                            <MdOutlineQuiz className="nav-icon" />
                            <span className="nav-label">作成</span>
                        </NavLink>
                    )}

                    <NavLink
                        to={`/user_page/${useing_address}`}
                        className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                    >
                        <AiOutlineUser className="nav-icon" />
                        <span className="nav-label">マイページ</span>
                    </NavLink>

                    {access.isTeacher && (
                        <NavLink
                            to="/edit_list"
                            className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                        >
                            <RiFileSettingsLine className="nav-icon" />
                            <span className="nav-label">管理</span>
                        </NavLink>
                    )}
                </div>
            </nav>
        </>
    );
}

export default Nav_menu;
