import React from "react";
import "./wait_Modal.css";
import { Link } from "react-router-dom";

const Wait_Modal = (props) => {
    return (
        <>
            {props.showFlag ? (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-content-box animate-scaleIn glass-card">
                        {/* Loading Animation */}
                        <div className="tx-loading">
                            <div className="tx-ring">
                                <div className="tx-ring-inner animate-spin"></div>
                            </div>
                        </div>

                        {/* Status Text */}
                        <div className="tx-status">
                            <h3 className="tx-title">
                                {props.content || "ブロックチェーンに書き込み中..."}
                            </h3>
                            <p className="tx-description">
                                トランザクションが完了するまでお待ちください。
                                <br />
                                別のページに移動しても問題ありません。
                            </p>
                        </div>

                        {/* Action */}
                        <Link to="/list_quiz" className="btn-primary-custom" style={{ textDecoration: "none", textAlign: "center", display: "block" }}>
                            トップページに戻る
                        </Link>
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default Wait_Modal;
