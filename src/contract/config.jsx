//const chainId = "0x13881"; // (required) chainId to be used
//const rpc = "https://rpc-mumbai.maticvigil.com/"; // (required for Ethereum) JSON RPC endpoint

const chainId = "0xA869"; // (required) chainId to be used
const rpc_urls = [
    "https://api.avax-test.network/ext/bc/C/rpc",
];
const rpc = rpc_urls[0]; // default RPC endpoint

//const quiz_address = "0xB80f73B6be80f39b30bd8624368cDd57E0db3ff5";
//const token_address = "0x1ceA098E584e46c7659f8460d3c13Cec2D0B22F4";

//const quiz_address = "0x681913855E68BBF88962A40E4f3f48cB78fc9603";
//const quiz_address = "0xAb3Ec4a039fb6aBb66Cf00460d27839a9C196B94";//応用数学一回目
//const quiz_address = "0x5d12efccbd81c60c80e5e2caffa480f2cf80a813"//test10

const class_room_address = "0x41612c590b38efAb5aEbE746f55179d2B4256684";
const quiz_address = "0x39d7451e34D0060fcEB165950AD07AB01F78bb8f";
const legacy_quiz_addresses = [];
// Keep this list append-only so existing shared URLs never change target contracts.
// When a new quiz.sol is deployed:
// 1. update quiz_address to the new contract
// 2. move the previous quiz_address into legacy_quiz_addresses
// 3. append the new contract address to routed_quiz_addresses
const routed_quiz_addresses = [
    "0x39d7451e34D0060fcEB165950AD07AB01F78bb8f",
];
// Backward-compatible alias for previously shared c-<id> URLs.
const legacy_current_route_address = quiz_address;
const token_address = "0xDDeFBc46B2d7FcC7273E5a94DCbD336130854e39";
const ttt_token_address = "0x8cB9f433d84bd94A2D47C2c0c2C7542fAF9af633";
const bootstrap_teacher_addresses = [
    "0x65Fb0D4a40181a4ab3Cd752F40aF16033873aEAf",
];

export {
    chainId,
    rpc,
    rpc_urls,
    class_room_address,
    quiz_address,
    legacy_quiz_addresses,
    routed_quiz_addresses,
    legacy_current_route_address,
    token_address,
    ttt_token_address,
    bootstrap_teacher_addresses,
};
