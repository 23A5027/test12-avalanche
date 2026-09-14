/// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IClassRoom {
    function _isTeacher(address user) external view returns (bool);
    function _isStudent(address user) external view returns (bool);
    function get_platform_token_addresses() external view returns (address tft_token, address ttt_token);
}

contract Quiz_Dapp {
    address public constant class_room_address = 0x41612c590b38efAb5aEbE746f55179d2B4256684;
    address public constant reward_burn_address = 0x000000000000000000000000000000000000dEaD;
    IClassRoom private immutable class_room;
    TokenInterface token;

    struct User {
        string user_id;
        string img_url;
        uint create_quiz_count;
        uint result;
        uint answer_count;
    }

    struct Answer {
        address respondent;
        string answer_text;
        uint answer_time;
        uint reward;
        bool result;
    }

    struct Quiz {
        address owner;
        string title;
        string explanation;
        string thumbnail_url;
        string content;
        uint answer_type;
        string answer_data;
        string registered_answer;
        bytes32 answer_hash;
        uint create_time_epoch;
        uint start_time_epoch;
        uint time_limit_epoch;
        uint reward;
        uint respondent_count;
        uint respondent_limit;
        bool is_payment;
        string confirm_answer;
        mapping(address => uint) respondents_map;
        mapping(address => uint) respondents_state;
        mapping(address => uint) respondent_attempt_counts;
        Answer[] answers;
        mapping(address => bytes32) students_answer_hashs;
    }

    struct QuizView {
        uint id;
        address owner;
        string title;
        string explanation;
        string thumbnail_url;
        string content;
        string answer_data;
        uint create_time_epoch;
        uint start_time_epoch;
        uint time_limit_epoch;
        uint reward;
        uint respondent_count;
        uint respondent_limit;
    }

    struct QuizSimpleView {
        uint id;
        address owner;
        string title;
        string explanation;
        string thumbnail_url;
        uint start_time_epoch;
        uint time_limit_epoch;
        uint reward;
        uint respondent_count;
        uint respondent_limit;
        uint state;
        bool is_payment;
    }

    mapping(address => User) private users;
    Quiz[] private quizs;

    event QuizRewardReduced(
        uint indexed quiz_id,
        uint previous_reward,
        uint new_reward,
        uint burned_amount,
        address indexed burned_to,
        address indexed updated_by
    );

    modifier isTeacher() {
        require(class_room._isTeacher(msg.sender), "teacher");
        _;
    }

    constructor() {
        class_room = IClassRoom(class_room_address);
        (address tft_token_address, ) = class_room.get_platform_token_addresses();
        token = TokenInterface(tft_token_address);
    }

    function _get_quiz_storage(uint quiz_id) internal view returns (Quiz storage quiz) {
        quiz = quizs[quiz_id];
    }

    function create_quiz(
        string memory _title,
        string memory _explanation,
        string memory _thumbnail_url,
        string memory _content,
        uint _answer_type,
        string memory _answer_data,
        string memory _answer,
        uint _startline_after_epoch,
        uint _timelimit_after_epoch,
        uint _reward,
        uint _respondent_limit
    ) public isTeacher returns (uint id) {
        require(token.allowance(msg.sender, address(this)) >= _reward * _respondent_limit, "approve");
        token.transferFrom_explanation(msg.sender, address(this), _reward * _respondent_limit, "create_quiz");

        id = quizs.length;
        quizs.push();

        Quiz storage quiz = quizs[id];
        quiz.owner = msg.sender;
        quiz.title = _title;
        quiz.explanation = _explanation;
        quiz.thumbnail_url = _thumbnail_url;
        quiz.content = _content;
        quiz.answer_type = _answer_type;
        quiz.answer_data = _answer_data;
        quiz.registered_answer = _answer;
        quiz.answer_hash = keccak256(abi.encodePacked(_answer));
        quiz.create_time_epoch = block.timestamp;
        quiz.start_time_epoch = _startline_after_epoch;
        quiz.time_limit_epoch = _timelimit_after_epoch;
        quiz.reward = _reward;
        quiz.respondent_limit = _respondent_limit;
        users[msg.sender].create_quiz_count += 1;
    }

    function edit_quiz(
        uint id,
        address owner,
        string memory _title,
        string memory _explanation,
        string memory _thumbnail_url,
        string memory _content,
        uint _startline_after_epoch,
        uint _timelimit_after_epoch
    ) public isTeacher returns (uint quiz_id) {
        Quiz storage quiz = quizs[id];
        quiz.owner = owner;
        quiz.title = _title;
        quiz.explanation = _explanation;
        quiz.thumbnail_url = _thumbnail_url;
        quiz.content = _content;
        quiz.start_time_epoch = _startline_after_epoch;
        quiz.time_limit_epoch = _timelimit_after_epoch;
        return id;
    }

    function investment_to_quiz(
        uint id,
        uint amount,
        uint numOfStudent
    ) public isTeacher returns (uint quiz_id) {
        require(token.allowance(msg.sender, address(this)) >= amount * numOfStudent, "approve");
        token.transferFrom_explanation(msg.sender, address(this), amount * numOfStudent, "investment_to_quiz");

        quizs[id].reward += amount;
        return id;
    }

    function reduce_quiz_reward(uint id, uint newReward) public isTeacher returns (uint burned_amount) {
        Quiz storage quiz = quizs[id];
        require(!quiz.is_payment, "paid");
        require(newReward < quiz.reward, "not decrease");

        uint previousReward = quiz.reward;
        burned_amount = (previousReward - newReward) * quiz.respondent_limit;
        require(burned_amount > 0, "zero");

        quiz.reward = newReward;
        require(token.transfer_explanation(reward_burn_address, burned_amount, "reduce_quiz_reward_burn"), "burn transfer");

        emit QuizRewardReduced(id, previousReward, newReward, burned_amount, reward_burn_address, msg.sender);
    }

    function get_quiz_reward_burn_amount(uint id, uint newReward) public view returns (uint burned_amount) {
        Quiz storage quiz = quizs[id];
        if (newReward >= quiz.reward) {
            return 0;
        }
        burned_amount = (quiz.reward - newReward) * quiz.respondent_limit;
    }

    function get_is_payment(uint quiz_id) public view returns (bool is_payment) {
        is_payment = quizs[quiz_id].is_payment;
    }

    function get_quiz(uint quiz_id) public view returns (QuizView memory quiz_data) {
        Quiz storage quiz = _get_quiz_storage(quiz_id);
        quiz_data = QuizView({
            id: quiz_id,
            owner: quiz.owner,
            title: quiz.title,
            explanation: quiz.explanation,
            thumbnail_url: quiz.thumbnail_url,
            content: quiz.content,
            answer_data: quiz.answer_data,
            create_time_epoch: quiz.create_time_epoch,
            start_time_epoch: quiz.start_time_epoch,
            time_limit_epoch: quiz.time_limit_epoch,
            reward: quiz.reward,
            respondent_count: quiz.respondent_count,
            respondent_limit: quiz.respondent_limit
        });
    }

    function get_confirm_answer(uint quiz_id) public view returns (string memory confirm_answer, bool is_payment) {
        confirm_answer = quizs[quiz_id].confirm_answer;
        is_payment = quizs[quiz_id].is_payment;
    }

    function get_revealed_correct_answer(uint quiz_id) public view returns (string memory correct_answer, bool visible) {
        Quiz storage quiz = quizs[quiz_id];
        visible = quiz.time_limit_epoch != 0 && block.timestamp > quiz.time_limit_epoch;
        if (!visible) {
            return ("", false);
        }
        correct_answer = quiz.registered_answer;
    }

    function get_student_answer_hash(address sender, uint quiz_id) public view returns (bytes32) {
        return quizs[quiz_id].students_answer_hashs[sender];
    }

    function get_quiz_answer_type(uint quiz_id) public view returns (uint answer_type) {
        answer_type = quizs[quiz_id].answer_type;
    }

    function get_quiz_simple(uint quiz_id) public view returns (QuizSimpleView memory quiz_data) {
        Quiz storage quiz = _get_quiz_storage(quiz_id);
        quiz_data = QuizSimpleView({
            id: quiz_id,
            owner: quiz.owner,
            title: quiz.title,
            explanation: quiz.explanation,
            thumbnail_url: quiz.thumbnail_url,
            start_time_epoch: quiz.start_time_epoch,
            time_limit_epoch: quiz.time_limit_epoch,
            reward: quiz.reward,
            respondent_count: quiz.respondent_count,
            respondent_limit: quiz.respondent_limit,
            state: quiz.respondents_map[msg.sender],
            is_payment: quiz.is_payment
        });
    }

    function save_answer(uint quiz_id, string memory answer) public returns (uint answer_id) {
        Quiz storage quiz = quizs[quiz_id];
        require(class_room._isStudent(msg.sender) || class_room._isTeacher(msg.sender), "auth");
        require(!quiz.is_payment, "paid");
        require(quiz.start_time_epoch <= block.timestamp, "start");
        require(quiz.time_limit_epoch > block.timestamp, "closed");

        bytes32 answer_hash = keccak256(abi.encodePacked(answer));

        if (quiz.respondents_map[msg.sender] == 0) {
            quiz.respondent_count += 1;
            users[msg.sender].answer_count += 1;
            quiz.respondent_attempt_counts[msg.sender] = 1;
        } else {
            quiz.respondent_attempt_counts[msg.sender] += 1;
        }
        quiz.students_answer_hashs[msg.sender] = answer_hash;

        answer_id = quiz.answers.length;
        quiz.respondents_state[msg.sender] = answer_id;
        quiz.answers.push();
        quiz.answers[answer_id].respondent = msg.sender;
        quiz.answers[answer_id].answer_text = answer;
        quiz.answers[answer_id].answer_time = block.timestamp;
        quiz.respondents_map[msg.sender] = 3;
    }

    function cancel_answer(uint quiz_id) public returns (bool cancelled) {
        Quiz storage quiz = quizs[quiz_id];
        require(!quiz.is_payment, "paid");
        require(quiz.respondents_map[msg.sender] == 3, "cancel");

        uint answer_id = quiz.respondents_state[msg.sender];
        if (quiz.respondent_count > 0) quiz.respondent_count -= 1;
        if (users[msg.sender].answer_count > 0) users[msg.sender].answer_count -= 1;

        quiz.students_answer_hashs[msg.sender] = bytes32(0);
        quiz.respondents_map[msg.sender] = 0;
        quiz.respondents_state[msg.sender] = 0;
        quiz.respondent_attempt_counts[msg.sender] = 0;

        if (answer_id < quiz.answers.length && quiz.answers[answer_id].respondent == msg.sender) {
            quiz.answers[answer_id].respondent = address(0);
            quiz.answers[answer_id].answer_text = "";
            quiz.answers[answer_id].answer_time = block.timestamp;
            quiz.answers[answer_id].reward = 0;
            quiz.answers[answer_id].result = false;
        }
        return true;
    }

    function get_student_answer_detail(uint quiz_id, address student)
        public
        view
        returns (
            string memory answer_text,
            uint state,
            uint answer_time,
            uint reward,
            bool result,
            bool submitted,
            uint attempt_count
        )
    {
        Quiz storage quiz = quizs[quiz_id];
        state = quiz.respondents_map[student];
        submitted = state != 0;
        attempt_count = quiz.respondent_attempt_counts[student];

        if (!submitted) {
            return ("", 0, 0, 0, false, false, 0);
        }

        uint answer_id = quiz.respondents_state[student];
        if (answer_id >= quiz.answers.length || quiz.answers[answer_id].respondent != student) {
            return ("", state, 0, 0, false, true, attempt_count);
        }

        Answer storage answer_data = quiz.answers[answer_id];
        answer_text = answer_data.answer_text;
        answer_time = answer_data.answer_time;
        reward = answer_data.reward;
        result = answer_data.result;
    }

    function _resolve_reward_for_student(Quiz storage quiz, address student) internal view returns (uint resolved_reward) {
        uint attempt_count = quiz.respondent_attempt_counts[student];
        if (attempt_count <= 1) {
            return quiz.reward;
        }
        return quiz.reward / 2;
    }

    function _settle_reward_for_student(
        Quiz storage quiz,
        address student,
        bytes32 answer_hash,
        string memory confirm_answer
    ) internal returns (bool wasCorrect) {
        uint answer_id = quiz.respondents_state[student];
        uint previousState = quiz.respondents_map[student];
        if (previousState == 0) {
            return false;
        }

        bytes32 student_answer_hash = quiz.students_answer_hashs[student];
        uint reward = 0;
        bool result = false;

        if (answer_hash == student_answer_hash) {
            reward = _resolve_reward_for_student(quiz, student);
            users[student].result += reward;
            token.transfer_explanation(student, reward, "correct answer");
            quiz.respondents_map[student] = 2;
            result = true;
            wasCorrect = true;

        } else {
            token.transfer_explanation(student, 0, "Incorrect answer");
            quiz.respondents_map[student] = 1;
        }

        quiz.answers[answer_id].reward = reward;
        quiz.answers[answer_id].result = result;
        quiz.is_payment = true;
        quiz.confirm_answer = confirm_answer;
    }

    function _settle_reward_for_student_manual(
        Quiz storage quiz,
        address student,
        bool is_correct
    ) internal returns (bool wasCorrect) {
        uint answer_id = quiz.respondents_state[student];
        uint previousState = quiz.respondents_map[student];
        if (previousState == 0) {
            return false;
        }

        uint reward = 0;
        bool result = false;

        if (is_correct) {
            if (previousState != 2) {
                reward = _resolve_reward_for_student(quiz, student);
                users[student].result += reward;
                token.transfer_explanation(student, reward, "correct answer");
            } else if (answer_id < quiz.answers.length) {
                reward = quiz.answers[answer_id].reward;
            }
            quiz.respondents_map[student] = 2;
            result = true;
            wasCorrect = true;
        } else {
            quiz.respondents_map[student] = 1;
        }

        if (answer_id < quiz.answers.length && quiz.answers[answer_id].respondent == student) {
            quiz.answers[answer_id].reward = reward;
            quiz.answers[answer_id].result = result;
        }
    }

    function payment_of_reward(uint quiz_id, string memory answer, address[] memory students) public isTeacher returns (uint correct_count) {
        Quiz storage quiz = quizs[quiz_id];
        require(!quiz.is_payment, "paid");
        bytes32 answer_hash = keccak256(abi.encodePacked(answer));

        for (uint i = 0; i < students.length; i++) {
            address student = students[i];
            if (_settle_reward_for_student(quiz, student, answer_hash, answer)) {
                correct_count += 1;
            }

        }
        quiz.is_payment = true;
        quiz.confirm_answer = answer;
    }

    function payment_of_reward_manual(
        uint quiz_id,
        string memory confirm_answer,
        address[] memory correct_students,
        address[] memory incorrect_students,
        bool finalize_payment
    ) public isTeacher returns (uint correct_count) {
        Quiz storage quiz = quizs[quiz_id];
        require(!quiz.is_payment, "paid");

        for (uint i = 0; i < correct_students.length; i++) {
            if (_settle_reward_for_student_manual(quiz, correct_students[i], true)) {
                correct_count += 1;
            }
        }

        for (uint i = 0; i < incorrect_students.length; i++) {
            _settle_reward_for_student_manual(quiz, incorrect_students[i], false);
        }

        quiz.confirm_answer = confirm_answer;
        if (finalize_payment) {
            quiz.is_payment = true;
        }
    }

    function adding_reward(uint quiz_id) public isTeacher returns (address owner) {
        owner = quizs[quiz_id].owner;
        if (!class_room._isTeacher(owner)) {
            require(token.allowance(msg.sender, address(this)) >= quizs[quiz_id].reward, "approve");
            token.transferFrom_explanation(msg.sender, address(this), quizs[quiz_id].reward, "investment_to_quiz");
            users[owner].result += quizs[quiz_id].reward;
            token.transfer_explanation(owner, quizs[quiz_id].reward, "Thank you for creating quiz!!");
        }
    }

    function get_quiz_length() public view returns (uint length) {
        length = quizs.length;
    }

    function set_user_name(string memory user_name) public returns (bool) {
        users[msg.sender].user_id = user_name;
        return true;
    }

    function set_user_img(string memory user_img) public returns (bool) {
        users[msg.sender].img_url = user_img;
        return true;
    }

    function get_user(address target)
        public
        view
        returns (
            string memory student_id,
            string memory img_url,
            uint result,
            bool state
        )
    {
        student_id = users[target].user_id;
        img_url = users[target].img_url;
        result = users[target].result;
        state = bytes(users[target].user_id).length > 0;
    }

}

interface TokenInterface {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256 balance);
    function transfer(address to, uint256 value) external returns (bool success);
    function transfer_explanation(address to, uint256 value, string memory explanation) external returns (bool success);
    function transferFrom(address from, address to, uint256 value) external returns (bool success);
    function transferFrom_explanation(address sender, address recipient, uint256 amount, string memory explanation) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool success);
    function approve_explanation(address spender, uint256 value, string memory explanation) external returns (bool success);
    function allowance(address owner, address spender) external view returns (uint256 remaining);
}
