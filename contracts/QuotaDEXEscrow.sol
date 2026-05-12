// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    function transfer(address to, uint256 value) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

contract QuotaDEXEscrow {
    error InvalidGateway();
    error InvalidPaymentToken();
    error InvalidBuyer();
    error InvalidSeller();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidSettlementTxHash();
    error PaymentAlreadyExists();
    error PaymentNotFunded();
    error SettlementAlreadyRegistered();
    error EscrowBalanceInsufficient();
    error NotGateway();
    error Reentrancy();
    error NativeTransferRejected();
    error NativeTransferFailed();
    error CannotRecoverPaymentToken();
    error TokenTransferFailed();

    enum PaymentState {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Payment {
        address buyer;
        address seller;
        uint256 amount;
        bytes32 settlementTxHash;
        PaymentState state;
    }

    address public immutable gateway;
    IERC20Minimal public immutable paymentToken;

    mapping(bytes32 => Payment) public payments;
    mapping(bytes32 => bool) public usedSettlementTxHashes;
    uint256 public totalLiabilities;
    uint256 private reentrancyStatus = 1;

    event PaymentReleased(
        bytes32 indexed paymentId,
        address indexed seller,
        uint256 amount
    );
    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed buyer,
        uint256 amount
    );
    event FacilitatorPaymentRegistered(
        bytes32 indexed paymentId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        bytes32 settlementTxHash
    );
    event NativeSwept(address indexed recipient, uint256 amount);
    event UnsupportedTokenRecovered(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event ExcessPaymentTokenRecovered(
        address indexed recipient,
        uint256 amount
    );

    modifier onlyGateway() {
        if (msg.sender != gateway) {
            revert NotGateway();
        }
        _;
    }

    modifier nonReentrant() {
        if (reentrancyStatus != 1) {
            revert Reentrancy();
        }
        reentrancyStatus = 2;
        _;
        reentrancyStatus = 1;
    }

    constructor(address gateway_, address paymentToken_) {
        if (gateway_ == address(0)) {
            revert InvalidGateway();
        }
        if (paymentToken_ == address(0)) {
            revert InvalidPaymentToken();
        }

        gateway = gateway_;
        paymentToken = IERC20Minimal(paymentToken_);
    }

    /// @notice Gateway records an x402 facilitator settlement that already transferred tokens into escrow.
    /// @dev The Gateway is the trusted oracle that verifies the settlement transaction off-chain first.
    function registerFacilitatorPayment(
        bytes32 paymentId,
        address buyer,
        address seller,
        uint256 amount,
        bytes32 settlementTxHash
    ) external onlyGateway {
        if (buyer == address(0)) {
            revert InvalidBuyer();
        }
        if (seller == address(0)) {
            revert InvalidSeller();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (settlementTxHash == bytes32(0)) {
            revert InvalidSettlementTxHash();
        }

        Payment storage existingPayment = payments[paymentId];
        if (existingPayment.state != PaymentState.None) {
            revert PaymentAlreadyExists();
        }
        if (usedSettlementTxHashes[settlementTxHash]) {
            revert SettlementAlreadyRegistered();
        }

        uint256 nextLiabilities = totalLiabilities + amount;
        if (paymentToken.balanceOf(address(this)) < nextLiabilities) {
            revert EscrowBalanceInsufficient();
        }

        usedSettlementTxHashes[settlementTxHash] = true;
        totalLiabilities = nextLiabilities;
        payments[paymentId] = Payment({
            buyer: buyer,
            seller: seller,
            amount: amount,
            settlementTxHash: settlementTxHash,
            state: PaymentState.Funded
        });

        emit FacilitatorPaymentRegistered(
            paymentId,
            buyer,
            seller,
            amount,
            settlementTxHash
        );
    }

    function release(bytes32 paymentId) external onlyGateway nonReentrant {
        Payment storage payment = payments[paymentId];
        if (payment.state != PaymentState.Funded) {
            revert PaymentNotFunded();
        }

        payment.state = PaymentState.Released;
        totalLiabilities -= payment.amount;

        bool transferred = paymentToken.transfer(payment.seller, payment.amount);
        if (!transferred) {
            revert TokenTransferFailed();
        }

        emit PaymentReleased(paymentId, payment.seller, payment.amount);
    }

    function refund(bytes32 paymentId) external onlyGateway nonReentrant {
        Payment storage payment = payments[paymentId];
        if (payment.state != PaymentState.Funded) {
            revert PaymentNotFunded();
        }

        payment.state = PaymentState.Refunded;
        totalLiabilities -= payment.amount;

        bool transferred = paymentToken.transfer(payment.buyer, payment.amount);
        if (!transferred) {
            revert TokenTransferFailed();
        }

        emit PaymentRefunded(paymentId, payment.buyer, payment.amount);
    }

    /// @notice Reject normal native KITE transfers. Gateway gas belongs on the Gateway EOA, not this escrow.
    receive() external payable {
        revert NativeTransferRejected();
    }

    fallback() external payable {
        revert NativeTransferRejected();
    }

    /// @notice Recover native KITE that arrived through forced balance changes such as selfdestruct.
    function sweepNative(address payable recipient, uint256 amount)
        external
        onlyGateway
        nonReentrant
    {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) {
            revert NativeTransferFailed();
        }

        emit NativeSwept(recipient, amount);
    }

    /// @notice Recover tokens sent to the escrow by mistake, except the active payment token.
    function recoverUnsupportedToken(address token, address recipient, uint256 amount)
        external
        onlyGateway
        nonReentrant
    {
        if (token == address(0)) {
            revert InvalidPaymentToken();
        }
        if (token == address(paymentToken)) {
            revert CannotRecoverPaymentToken();
        }
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        bool transferred = IERC20Minimal(token).transfer(recipient, amount);
        if (!transferred) {
            revert TokenTransferFailed();
        }

        emit UnsupportedTokenRecovered(token, recipient, amount);
    }

    /// @notice Recover payment-token balance that is not backing any registered escrow liability.
    /// @dev This is only for accidental/direct token transfers that were never registered as payments.
    function recoverExcessPaymentToken(address recipient, uint256 amount)
        external
        onlyGateway
        nonReentrant
    {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        uint256 balance = paymentToken.balanceOf(address(this));
        if (balance <= totalLiabilities || amount > balance - totalLiabilities) {
            revert EscrowBalanceInsufficient();
        }

        bool transferred = paymentToken.transfer(recipient, amount);
        if (!transferred) {
            revert TokenTransferFailed();
        }

        emit ExcessPaymentTokenRecovered(recipient, amount);
    }
}
