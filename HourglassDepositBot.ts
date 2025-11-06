import { ethers } from 'ethers';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// 상수 정의 - Mainnet
const VAULT_ADDRESS = '0xd9b2CB2FBAD204Fc548787EF56B918c845FCce40'; 
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TARGET_TIMESTAMP = 1762437600;
const TIMESTAMP_TOLERANCE = 3; // ±3초 허용 오차
const USDC_DECIMALS = 6;
const MIN_DEPOSIT = 1000; // 최소 1000 USDC
const MAX_DEPOSIT = 100000; // 최대 100K USDC
const RETRY_ATTEMPTS = 3; // 트랜잭션 재시도 횟수
const RETRY_DELAY = 2000; // 재시도 지연 시간 (ms)

// USDC ABI (필요한 함수만)
const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

// Vault ABI (필요한 함수만)
const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256)',
  'function maxDeposit(address) external view returns (uint256)',
  'function operationalMode() external view returns (uint8)',
  'function depositStart() external view returns (uint64)',
  'function depositEnd() external view returns (uint64)',
  'function totalAssets() external view returns (uint256)',
  'function maxTotalAssets() external view returns (uint256)',
];

// 설정 인터페이스
interface BotConfig {
  rpcUrl: string;
  depositAmount: bigint; // USDC 단위 (6 decimals)
  walletCount: number;
  privateKeys: string[];
  backupRpcUrl?: string; // 백업 RPC
  gasPrice?: bigint; // Legacy gas config
  maxFeePerGas?: bigint; // EIP-1559 gas config
  maxPriorityFeePerGas?: bigint; // EIP-1559 gas config
  gasConfig?: {
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
}

// 지갑 상태 인터페이스
interface WalletStatus {
  address: string;
  balance: bigint;
  allowance: bigint;
  approved: boolean;
  depositSuccess?: boolean;
  txHash?: string;
  error?: string;
}

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Readline helper functions for Bun compatibility
class ReadlineHelper {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  async questionYN(prompt: string): Promise<boolean> {
    const answer = await this.question(`${prompt} (y/n): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  async questionSelect(options: string[], prompt: string): Promise<number> {
    console.log(prompt);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}) ${option}`);
    });
    const answer = await this.question('선택 (번호 입력): ');
    const selected = parseInt(answer) - 1;
    return selected >= 0 && selected < options.length ? selected : -1;
  }

  async questionPassword(prompt: string): Promise<string> {
    // Bun doesn't support hiding input, so we'll just use regular input with a warning
    console.log('⚠️  주의: 입력이 화면에 표시됩니다!');
    return await this.question(prompt);
  }

  close() {
    this.rl.close();
  }
}

class HourglassDepositBot {
  private provider: ethers.Provider;
  private backupProvider?: ethers.Provider;
  private config: BotConfig;
  private wallets: ethers.Wallet[] = [];
  private backupWallets: ethers.Wallet[] = [];
  private usdcContract: ethers.Contract;
  private vaultContract: ethers.Contract;
  private isMonitoring = false;
  private walletStatuses: WalletStatus[] = [];
  private startTime: number;

  constructor(config: BotConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.startTime = Date.now();
    
    // 백업 RPC 설정
    if (config.backupRpcUrl) {
      this.backupProvider = new ethers.JsonRpcProvider(config.backupRpcUrl);
    }
    
    // 지갑 초기화
    for (const privateKey of config.privateKeys) {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      this.wallets.push(wallet);
      
      if (this.backupProvider) {
        const backupWallet = new ethers.Wallet(privateKey, this.backupProvider);
        this.backupWallets.push(backupWallet);
      }
      
      // 지갑 상태 초기화
      this.walletStatuses.push({
        address: wallet.address,
        balance: 0n,
        allowance: 0n,
        approved: false,
      });
    }

    // 컨트랙트 초기화
    this.usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.provider);
    this.vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, this.provider);
  }

  /**
   * 콘솔 로그 헬퍼 함수들
   */
  private log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  private logSuccess(message: string) {
    this.log(`✅ ${message}`, colors.green);
  }

  private logError(message: string) {
    this.log(`❌ ${message}`, colors.red);
  }

  private logWarning(message: string) {
    this.log(`⚠️  ${message}`, colors.yellow);
  }

  private logInfo(message: string) {
    this.log(`ℹ️  ${message}`, colors.cyan);
  }

  private logHeader(title: string) {
    const border = '═'.repeat(50);
    this.log(`\n${border}`, colors.bright + colors.blue);
    this.log(title.toUpperCase(), colors.bright + colors.blue);
    this.log(`${border}\n`, colors.bright + colors.blue);
  }

  /**
   * 재시도 로직이 포함된 트랜잭션 실행
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    operation: string,
    attempts: number = RETRY_ATTEMPTS
  ): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const isLastAttempt = i === attempts - 1;
        
        if (isLastAttempt) {
          throw error;
        }
        
        this.logWarning(`${operation} 실패 (시도 ${i + 1}/${attempts}): ${error.message}`);
        this.log(`  → ${RETRY_DELAY / 1000}초 후 재시도...`);
        
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
    
    throw new Error(`${operation} 실패: 모든 재시도 소진`);
  }

  /**
   * 설정 파일 로드
   */
  static async loadConfigFile(configPath: string): Promise<Partial<BotConfig>> {
    try {
      const configFile = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(configFile);
      
      // 문자열로 저장된 BigInt 값들을 다시 BigInt로 변환
      if (parsed.depositAmount) {
        parsed.depositAmount = BigInt(parsed.depositAmount);
      }
      if (parsed.gasPrice) {
        parsed.gasPrice = BigInt(parsed.gasPrice);
      }
      if (parsed.maxFeePerGas) {
        parsed.maxFeePerGas = BigInt(parsed.maxFeePerGas);
      }
      if (parsed.maxPriorityFeePerGas) {
        parsed.maxPriorityFeePerGas = BigInt(parsed.maxPriorityFeePerGas);
      }
      
      return parsed;
    } catch (error) {
      return {};
    }
  }

  /**
   * 설정 파일 저장
   */
  static async saveConfigFile(config: Partial<BotConfig>, configPath: string): Promise<void> {
    const safeConfig = {
      ...config,
      privateKeys: config.privateKeys?.map(() => '***'), // 개인키는 마스킹
      // BigInt 값들을 문자열로 변환
      depositAmount: config.depositAmount ? config.depositAmount.toString() : undefined,
      gasPrice: config.gasPrice ? config.gasPrice.toString() : undefined,
      maxFeePerGas: config.maxFeePerGas ? config.maxFeePerGas.toString() : undefined,
      maxPriorityFeePerGas: config.maxPriorityFeePerGas ? config.maxPriorityFeePerGas.toString() : undefined,
    };
    
    // undefined 값 제거
    Object.keys(safeConfig).forEach(key => {
      if (safeConfig[key] === undefined) {
        delete safeConfig[key];
      }
    });
    
    fs.writeFileSync(configPath, JSON.stringify(safeConfig, null, 2));
  }

  /**
   * 사용자 입력 받기 (Promise 기반 버전)
   */
  static async getUserInput(): Promise<BotConfig> {
    const rlHelper = new ReadlineHelper();
    
    try {
      console.clear();
      console.log(colors.bright + colors.cyan);
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║   HOURGLASS STABLE VAULT KYC DEPOSIT BOT v2.0   ║');
      console.log('╚══════════════════════════════════════════════════╝');
      console.log(colors.reset);
      
      console.log(colors.yellow);
      console.log('⏰ 목표 시간: 2025-11-06 14:00:00 UTC (KST 23:00:00)');
      console.log(`⏰ Unix Timestamp: ${TARGET_TIMESTAMP} (±${TIMESTAMP_TOLERANCE}초)`);
      console.log(colors.reset + '\n');

      // 설정 파일 로드 옵션
      const useConfigFile = await rlHelper.questionYN('설정 파일을 사용하시겠습니까?');
      let savedConfig: Partial<BotConfig> = {};
      
      if (useConfigFile) {
        const configPath = await rlHelper.question('설정 파일 경로 (기본: ./config.json): ') || './config.json';
        savedConfig = await HourglassDepositBot.loadConfigFile(configPath);
        
        if (Object.keys(savedConfig).length > 0) {
          console.log(colors.green + '✓ 설정 파일 로드 완료' + colors.reset);
        }
      }

      // 1. RPC 주소
      console.log('\n' + colors.bright + '1. RPC 설정' + colors.reset);
      let rpcUrl = savedConfig.rpcUrl || await rlHelper.question('메인 RPC 주소: ');
      
      if (!rpcUrl) {
        throw new Error('RPC 주소는 필수입니다.');
      }

    // RPC 연결 테스트
    console.log('  → RPC 연결 테스트 중...');
    try {
      const testProvider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await testProvider.getNetwork();
      const block = await testProvider.getBlockNumber();
      console.log(colors.green + `  ✓ 연결 성공! 네트워크: ${network.name} (Chain ID: ${network.chainId}), 최신 블록: ${block}` + colors.reset);
    } catch (error: any) {
      console.log(colors.red + `  ✗ RPC 연결 실패: ${error.message}` + colors.reset);
      throw new Error('RPC 연결 실패');
    }

      // 백업 RPC (선택사항)
      const backupRpcUrl = savedConfig.backupRpcUrl || await rlHelper.question('백업 RPC 주소 (선택사항, 엔터로 건너뛰기): ');

    // 2. 예치 금액
    console.log('\n' + colors.bright + '2. 예치 금액 설정' + colors.reset);
    console.log(`  최소: ${MIN_DEPOSIT.toLocaleString()} USDC`);
    console.log(`  최대: ${MAX_DEPOSIT.toLocaleString()} USDC`);
    
      const depositAmountStr = await rlHelper.question(`예치할 금액 (USDC): `);
    const depositAmount = parseFloat(depositAmountStr.replace(/,/g, ''));
    
    if (isNaN(depositAmount) || depositAmount < MIN_DEPOSIT || depositAmount > MAX_DEPOSIT) {
      throw new Error(`예치 금액은 ${MIN_DEPOSIT.toLocaleString()} ~ ${MAX_DEPOSIT.toLocaleString()} USDC 사이여야 합니다.`);
    }

    const depositAmountBigInt = ethers.parseUnits(depositAmount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    console.log(colors.green + `  ✓ 예치 금액: ${depositAmount.toLocaleString()} USDC` + colors.reset);

      // 3. 예치할 지갑 갯수
      console.log('\n' + colors.bright + '3. 예치할 지갑 갯수' + colors.reset);
      const walletCountStr = await rlHelper.question('예치할 지갑 갯수: ');
      const walletCount = parseInt(walletCountStr);
      
      if (isNaN(walletCount) || walletCount < 1) {
        throw new Error('지갑 수는 1 이상이어야 합니다.');
      }
      
      console.log(colors.green + `  ✓ ${walletCount}개 지갑을 설정합니다.` + colors.reset);
      
      // 4. 지갑 Private Key 입력
      console.log('\n' + colors.bright + '4. 지갑 Private Key 입력' + colors.reset);
      console.log(colors.yellow + '  ⚠️  주의: Private Key가 화면에 표시됩니다!' + colors.reset);
      
      let privateKeys: string[] = [];
      
      for (let i = 0; i < walletCount; i++) {
        console.log(`\n  [지갑 ${i + 1}/${walletCount}]`);
        const privateKey = await rlHelper.question(`  Private Key 입력: `);
        
        if (!privateKey) {
          throw new Error(`지갑 ${i + 1}의 Private Key는 필수입니다.`);
        }

        const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        
        // Private Key 유효성 검증
        try {
          const wallet = new ethers.Wallet(formattedKey);
          console.log(colors.green + `    ✓ 주소: ${wallet.address}` + colors.reset);
          privateKeys.push(formattedKey);
        } catch (error) {
          throw new Error(`지갑 ${i + 1}의 Private Key가 유효하지 않습니다.`);
        }
      }

      // 5. 가스 설정 (선택사항)
      console.log('\n' + colors.bright + '5. 가스 설정 (선택사항)' + colors.reset);
      const useCustomGas = await rlHelper.questionYN('사용자 정의 가스 설정을 사용하시겠습니까?');
    
    let gasConfig = {};
    if (useCustomGas) {
        const gasType = await rlHelper.questionSelect(
          ['Legacy (gasPrice)', 'EIP-1559 (maxFeePerGas, maxPriorityFeePerGas)'],
          '가스 타입 선택:'
        );
      
      if (gasType === 0) {
          const gasPriceGwei = await rlHelper.question('Gas Price (Gwei): ');
        gasConfig = {
          gasPrice: ethers.parseUnits(gasPriceGwei, 'gwei')
        };
      } else if (gasType === 1) {
          const maxFeePerGasGwei = await rlHelper.question('Max Fee Per Gas (Gwei): ');
          const maxPriorityFeePerGasGwei = await rlHelper.question('Max Priority Fee Per Gas (Gwei): ');
        gasConfig = {
          maxFeePerGas: ethers.parseUnits(maxFeePerGasGwei, 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits(maxPriorityFeePerGasGwei, 'gwei')
        };
      }
    }

    const config: BotConfig = {
      rpcUrl,
      depositAmount: depositAmountBigInt,
      walletCount: privateKeys.length,
      privateKeys,
      backupRpcUrl: backupRpcUrl || undefined,
      gasConfig: Object.keys(gasConfig).length > 0 ? gasConfig : undefined,
    };

      // 설정 저장 옵션
      const saveConfig = await rlHelper.questionYN('\n설정을 파일로 저장하시겠습니까?');
      if (saveConfig) {
        const savePath = await rlHelper.question('저장할 파일 경로 (기본: ./config.json): ') || './config.json';
      await HourglassDepositBot.saveConfigFile(config, savePath);
      console.log(colors.green + `✓ 설정 파일 저장 완료: ${savePath}` + colors.reset);
    }

      return config;
    } finally {
      rlHelper.close();
    }
  }

  /**
   * 지갑 정보 표시
   */
  private displayWalletInfo(): void {
    this.logHeader('지갑 정보');
    
    console.table(
      this.walletStatuses.map((status, index) => ({
        '번호': index + 1,
        '주소': `${status.address.substring(0, 6)}...${status.address.substring(38)}`,
        'USDC 잔액': ethers.formatUnits(status.balance, USDC_DECIMALS),
        'Allowance': ethers.formatUnits(status.allowance, USDC_DECIMALS),
        'Approved': status.approved ? '✅' : '❌',
        'Deposit': status.depositSuccess ? '✅' : status.error ? '❌' : '⏳',
      }))
    );
  }

  /**
   * 모든 지갑의 USDC 잔액 확인
   */
  async checkAllBalances(): Promise<void> {
    this.logHeader('USDC 잔액 확인');
    
    const checkPromises = this.wallets.map(async (wallet, index) => {
      try {
        const [balance, allowance] = await Promise.all([
          this.usdcContract.balanceOf(wallet.address),
          this.usdcContract.allowance(wallet.address, VAULT_ADDRESS)
        ]);
        
        this.walletStatuses[index].balance = balance;
        this.walletStatuses[index].allowance = allowance;
        
        const balanceFormatted = ethers.formatUnits(balance, USDC_DECIMALS);
        const allowanceFormatted = ethers.formatUnits(allowance, USDC_DECIMALS);
        
        if (balance >= this.config.depositAmount) {
          this.log(`  [지갑 ${index + 1}] ${wallet.address}`);
          this.log(`    잔액: ${balanceFormatted} USDC ✅`);
          this.log(`    Allowance: ${allowanceFormatted} USDC`);
        } else {
          this.logError(`  [지갑 ${index + 1}] ${wallet.address}`);
          this.logError(`    잔액 부족: ${balanceFormatted} USDC < ${ethers.formatUnits(this.config.depositAmount, USDC_DECIMALS)} USDC`);
        }
      } catch (error: any) {
        this.logError(`  [지갑 ${index + 1}] 잔액 확인 실패: ${error.message}`);
      }
    });
    
    await Promise.all(checkPromises);
  }

  /**
   * USDC Approve 실행 (병렬 처리)
   */
  async approveAllWallets(): Promise<void> {
    this.logHeader('USDC Approve 실행');
    
    const needApproval = this.walletStatuses.filter(
      status => status.allowance < this.config.depositAmount && status.balance >= this.config.depositAmount
    );
    
    if (needApproval.length === 0) {
      this.logSuccess('모든 지갑이 이미 충분한 Allowance를 가지고 있습니다.');
      return;
    }
    
    this.logInfo(`${needApproval.length}개 지갑에 Approve가 필요합니다.`);
    
    const approvePromises = needApproval.map(async (status) => {
      const walletIndex = this.walletStatuses.indexOf(status);
      const wallet = this.wallets[walletIndex];
      
      return this.executeWithRetry(
        async () => {
          const walletUsdc = this.usdcContract.connect(wallet) as ethers.Contract;
          
          this.log(`  [지갑 ${walletIndex + 1}] Approve 전송 중...`);
          
          const txOptions: any = {
            gasLimit: 100000,
          };
          
          // 가스 설정 적용
          if (this.config.gasConfig) {
            Object.assign(txOptions, this.config.gasConfig);
          }
          
          const tx = await walletUsdc.approve(VAULT_ADDRESS, this.config.depositAmount, txOptions);
          this.log(`    → TX: ${tx.hash}`);
          
          const receipt = await tx.wait();
          
          if (receipt?.status === 1) {
            this.walletStatuses[walletIndex].approved = true;
            this.walletStatuses[walletIndex].allowance = this.config.depositAmount;
            this.logSuccess(`  [지갑 ${walletIndex + 1}] Approve 완료 (블록: ${receipt.blockNumber})`);
          } else {
            throw new Error('트랜잭션 실패');
          }
        },
        `지갑 ${walletIndex + 1} Approve`,
        RETRY_ATTEMPTS
      ).catch(error => {
        this.logError(`  [지갑 ${walletIndex + 1}] Approve 최종 실패: ${error.message}`);
        this.walletStatuses[walletIndex].error = error.message;
      });
    });
    
    await Promise.all(approvePromises);
    
    const successCount = this.walletStatuses.filter(s => s.approved).length;
    this.logInfo(`Approve 결과: ${successCount}/${this.wallets.length} 성공`);
  }

  /**
   * Vault 상태 확인
   */
  async checkVaultStatus(): Promise<void> {
    this.logHeader('Vault 상태 확인');
    
    try {
      const [
        mode,
        maxDepositPerUser,
        depositStart,
        depositEnd,
        totalAssets,
        maxTotalAssets
      ] = await Promise.all([
        this.vaultContract.operationalMode(),
        this.vaultContract.maxDeposit(this.wallets[0]?.address || ethers.ZeroAddress),
        this.vaultContract.depositStart(),
        this.vaultContract.depositEnd(),
        this.vaultContract.totalAssets(),
        this.vaultContract.maxTotalAssets(),
      ]);

      const modeNames = ['Idle', 'Deposit', 'Live', 'Withdraw'];
      const currentMode = modeNames[Number(mode)] || 'Unknown';
      
      console.log(`  운영 모드: ${currentMode} (${mode})`);
      console.log(`  사용자별 최대 예치: ${ethers.formatUnits(maxDepositPerUser, USDC_DECIMALS)} USDC`);
      console.log(`  현재 총 예치액: ${ethers.formatUnits(totalAssets, USDC_DECIMALS)} USDC`);
      console.log(`  최대 총 예치액: ${ethers.formatUnits(maxTotalAssets, USDC_DECIMALS)} USDC`);
      console.log(`  예치 시작: ${new Date(Number(depositStart) * 1000).toISOString()}`);
      console.log(`  예치 종료: ${new Date(Number(depositEnd) * 1000).toISOString()}`);
      
      // 현재 시간과 목표 시간 비교
      const currentBlock = await this.provider.getBlock('latest');
      if (currentBlock) {
        const currentTimestamp = currentBlock.timestamp;
        const timeUntilTarget = TARGET_TIMESTAMP - currentTimestamp;
        
        if (timeUntilTarget > 0) {
          const hours = Math.floor(timeUntilTarget / 3600);
          const minutes = Math.floor((timeUntilTarget % 3600) / 60);
          const seconds = timeUntilTarget % 60;
          
          this.logInfo(`목표 시간까지: ${hours}시간 ${minutes}분 ${seconds}초`);
        } else {
          this.logWarning(`목표 시간이 ${Math.abs(timeUntilTarget)}초 전에 지났습니다.`);
        }
      }
      
      // Deposit 가능 여부 체크
      if (Number(mode) !== 1) {
        this.logWarning(`현재 Deposit 모드가 아닙니다. (현재 모드: ${currentMode})`);
      }
      
      if (maxDepositPerUser < this.config.depositAmount) {
        this.logWarning(`사용자별 최대 예치 한도보다 큰 금액을 예치하려고 합니다.`);
      }
      
    } catch (error: any) {
      this.logError(`Vault 상태 확인 실패: ${error.message}`);
    }
  }

  /**
   * Deposit 실행 (개선된 버전)
   */
  private async executeDeposit(wallet: ethers.Wallet, index: number): Promise<void> {
    const vaultWallet = this.vaultContract.connect(wallet) as ethers.Contract;
    
    return this.executeWithRetry(
      async () => {
        this.log(`🚀 [지갑 ${index + 1}] Deposit 실행 중...`);
        
        const txOptions: any = {
          gasLimit: 300000,
        };
        
        // 가스 설정 적용
        if (this.config.gasConfig) {
          Object.assign(txOptions, this.config.gasConfig);
        }
        
        const tx = await vaultWallet.deposit(
          this.config.depositAmount,
          wallet.address,
          txOptions
        );
        
        this.log(`  → TX: ${tx.hash}`);
        this.walletStatuses[index].txHash = tx.hash;
        
        const receipt = await tx.wait();
        
        if (receipt?.status === 1) {
          this.walletStatuses[index].depositSuccess = true;
          this.logSuccess(`  [지갑 ${index + 1}] Deposit 성공! (블록: ${receipt.blockNumber}, Gas: ${receipt.gasUsed})`);
        } else {
          throw new Error('트랜잭션 실패');
        }
      },
      `지갑 ${index + 1} Deposit`,
      RETRY_ATTEMPTS
    ).catch(error => {
      this.walletStatuses[index].depositSuccess = false;
      this.walletStatuses[index].error = error.message;
      this.logError(`  [지갑 ${index + 1}] Deposit 최종 실패: ${error.message}`);
      throw error;
    });
  }

  /**
   * 타임스탬프 모니터링 및 Deposit 실행
   */
  async monitorAndDeposit(): Promise<void> {
    this.logHeader('타임스탬프 모니터링');
    
    const targetDate = new Date(TARGET_TIMESTAMP * 1000);
    const kstDate = new Date(targetDate.getTime() + (9 * 60 * 60 * 1000)); // UTC + 9시간
    
    console.log(`목표 타임스탬프: ${TARGET_TIMESTAMP}`);
    console.log(`목표 시간 (UTC): ${targetDate.toISOString()}`);
    console.log(`목표 시간 (KST): ${kstDate.toISOString().replace('T', ' ').substring(0, 19)} KST`);
    console.log(`허용 오차: ±${TIMESTAMP_TOLERANCE}초\n`);
    
    this.isMonitoring = true;
    let lastLogTime = 0;
    let countdownStarted = false;
    
    while (this.isMonitoring) {
      try {
        const block = await this.provider.getBlock('latest');
        if (!block) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        const currentTimestamp = block.timestamp;
        const timeDiff = currentTimestamp - TARGET_TIMESTAMP;
        const timeUntilTarget = TARGET_TIMESTAMP - currentTimestamp;
        
        // 목표 시간 도달
        if (Math.abs(timeDiff) <= TIMESTAMP_TOLERANCE) {
          const currentDate = new Date(currentTimestamp * 1000);
          const currentKST = new Date(currentDate.getTime() + (9 * 60 * 60 * 1000));
          
          this.logSuccess(`\n🎯 목표 타임스탬프 도달!`);
          console.log(`현재 블록: ${block.number}`);
          console.log(`블록 타임스탬프: ${currentTimestamp}`);
          console.log(`현재 시간 (UTC): ${currentDate.toISOString()}`);
          console.log(`현재 시간 (KST): ${currentKST.toISOString().replace('T', ' ').substring(0, 19)} KST`);
          console.log(`차이: ${timeDiff}초\n`);
          
          // 병렬로 모든 Deposit 실행
          this.logInfo(`${this.wallets.length}개 지갑에서 동시에 Deposit 실행...`);
          
          const depositPromises = this.wallets.map((wallet, index) => 
            this.executeDeposit(wallet, index)
          );
          
          const results = await Promise.allSettled(depositPromises);
          
          // 결과 집계
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failCount = results.filter(r => r.status === 'rejected').length;
          
          this.logHeader('Deposit 실행 결과');
          console.log(`성공: ${successCount}/${this.wallets.length}`);
          console.log(`실패: ${failCount}/${this.wallets.length}`);
          
          // 상세 결과 표시
          this.displayWalletInfo();
          
          this.isMonitoring = false;
          break;
        }
        
        // 대기 중
        else if (timeUntilTarget > 0) {
          // 10초 미만일 때 카운트다운 시작
          if (timeUntilTarget <= 10 && !countdownStarted) {
            countdownStarted = true;
            console.log('\n' + colors.bright + colors.yellow + '⏰ 카운트다운 시작!' + colors.reset);
          }
          
          if (countdownStarted) {
            process.stdout.write(`\r⏱️  ${timeUntilTarget}초 남음... `);
          } else {
            const now = Date.now();
            if (now - lastLogTime > 10000) { // 10초마다 로그
              const hours = Math.floor(timeUntilTarget / 3600);
              const minutes = Math.floor((timeUntilTarget % 3600) / 60);
              const seconds = timeUntilTarget % 60;
              
              const currentDate = new Date(currentTimestamp * 1000);
              const currentKST = new Date(currentDate.getTime() + (9 * 60 * 60 * 1000));
              
              this.log(`⏳ 대기 중... (블록: ${block.number}, 현재 KST: ${currentKST.toISOString().replace('T', ' ').substring(0, 19)}, 남은 시간: ${hours}시간 ${minutes}분 ${seconds}초)`);
              lastLogTime = now;
            }
          }
        }
        
        // 시간이 지남
        else {
          this.logWarning(`\n목표 시간이 ${Math.abs(timeDiff)}초 전에 지났습니다.`);
          
          const rlHelper = new ReadlineHelper();
          const proceed = await rlHelper.questionYN('그래도 Deposit을 시도하시겠습니까?');
          rlHelper.close();
          
          if (proceed) {
            const depositPromises = this.wallets.map((wallet, index) => 
              this.executeDeposit(wallet, index)
            );
            
            await Promise.allSettled(depositPromises);
            this.displayWalletInfo();
          }
          
          this.isMonitoring = false;
          break;
        }
        
        // 체크 주기
        const checkInterval = timeUntilTarget <= 10 ? 100 : 500; // 10초 미만이면 더 자주 체크
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
      } catch (error: any) {
        this.logError(`모니터링 에러: ${error.message}`);
        
        // 백업 RPC로 전환 시도
        if (this.backupProvider) {
          this.logInfo('백업 RPC로 전환 시도...');
          this.provider = this.backupProvider;
          this.wallets = this.backupWallets;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 실행 요약 표시
   */
  private displaySummary(): void {
    this.logHeader('실행 요약');
    
    const totalTime = (Date.now() - this.startTime) / 1000;
    const successCount = this.walletStatuses.filter(s => s.depositSuccess).length;
    const failCount = this.walletStatuses.filter(s => s.error && !s.depositSuccess).length;
    
    console.log(`총 실행 시간: ${totalTime.toFixed(2)}초`);
    console.log(`총 지갑 수: ${this.wallets.length}`);
    console.log(`Deposit 성공: ${successCount}`);
    console.log(`Deposit 실패: ${failCount}`);
    console.log(`총 예치 금액: ${ethers.formatUnits(this.config.depositAmount * BigInt(successCount), USDC_DECIMALS)} USDC`);
    
    if (successCount > 0) {
      console.log('\n성공한 트랜잭션:');
      this.walletStatuses
        .filter(s => s.depositSuccess && s.txHash)
        .forEach((s, i) => {
          console.log(`  [지갑 ${i + 1}] ${s.txHash}`);
        });
    }
    
    if (failCount > 0) {
      console.log('\n실패한 지갑:');
      this.walletStatuses
        .filter(s => s.error && !s.depositSuccess)
        .forEach((s, i) => {
          console.log(`  [지갑 ${i + 1}] ${s.address}: ${s.error}`);
        });
    }
  }

  /**
   * 봇 실행 (메인 함수)
   */
  async run(): Promise<void> {
    try {
      this.logHeader('Hourglass Deposit Bot 실행');
      
      // 1. 잔액 확인
      await this.checkAllBalances();
      
      // 2. USDC Approve
      await this.approveAllWallets();
      
      // 3. Vault 상태 확인
      await this.checkVaultStatus();
      
      // 4. 최종 확인
      this.displayWalletInfo();
      
      const readyWallets = this.walletStatuses.filter(
        s => s.balance >= this.config.depositAmount && s.approved
      ).length;
      
      if (readyWallets === 0) {
        throw new Error('Deposit 준비가 완료된 지갑이 없습니다.');
      }
      
      this.logSuccess(`${readyWallets}개 지갑이 Deposit 준비 완료!`);
      
      const rlHelper = new ReadlineHelper();
      const proceed = await rlHelper.questionYN('\n모니터링을 시작하시겠습니까?');
      rlHelper.close();
      
      if (!proceed) {
        this.logWarning('사용자가 취소했습니다.');
        return;
      }
      
      // 5. 타임스탬프 모니터링 및 Deposit
      await this.monitorAndDeposit();
      
      // 6. 실행 요약
      this.displaySummary();
      
      this.logSuccess('\n✨ 봇 실행 완료!');
      
    } catch (error: any) {
      this.logError(`\n봇 실행 실패: ${error.message}`);
      
      if (error.stack) {
        console.log(colors.red + '\n스택 트레이스:' + colors.reset);
        console.log(error.stack);
      }
      
      process.exit(1);
    }
  }
}

// 시그널 핸들러
process.on('SIGINT', () => {
  console.log(colors.yellow + '\n\n⚠️  사용자가 중단했습니다.' + colors.reset);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(colors.red + '\n처리되지 않은 Promise 거부:', reason, colors.reset);
  process.exit(1);
});

// 메인 실행
async function main() {
  try {
    const args = process.argv.slice(2);
    
    // 커맨드라인 인자 처리
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
Hourglass Stable Vault KYC Deposit Bot v2.0

사용법:
  bun run src/index.ts [옵션]

옵션:
  --config <path>   설정 파일 경로 지정
  --help, -h        도움말 표시
  --version, -v     버전 정보 표시

예제:
  bun run src/index.ts
  bun run src/index.ts --config ./config.json
      `);
      process.exit(0);
    }
    
    if (args.includes('--version') || args.includes('-v')) {
      console.log('Hourglass Stable Vault KYC Deposit Bot v2.0');
      process.exit(0);
    }
    
    let config: BotConfig;
    
    // 설정 파일 인자 확인
    const configIndex = args.indexOf('--config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      const configPath = args[configIndex + 1];
      const loadedConfig = await HourglassDepositBot.loadConfigFile(configPath);
      
      if (!loadedConfig.privateKeys || loadedConfig.privateKeys.length === 0) {
        console.log(colors.yellow + '설정 파일에 개인키가 없습니다. 수동 입력이 필요합니다.' + colors.reset);
        config = await HourglassDepositBot.getUserInput();
      } else {
        config = loadedConfig as BotConfig;
      }
    } else {
      config = await HourglassDepositBot.getUserInput();
    }
    
    const bot = new HourglassDepositBot(config);
    await bot.run();
    
  } catch (error: any) {
    console.error(colors.red + '치명적 오류:', error.message, colors.reset);
    process.exit(1);
  }
}

// 프로그램 실행
main();