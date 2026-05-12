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
    error InvalidAmount();
    error InvalidSettlementTxHash();
    error PaymentAlreadyExists();
    error PaymentNotFunded();
    error SettlementAlreadyRegistered();
    error EscrowBalanceInsufficient();
    error NotGateway();
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

    event PaymentDeposited(
        bytes32 indexed paymentId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );
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

    modifier onlyGateway() {
        if (msg.sender != gateway) {
            revert NotGateway();
        }
        _;
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

    /// @notice Buyer deposits payment for a verified QuotaDEX payment request.
    /// @dev `paymentId` is the bytes32 form of the Gateway `payment_id`.
    function deposit(bytes32 paymentId, address seller, uint256 amount) external {
        if (seller == address(0)) {
            revert InvalidSeller();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        Payment storage existingPayment = payments[paymentId];
        if (existingPayment.state != PaymentState.None) {
            revert PaymentAlreadyExists();
        }

        bool transferred = paymentToken.transferFrom(msg.sender, address(this), amount);
        if (!transferred) {
            revert TokenTransferFailed();
        }

        payments[paymentId] = Payment({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            settlementTxHash: bytes32(0),
            state: PaymentState.Funded
        });
        totalLiabilities += amount;

        emit PaymentDeposited(paymentId, msg.sender, seller, amount);
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

    function release(bytes32 paymentId) external onlyGateway {
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

    function refund(bytes32 paymentId) external onlyGateway {
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
}
