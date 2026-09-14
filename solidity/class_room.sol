// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "@openzeppelin/contracts@4.4.1/token/ERC20/ERC20.sol";

contract class_room {
    address public tft_token_address;
    address public ttt_token_address;

    enum UserRole {
        NONE,
        STUDENT,
        TEACHER
    }

    mapping(address => bool) private teachers;
    mapping(address => bool) private students;
    mapping(address => UserRole) private user_roles;
    mapping(address => address) private registered_by;
    mapping(address => uint256) private registered_at;

    address[] teacher_address_list;
    address[] student_address_list;

    event RoleUpdated(address indexed actor, address indexed user, uint8 role, string role_label);
    event TeacherAdded(address indexed actor, address indexed teacher_address);
    event StudentAdded(address indexed actor, address indexed student_address);
    event PlatformTokenAddressesUpdated(address indexed actor, address indexed tft_token, address indexed ttt_token);

    constructor() {
        tft_token_address = 0xDDeFBc46B2d7FcC7273E5a94DCbD336130854e39;
        ttt_token_address = 0x8cB9f433d84bd94A2D47C2c0c2C7542fAF9af633;
        _set_role(msg.sender, UserRole.TEACHER);
    }

    modifier isTeacher() {
        require(teachers[msg.sender] == true, "teacher only");
        _;
    }

    function _contains_address(address[] storage targets, address target) internal view returns (bool) {
        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i] == target) {
                return true;
            }
        }
        return false;
    }

    function _set_role(address user, UserRole role) internal {
        if (role != UserRole.NONE) {
            registered_by[user] = msg.sender;
            if (registered_at[user] == 0) {
                registered_at[user] = block.timestamp;
            }
        }

        user_roles[user] = role;
        teachers[user] = role == UserRole.TEACHER;
        students[user] = role == UserRole.STUDENT;

        if (role == UserRole.TEACHER && !_contains_address(teacher_address_list, user)) {
            teacher_address_list.push(user);
        }
        if (role == UserRole.STUDENT && !_contains_address(student_address_list, user)) {
            student_address_list.push(user);
        }

        emit RoleUpdated(msg.sender, user, uint8(role), get_user_role_label(user));
    }

    function _collect_addresses_by_role(address[] storage source, UserRole role)
        internal
        view
        returns (address[] memory result)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < source.length; i++) {
            if (user_roles[source[i]] == role) {
                count += 1;
            }
        }

        result = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < source.length; i++) {
            if (user_roles[source[i]] == role) {
                result[index] = source[i];
                index += 1;
            }
        }
    }

    function _isTeacher() public view returns (bool) {
        return user_roles[msg.sender] == UserRole.TEACHER;
    }

    function _isTeacher(address user) public view returns (bool) {
        return user_roles[user] == UserRole.TEACHER;
    }

    function _isStudent() public view returns (bool) {
        return user_roles[msg.sender] == UserRole.STUDENT;
    }

    function _isStudent(address user) public view returns (bool) {
        return user_roles[user] == UserRole.STUDENT;
    }

    function get_user_role() public view returns (uint8 role) {
        role = uint8(user_roles[msg.sender]);
    }

    function get_user_role(address user) public view returns (uint8 role) {
        role = uint8(user_roles[user]);
    }

    function get_user_role_label() public view returns (string memory role_label) {
        role_label = get_user_role_label(msg.sender);
    }

    function get_user_role_label(address user) public view returns (string memory role_label) {
        UserRole role = user_roles[user];
        if (role == UserRole.STUDENT) {
            return "student";
        }
        if (role == UserRole.TEACHER) {
            return "teacher";
        }
        return "none";
    }

    function isRegistered() public view returns (bool registered) {
        registered = user_roles[msg.sender] != UserRole.NONE;
    }

    function isRegistered(address user) public view returns (bool registered) {
        registered = user_roles[user] != UserRole.NONE;
    }

    function getRoleSummary()
        public
        view
        returns (
            bool registered,
            bool is_teacher,
            bool is_student,
            uint8 role,
            string memory role_label
        )
    {
        return getRoleSummary(msg.sender);
    }

    function getRoleSummary(address user)
        public
        view
        returns (
            bool registered,
            bool is_teacher,
            bool is_student,
            uint8 role,
            string memory role_label
        )
    {
        UserRole currentRole = user_roles[user];
        registered = currentRole != UserRole.NONE;
        is_teacher = currentRole == UserRole.TEACHER;
        is_student = currentRole == UserRole.STUDENT;
        role = uint8(currentRole);
        role_label = get_user_role_label(user);
    }

    function getRegistrationDetails()
        public
        view
        returns (
            bool registered,
            bool is_teacher,
            bool is_student,
            uint8 role,
            string memory role_label,
            address added_by,
            uint256 added_at
        )
    {
        return getRegistrationDetails(msg.sender);
    }

    function getRegistrationDetails(address user)
        public
        view
        returns (
            bool registered,
            bool is_teacher,
            bool is_student,
            uint8 role,
            string memory role_label,
            address added_by,
            uint256 added_at
        )
    {
        UserRole currentRole = user_roles[user];
        registered = currentRole != UserRole.NONE;
        is_teacher = currentRole == UserRole.TEACHER;
        is_student = currentRole == UserRole.STUDENT;
        role = uint8(currentRole);
        role_label = get_user_role_label(user);
        added_by = registered_by[user];
        added_at = registered_at[user];
    }

    function getCurrentUserAccessSnapshot()
        public
        view
        returns (
            address user,
            bool registered,
            bool is_teacher,
            bool is_student,
            uint8 role,
            string memory role_label,
            address added_by,
            uint256 added_at
        )
    {
        user = msg.sender;
        (
            registered,
            is_teacher,
            is_student,
            role,
            role_label,
            added_by,
            added_at
        ) = getRegistrationDetails(msg.sender);
    }

    function get_platform_token_addresses() public view returns (address tft_token, address ttt_token) {
        tft_token = tft_token_address;
        ttt_token = ttt_token_address;
    }

    function update_platform_token_addresses(address next_tft_token, address next_ttt_token)
        public
        isTeacher
        returns (bool updated)
    {
        require(next_tft_token != address(0), "bad TFT");
        require(next_ttt_token != address(0), "bad TTT");

        tft_token_address = next_tft_token;
        ttt_token_address = next_ttt_token;

        emit PlatformTokenAddressesUpdated(msg.sender, next_tft_token, next_ttt_token);
        return true;
    }

    function check_teacher(address _target) internal view returns (bool res) {
        res = user_roles[_target] == UserRole.TEACHER;
    }

    function add_teacher(address teacher_address) public isTeacher returns (bool res) {
        if (user_roles[teacher_address] != UserRole.TEACHER) {
            _set_role(teacher_address, UserRole.TEACHER);
            emit TeacherAdded(msg.sender, teacher_address);
        }
        res = true; //await　への返答
    }

    function add_student(address[] memory students_address) public isTeacher returns (bool res) {
        for (uint256 i = 0; i < students_address.length; i++) {
            if (user_roles[students_address[i]] != UserRole.STUDENT) {
                _set_role(students_address[i], UserRole.STUDENT);
                emit StudentAdded(msg.sender, students_address[i]);
            }
        }
        res = true;
    }

    function get_student_all() public view isTeacher returns (address[] memory result) {
        result = _collect_addresses_by_role(student_address_list, UserRole.STUDENT);
    }

    function get_teacher_all() public view isTeacher returns (address[] memory result) {
        result = _collect_addresses_by_role(teacher_address_list, UserRole.TEACHER);
    }
}
