// @vitest-environment node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = {
  id: 31337,
  name: "anvil",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"]
    }
  }
} as const;

const gatewayKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const buyerKey =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const sellerKey =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;
const gateway = privateKeyToAccount(gatewayKey);
const buyer = privateKeyToAccount(buyerKey);
const seller = privateKeyToAccount(sellerKey);

const mockTokenSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value, "balance");
        require(allowance[from][msg.sender] >= value, "allowance");
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}
`;

function compileContracts() {
  const escrowSource = fs.readFileSync(
    path.join(process.cwd(), "contracts/QuotaDEXEscrow.sol"),
    "utf8"
  );
  const input = {
    language: "Solidity",
    sources: {
      "QuotaDEXEscrow.sol": {
        content: escrowSource
      },
      "MockERC20.sol": {
        content: mockTokenSource
      }
    },
    settings: {
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts: Record<
      string,
      Record<string, { abi: Abi; evm: { bytecode: { object: string } } }>
    >;
  };
  const fatalErrors =
    output.errors?.filter((error) => error.severity === "error") ?? [];

  expect(fatalErrors.map((error) => error.formattedMessage)).toEqual([]);

  return {
    escrow: output.contracts["QuotaDEXEscrow.sol"].QuotaDEXEscrow,
    token: output.contracts["MockERC20.sol"].MockERC20
  };
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate anvil port.")));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForAnvil(rpcUrl: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: []
        })
      });

      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error("Timed out waiting for anvil RPC.");
}

async function startAnvil(): Promise<{
  rpcUrl: string;
  process: ChildProcessWithoutNullStreams;
}> {
  const port = await findFreePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil = spawn(
    "anvil",
    [
      "--silent",
      "--port",
      String(port),
      "--mnemonic",
      "test test test test test test test test test test test junk"
    ],
    {
      stdio: "pipe"
    }
  );

  await waitForAnvil(rpcUrl);

  return {
    rpcUrl,
    process: anvil
  };
}

async function deployFixture() {
  const compiled = compileContracts();
  const anvil = await startAnvil();
  const transport = http(anvil.rpcUrl);
  const publicClient = createPublicClient({
    chain,
    transport
  });
  const gatewayWallet = createWalletClient({
    account: gateway,
    chain,
    transport
  });
  const buyerWallet = createWalletClient({
    account: buyer,
    chain,
    transport
  });

  const tokenHash = await gatewayWallet.deployContract({
    abi: compiled.token.abi,
    bytecode: `0x${compiled.token.evm.bytecode.object}` as Hex
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({
    hash: tokenHash
  });
  const tokenAddress = getAddress(tokenReceipt.contractAddress as Address);
  const escrowHash = await gatewayWallet.deployContract({
    abi: compiled.escrow.abi,
    bytecode: `0x${compiled.escrow.evm.bytecode.object}` as Hex,
    args: [gateway.address, tokenAddress]
  });
  const escrowReceipt = await publicClient.waitForTransactionReceipt({
    hash: escrowHash
  });
  const escrowAddress = getAddress(escrowReceipt.contractAddress as Address);

  return {
    abi: compiled.escrow.abi,
    tokenAbi: compiled.token.abi,
    publicClient,
    gatewayWallet,
    buyerWallet,
    buyer,
    seller,
    anvil,
    tokenAddress,
    escrowAddress
  };
}

describe("QuotaDEXEscrow", () => {
  let currentAnvil: ChildProcessWithoutNullStreams | null = null;
  const paymentId =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
  const secondPaymentId =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
  const settlementTxHash =
    "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex;
  const amount = BigInt("5000000000000000");

  afterEach(() => {
    currentAnvil?.kill();
    currentAnvil = null;
  });

  it("registers facilitator-settled funds, then releases them to the seller", async () => {
    const fixture = await deployFixture();
    currentAnvil = fixture.anvil.process;

    await fixture.gatewayWallet.writeContract({
      address: fixture.tokenAddress,
      abi: fixture.tokenAbi,
      functionName: "mint",
      args: [fixture.buyer.address, amount]
    });
    await fixture.buyerWallet.writeContract({
      address: fixture.tokenAddress,
      abi: fixture.tokenAbi,
      functionName: "transfer",
      args: [fixture.escrowAddress, amount]
    });
    await fixture.gatewayWallet.writeContract({
      address: fixture.escrowAddress,
      abi: fixture.abi,
      functionName: "registerFacilitatorPayment",
      args: [
        paymentId,
        fixture.buyer.address,
        fixture.seller.address,
        amount,
        settlementTxHash
      ]
    });

    expect(
      await fixture.publicClient.readContract({
        address: fixture.escrowAddress,
        abi: fixture.abi,
        functionName: "totalLiabilities"
      })
    ).toBe(amount);

    await fixture.gatewayWallet.writeContract({
      address: fixture.escrowAddress,
      abi: fixture.abi,
      functionName: "release",
      args: [paymentId]
    });

    expect(
      await fixture.publicClient.readContract({
        address: fixture.tokenAddress,
        abi: fixture.tokenAbi,
        functionName: "balanceOf",
        args: [fixture.seller.address]
      })
    ).toBe(amount);
    expect(
      await fixture.publicClient.readContract({
        address: fixture.escrowAddress,
        abi: fixture.abi,
        functionName: "totalLiabilities"
      })
    ).toBe(BigInt(0));
  });

  it("rejects duplicate payment ids and duplicate settlement hashes", async () => {
    const fixture = await deployFixture();
    currentAnvil = fixture.anvil.process;

    await fixture.gatewayWallet.writeContract({
      address: fixture.tokenAddress,
      abi: fixture.tokenAbi,
      functionName: "mint",
      args: [fixture.escrowAddress, amount * BigInt(2)]
    });
    await fixture.gatewayWallet.writeContract({
      address: fixture.escrowAddress,
      abi: fixture.abi,
      functionName: "registerFacilitatorPayment",
      args: [
        paymentId,
        fixture.buyer.address,
        fixture.seller.address,
        amount,
        settlementTxHash
      ]
    });

    await expect(
      fixture.gatewayWallet.writeContract({
        address: fixture.escrowAddress,
        abi: fixture.abi,
        functionName: "registerFacilitatorPayment",
        args: [
          paymentId,
          fixture.buyer.address,
          fixture.seller.address,
          amount,
          secondPaymentId
        ]
      })
    ).rejects.toThrow();
    await expect(
      fixture.gatewayWallet.writeContract({
        address: fixture.escrowAddress,
        abi: fixture.abi,
        functionName: "registerFacilitatorPayment",
        args: [
          secondPaymentId,
          fixture.buyer.address,
          fixture.seller.address,
          amount,
          settlementTxHash
        ]
      })
    ).rejects.toThrow();
  });

  it("rejects facilitator registration when escrow token balance is below liabilities", async () => {
    const fixture = await deployFixture();
    currentAnvil = fixture.anvil.process;

    await expect(
      fixture.gatewayWallet.writeContract({
        address: fixture.escrowAddress,
        abi: fixture.abi,
        functionName: "registerFacilitatorPayment",
        args: [
          paymentId,
          fixture.buyer.address,
          fixture.seller.address,
          amount,
          settlementTxHash
        ]
      })
    ).rejects.toThrow();
  });

  it("refunds facilitator-settled funds to the buyer", async () => {
    const fixture = await deployFixture();
    currentAnvil = fixture.anvil.process;

    await fixture.gatewayWallet.writeContract({
      address: fixture.tokenAddress,
      abi: fixture.tokenAbi,
      functionName: "mint",
      args: [fixture.escrowAddress, amount]
    });
    await fixture.gatewayWallet.writeContract({
      address: fixture.escrowAddress,
      abi: fixture.abi,
      functionName: "registerFacilitatorPayment",
      args: [
        paymentId,
        fixture.buyer.address,
        fixture.seller.address,
        amount,
        settlementTxHash
      ]
    });
    await fixture.gatewayWallet.writeContract({
      address: fixture.escrowAddress,
      abi: fixture.abi,
      functionName: "refund",
      args: [paymentId]
    });

    expect(
      await fixture.publicClient.readContract({
        address: fixture.tokenAddress,
        abi: fixture.tokenAbi,
        functionName: "balanceOf",
        args: [fixture.buyer.address]
      })
    ).toBe(amount);
  });
});
