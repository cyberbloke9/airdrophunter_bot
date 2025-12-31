/**
 * Contract Factory
 * Manages smart contract instances and ABIs
 */

const { ethers } = require('ethers');
const { getProvider } = require('./providers');
const { getChain } = require('../config/chains');

// ABI definitions
const ABIS = {
  ERC20: [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
  ],

  WETH: [
    'function deposit() payable',
    'function withdraw(uint256 amount)',
    'function balanceOf(address owner) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
  ],

  UniswapV2Router: [
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
    'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
    'function getAmountsIn(uint amountOut, address[] calldata path) view returns (uint[] memory amounts)',
    'function WETH() view returns (address)',
  ],

  UniswapV2Factory: [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
    'function allPairs(uint) view returns (address pair)',
    'function allPairsLength() view returns (uint)',
  ],

  UniswapV2Pair: [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function price0CumulativeLast() view returns (uint)',
    'function price1CumulativeLast() view returns (uint)',
  ],

  UniswapV3Router: [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
    'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
    'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
  ],

  UniswapV3Quoter: [
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
    'function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut)',
    'function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)',
  ],

  Multicall3: [
    'function aggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)',
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
    'function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
    'function blockAndAggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, tuple(bool success, bytes returnData)[] returnData)',
    'function getBasefee() view returns (uint256 basefee)',
    'function getBlockHash(uint256 blockNumber) view returns (bytes32 blockHash)',
    'function getBlockNumber() view returns (uint256 blockNumber)',
    'function getChainId() view returns (uint256 chainid)',
    'function getCurrentBlockCoinbase() view returns (address coinbase)',
    'function getCurrentBlockDifficulty() view returns (uint256 difficulty)',
    'function getCurrentBlockGasLimit() view returns (uint256 gaslimit)',
    'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
    'function getEthBalance(address addr) view returns (uint256 balance)',
    'function getLastBlockHash() view returns (bytes32 blockHash)',
    'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
    'function tryBlockAndAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, tuple(bool success, bytes returnData)[] returnData)',
  ],
};

// Contract cache
const contractCache = new Map();

/**
 * Get cache key for a contract
 */
function getCacheKey(address, chainId, abiName) {
  return `${chainId}-${address.toLowerCase()}-${abiName}`;
}

/**
 * Create a contract instance
 */
function createContract(address, abi, chainId, signer = null) {
  const provider = getProvider(chainId);
  const signerOrProvider = signer || provider;
  return new ethers.Contract(address, abi, signerOrProvider);
}

/**
 * Get or create an ERC20 contract
 */
function getERC20Contract(address, chainId, signer = null) {
  const cacheKey = getCacheKey(address, chainId, 'ERC20');

  if (!contractCache.has(cacheKey) || signer) {
    const contract = createContract(address, ABIS.ERC20, chainId, signer);
    if (!signer) {
      contractCache.set(cacheKey, contract);
    }
    return contract;
  }

  return contractCache.get(cacheKey);
}

/**
 * Get Uniswap V2 Router contract
 */
function getUniswapV2Router(chainId, signer = null) {
  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV2Router) {
    throw new Error(`Uniswap V2 Router not available on chain ${chainId}`);
  }

  const address = chain.contracts.uniswapV2Router;
  const cacheKey = getCacheKey(address, chainId, 'UniswapV2Router');

  if (!contractCache.has(cacheKey) || signer) {
    const contract = createContract(address, ABIS.UniswapV2Router, chainId, signer);
    if (!signer) {
      contractCache.set(cacheKey, contract);
    }
    return contract;
  }

  return contractCache.get(cacheKey);
}

/**
 * Get Uniswap V2 Factory contract
 */
function getUniswapV2Factory(chainId, signer = null) {
  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV2Factory) {
    throw new Error(`Uniswap V2 Factory not available on chain ${chainId}`);
  }

  const address = chain.contracts.uniswapV2Factory;
  return createContract(address, ABIS.UniswapV2Factory, chainId, signer);
}

/**
 * Get Uniswap V3 Router contract
 */
function getUniswapV3Router(chainId, signer = null) {
  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV3Router) {
    throw new Error(`Uniswap V3 Router not available on chain ${chainId}`);
  }

  const address = chain.contracts.uniswapV3Router;
  return createContract(address, ABIS.UniswapV3Router, chainId, signer);
}

/**
 * Get Uniswap V3 Quoter contract
 */
function getUniswapV3Quoter(chainId, signer = null) {
  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV3Quoter) {
    throw new Error(`Uniswap V3 Quoter not available on chain ${chainId}`);
  }

  const address = chain.contracts.uniswapV3Quoter;
  return createContract(address, ABIS.UniswapV3Quoter, chainId, signer);
}

/**
 * Get WETH contract
 */
function getWETHContract(chainId, signer = null) {
  const chain = getChain(chainId);
  const wethAddress = chain?.contracts?.weth ||
                      chain?.contracts?.wmatic ||
                      chain?.contracts?.wbnb;

  if (!wethAddress) {
    throw new Error(`Wrapped native token not available on chain ${chainId}`);
  }

  return createContract(wethAddress, ABIS.WETH, chainId, signer);
}

/**
 * Get Multicall3 contract
 */
function getMulticall3(chainId, signer = null) {
  const chain = getChain(chainId);
  if (!chain?.contracts?.multicall3) {
    throw new Error(`Multicall3 not available on chain ${chainId}`);
  }

  const address = chain.contracts.multicall3;
  return createContract(address, ABIS.Multicall3, chainId, signer);
}

/**
 * Execute multicall
 */
async function multicall(chainId, calls) {
  const multicall3 = getMulticall3(chainId);

  const callData = calls.map(({ target, callData, allowFailure = false }) => ({
    target,
    allowFailure,
    callData,
  }));

  const results = await multicall3.callStatic.aggregate3(callData);

  return results.map((result, index) => ({
    success: result.success,
    returnData: result.returnData,
    call: calls[index],
  }));
}

/**
 * Get token info using multicall
 */
async function getTokenInfo(tokenAddress, chainId) {
  const token = getERC20Contract(tokenAddress, chainId);
  const iface = token.interface;

  const calls = [
    { target: tokenAddress, callData: iface.encodeFunctionData('name') },
    { target: tokenAddress, callData: iface.encodeFunctionData('symbol') },
    { target: tokenAddress, callData: iface.encodeFunctionData('decimals') },
    { target: tokenAddress, callData: iface.encodeFunctionData('totalSupply') },
  ];

  try {
    const results = await multicall(chainId, calls);

    return {
      address: tokenAddress,
      name: iface.decodeFunctionResult('name', results[0].returnData)[0],
      symbol: iface.decodeFunctionResult('symbol', results[1].returnData)[0],
      decimals: iface.decodeFunctionResult('decimals', results[2].returnData)[0],
      totalSupply: iface.decodeFunctionResult('totalSupply', results[3].returnData)[0],
      chainId,
    };
  } catch (error) {
    // Fallback to individual calls
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
    ]);

    return { address: tokenAddress, name, symbol, decimals, totalSupply, chainId };
  }
}

/**
 * Check and set token approval
 */
async function ensureApproval(tokenAddress, spender, amount, signer, chainId) {
  const token = getERC20Contract(tokenAddress, chainId, signer);
  const owner = await signer.getAddress();

  const currentAllowance = await token.allowance(owner, spender);

  if (currentAllowance.lt(amount)) {
    // Approve max amount
    const tx = await token.approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
    return { approved: true, txHash: tx.hash };
  }

  return { approved: true, alreadyApproved: true };
}

module.exports = {
  ABIS,
  createContract,
  getERC20Contract,
  getUniswapV2Router,
  getUniswapV2Factory,
  getUniswapV3Router,
  getUniswapV3Quoter,
  getWETHContract,
  getMulticall3,
  multicall,
  getTokenInfo,
  ensureApproval,
};
