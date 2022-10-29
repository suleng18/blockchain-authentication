pragma solidity ^0.5.0; // phiên bản sử dụng

contract Login {
  
    event LoginAttempt(address sender, string challenge);

    function login(string memory challenge) public {
        emit LoginAttempt(msg.sender, challenge);
    }

}
