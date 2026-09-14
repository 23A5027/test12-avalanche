import {Contracts_MetaMask} from "../../../contract/contracts";
import Form from "react-bootstrap/Form";
import {useState, useEffect} from "react";
import MDEditor, {selectWord} from "@uiw/react-md-editor";
import {useParams} from "react-router-dom";
import Button from "react-bootstrap/Button";
import { QUIZ_INPUT_MODE_PLAIN, parseQuizInputAnswerData, testRegexPattern } from "../../../utils/quizAnswerInput";
function Answer_type1(props) {
    return (
        <>
            <a>
                <br />
                選択式
            </a>
            <table className="table">
                <tbody>
                    {props.quiz[6].split(",").map((cont) => {
                        let check_box;
                        if (props.answer == cont) {
                            check_box = (
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    value={cont}
                                    id="flexCheckChecked"
                                    onChange={() => {
                                        props.setAnswer(cont);
                                    }}
                                    checked
                                />
                            );
                        } else {
                            check_box = (
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    value={cont}
                                    id="flexCheckChecked"
                                    onChange={() => {
                                        props.setAnswer(cont);
                                    }}
                                />
                            );
                        }
                        return (
                            <tr key={cont}>
                                <th scope="col">{check_box}</th>

                                <th scope="col" className="left">
                                    {cont}
                                </th>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}

function Answer_type2(props) {
    const answerConfig = parseQuizInputAnswerData(props.quiz[6]);
    const [error_collect, SetError_Collect] = useState(true);

    //正規表現のエラー表示
    const handle_Test_pattern = (event, target_set) => {
        const value = event.target.value;

        const isValid = answerConfig.inputMode === QUIZ_INPUT_MODE_PLAIN ? value.trim().length > 0 : testRegexPattern(answerConfig.pattern, value);
        if (!isValid) {
            target_set(true);
        } else {
            target_set(false);
        }
    };

    return (
        <>
            <a style={{ color: "#ffffff" }}>入力形式</a>

            <div className="row" style={{ color: "#ffffff" }}>
                <div className="col-10">
                    正解を入力
                    <br />
                    {answerConfig.example ? <p style={{ color: "#ffffff" }}>例:{answerConfig.example}</p> : null}
                    {/* 1行のみのフォームにしたい */}
                    <input
                        type="text"
                        className="form-control"
                        value={props.answer}
                        placeholder={answerConfig.inputMode === QUIZ_INPUT_MODE_PLAIN ? (answerConfig.placeholder || "回答を入力してください") : undefined}
                        onChange={(event) => {
                            handle_Test_pattern(event, SetError_Collect);
                            props.setAnswer(event.target.value);
                        }}
                    />
                    <div style={{ color: error_collect ? "var(--accent-red)" : "var(--accent-green)", marginTop: "10px" }}>
                        {answerConfig.inputMode === QUIZ_INPUT_MODE_PLAIN
                            ? (error_collect ? "❌ 回答を入力してください" : "✅ OK")
                            : (error_collect ? "❌ 入力形式が正しくありません" : "✅ OK")}
                    </div>
                </div>
            </div>
        </>
    );
}

function Answer(props) {
    const [answer, setAnswer] = useState("");

    let Contract = new Contracts_MetaMask();
    const id = props.id;
    const [quiz, setQuiz] = useState(null);
    const get_quiz = async () => {
        setQuiz(await Contract.get_quiz(id));
        console.log(quiz);
    };

    const create_answer = async () => {
        // Set_useing_address(cont.get_address);
        const res = Contract.create_answer(id, answer);
        console.log(res);
        res.then((value) => {
            console.log(value.value);
        });
    };
    useEffect(() => {
        get_quiz();
    }, []);

    const answerType = Number(quiz?.[13] ?? quiz?.answerType ?? 0);
    if (quiz) {
        return (
            <>
                <div className="container glass-card" style={{"text-align": "left", "margin-bottom": "50px", "background": "rgba(20, 25, 40, 0.8)", "padding": "var(--space-6)", "borderRadius": "var(--radius-xl)"}}>
                    <h2>{quiz[2]}</h2>
                    <br />
                    <a style={{"whiteSpace": "pre-wrap", "fontSize": "14px", "lineHeight": "1", color: "#ffffff"}}>
                        <br />
                        {quiz[3]}
                    </a>
                    <br />
                    <br />
                    <a style={{ color: "#ffffff" }}>出題者:{quiz[1]}</a>
                    <br />
                    <br />

                    <div data-color-mode="light" className="left" style={{"text-align": "left"}}>
                        <MDEditor.Markdown source={quiz[5]} />
                    </div>

                    {(() => {
                        if (answerType === 0) {
                            return <Answer_type1 quiz={quiz} answer={answer} setAnswer={setAnswer} />;
                        }
                    })()}
                    {(() => {
                        if (answerType === 1) {
                            return <Answer_type2 quiz={quiz} answer={answer} setAnswer={setAnswer} />;
                        }
                    })()}

                    <div className="d-flex justify-content-end">
                        <Button variant="primary" onClick={create_answer}>
                            回答
                        </Button>
                    </div>
                </div>
            </>
        );
    } else {
        return null;
    }
}
export default Answer;
