import { useEffect, useState } from "react";
import Answer_area1 from "./answer_form1";
import Answer_area2 from "./answer_form2";

function Answer_select(props) {
    const [component, setComponent] = useState(props.answer_type === 1 ? "Answer_area2" : "Answer_area1");

    useEffect(() => {
        setComponent(props.answer_type === 1 ? "Answer_area2" : "Answer_area1");
    }, [props.answer_type]);

    const handleClick = (event) => {
        const {name} = event.target;
        setComponent(name);
        if (name === "Answer_area1") {
            props.setAnswer_type(0);
        } else if (name === "Answer_area2") {
            props.setAnswer_type(1);
        }
    };

    return (
        <div>
            <div className="btn-group" style={{margin: "20px"}}>
                <button
                    type="button"
                    name="Answer_area1"
                    className={`btn ${component === "Answer_area1" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={handleClick}
                >
                    択一形式
                </button>
            </div>
            <div className="btn-group" style={{margin: "20px"}}>
                <button
                    type="button"
                    name="Answer_area2"
                    className={`btn ${component === "Answer_area2" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={handleClick}
                >
                    入力形式
                </button>
            </div>

            <div style={{ color: "var(--text-primary)" }}>
                {component === "Answer_area1" && <Answer_area1 name={"択一形式"} variable={props.variable} variable1={props.variable1} set={props.set} set1={props.set1} />}
                {component === "Answer_area2" && <Answer_area2 name={"入力形式"} variable={props.variable} variable1={props.variable1} set={props.set} set1={props.set1} />}
            </div>
        </div>
    );
}
export default Answer_select;
