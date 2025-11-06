# 🏛️ Hourglass Deposit Bot

> **Hourglass Stable Vault KYC 자동 예치 봇** - 정확한 시간에 USDC를 자동으로 예치합니다.

## 📋 목차
- [⚡ 빠른 시작](#-빠른-시작)
- [📦 설치 방법](#-설치-방법)
- [⚙️ 설정](#️-설정)
- [🚀 실행 방법](#-실행-방법)
- [❓ 자주 묻는 질문](#-자주-묻는-질문)
- [⚠️ 주의사항](#️-주의사항)
- [🆘 문제 해결](#-문제-해결)

## ⚡ 빠른 시작

**자동 설치 (권장):**
```bash
# macOS/Linux
./setup.sh

# Windows
setup.bat
```

**수동 설치:**
```bash
# 1. Bun 설치 (아직 없다면)
curl -fsSL https://bun.sh/install | bash

# 2. 의존성 설치
bun install

# 3. 환경 설정
cp .env.example .env
# .env 파일을 열어서 필요한 값들을 입력

# 4. 봇 실행
bun run start
```

## 📦 설치 방법

### 자동 설치 스크립트 사용 (권장)

제공된 설치 스크립트를 사용하면 모든 설정을 자동으로 완료할 수 있습니다:

**macOS/Linux:**
```bash
./setup.sh
```

**Windows:**
```bash
setup.bat
```

설치 스크립트는 다음 작업을 자동으로 수행합니다:
- Bun 설치 및 확인
- 프로젝트 의존성 설치
- `.env` 파일 생성
- 설정 가이드 제공

### 수동 설치

#### 1. Bun 설치
이 봇은 Bun 런타임을 사용합니다. 먼저 Bun을 설치해야 합니다.

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```bash
# PowerShell 관리자 권한으로 실행
powershell -c "irm bun.sh/install.ps1|iex"
```

설치 확인:
```bash
bun --version
```

### 2. 프로젝트 설치
```bash
# 의존성 설치
bun install

# 또는 간단히
bun i
```

## ⚙️ 설정

### 봇 설정 방법

봇을 실행하면 다음 정보를 순서대로 입력해야 합니다:

#### 1️⃣ RPC 주소 입력
```
메인 RPC 주소: https://mainnet.infura.io/v3/YOUR_API_KEY
```
- **Infura**: https://mainnet.infura.io/v3/YOUR_API_KEY
- **Alchemy**: https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
- **Public RPC**: https://ethereum.publicnode.com

#### 2️⃣ 예치 금액 입력
```
예치할 금액 (USDC): 10000
```
- 최소: 1,000 USDC
- 최대: 100,000 USDC

#### 3️⃣ 지갑 개수 입력
```
예치할 지갑 갯수: 3
```
- 여러 개 지갑으로 동시에 예치 가능

#### 4️⃣ Private Key 입력
```
[지갑 1/3]
Private Key 입력: YOUR_PRIVATE_KEY_HERE
```
- 각 지갑의 Private Key를 입력
- 0x 접두사는 선택사항

#### 5️⃣ 가스 설정 (선택사항)
- Legacy 또는 EIP-1559 방식 선택 가능
- 기본값 사용 권장

## 🚀 실행 방법

### 기본 실행
```bash
bun run start
```

### 개발 모드 (파일 변경 자동 감지)
```bash
bun run dev
```

### 설정 파일 사용
이전에 저장한 설정 파일이 있다면:
```bash
bun run start
# "설정 파일을 사용하시겠습니까?" → y
# 설정 파일 경로 입력 → ./config.json
```

## ⏰ 중요한 시간 정보

### 목표 예치 시간
- **Unix Timestamp**: `1762437600`
- **UTC 시간**: 2025년 11월 6일 14:00:00
- **한국 시간(KST)**: 2025년 11월 6일 23:00:00
- **허용 오차**: ±3초

### 컨트랙트 주소
- **Vault**: `0xd9b2CB2FBAD204Fc548787EF56B918c845FCce40`
- **USDC**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

## 📊 봇 실행 프로세스

```
1. 설정 입력
   ↓
2. RPC 연결 확인
   ↓
3. 지갑 잔액 확인
   ↓
4. USDC Approve 실행
   ↓
5. Vault 상태 확인
   ↓
6. 타임스탬프 모니터링
   ↓
7. 목표 시간 도달 시 Deposit 실행
   ↓
8. 결과 확인
```

## ❓ 자주 묻는 질문

### Q: Private Key는 어디서 얻나요?
MetaMask나 다른 지갑에서 Private Key를 내보낼 수 있습니다.
- MetaMask: 설정 → 계정 세부 정보 → Private Key 내보내기

### Q: RPC URL은 무엇인가요?
Ethereum 네트워크와 통신하기 위한 엔드포인트입니다.
- 무료: Infura, Alchemy (가입 필요)
- 유료: QuickNode, Chainstack

### Q: 가스비는 얼마나 드나요?
- Approve: 약 50,000 gas
- Deposit: 약 150,000 gas
- 총 예상: 약 200,000 gas × 가스 가격

### Q: 여러 지갑을 사용하는 이유는?
- 리스크 분산
- 동시 실행으로 성공률 향상
- 네트워크 혼잡 시 대응

## ⚠️ 주의사항

### 🔐 보안
1. **Private Key 관리**
   - 절대 Private Key를 공유하지 마세요
   - .env 파일을 Git에 커밋하지 마세요
   - 안전한 환경에서만 실행하세요

2. **지갑 준비사항**
   - 충분한 USDC 잔액 필요
   - ETH 가스비 준비 (약 0.01 ETH)
   - KYC 완료된 지갑만 사용

3. **네트워크**
   - 안정적인 인터넷 연결 필수
   - 신뢰할 수 있는 RPC 사용
   - 백업 RPC 설정 권장

### ⏱️ 타이밍
- 목표 시간 10분 전에 봇 실행 권장
- 시스템 시간이 정확한지 확인
- 네트워크 지연 고려

## 🆘 문제 해결

### "RPC 연결 실패" 오류
```bash
# RPC URL이 올바른지 확인
# API 키가 유효한지 확인
# 네트워크 연결 확인
```

### "잔액 부족" 오류
```bash
# USDC 잔액 확인: 최소 예치 금액 + 여유분
# ETH 잔액 확인: 가스비용 약 0.01 ETH
```

### "Approve 실패" 오류
```bash
# 이미 Approve가 되어있는지 확인
# 가스 한도 증가 시도
# 다른 RPC로 재시도
```

### Bun 설치 문제
```bash
# Node.js가 설치되어 있다면 npm으로도 실행 가능
npm install
node HourglassDepositBot.ts
```

## 📞 지원

문제가 발생하거나 도움이 필요하면:
1. 이 문서의 문제 해결 섹션 확인
2. 팀 슬랙 채널에 문의
3. 기술 지원팀 연락

---

## 📝 체크리스트

봇 실행 전 확인사항:

- [ ] Bun 설치 완료
- [ ] 의존성 설치 완료 (`bun install`)
- [ ] RPC URL 준비
- [ ] USDC 잔액 확인 (예치금액 + 여유분)
- [ ] ETH 가스비 준비 (약 0.01 ETH)
- [ ] Private Key 준비
- [ ] KYC 완료 확인
- [ ] 시스템 시간 정확도 확인
- [ ] 인터넷 연결 안정성 확인
- [ ] 목표 시간 10분 전 실행

---

**Version**: 1.0.0  
**Last Updated**: 2024-11-06  
**Target Timestamp**: 1762437600 (2025-11-06 23:00:00 KST)