#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Hourglass Deposit Bot 설치 스크립트
# ═══════════════════════════════════════════════════════════════

set -e

echo "🏛️  Hourglass Deposit Bot 설치를 시작합니다..."
echo

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수 정의
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# OS 확인
print_info "운영체제 확인 중..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="Windows"
else
    print_error "지원하지 않는 운영체제입니다: $OSTYPE"
    exit 1
fi
print_success "운영체제: $OS"
echo

# Bun 설치 확인
print_info "Bun 설치 상태 확인 중..."
if command -v bun >/dev/null 2>&1; then
    BUN_VERSION=$(bun --version)
    print_success "Bun이 이미 설치되어 있습니다 (버전: $BUN_VERSION)"
else
    print_warning "Bun이 설치되어 있지 않습니다. 설치를 진행합니다..."
    
    if [[ "$OS" == "macOS" ]] || [[ "$OS" == "Linux" ]]; then
        curl -fsSL https://bun.sh/install | bash
        
        # PATH 업데이트
        export PATH="$HOME/.bun/bin:$PATH"
        
        # 현재 셸 세션에서 bun 사용 가능하도록 설정
        if [[ -f "$HOME/.bun/bin/bun" ]]; then
            print_success "Bun 설치 완료"
        else
            print_error "Bun 설치에 실패했습니다"
            exit 1
        fi
    elif [[ "$OS" == "Windows" ]]; then
        print_warning "Windows에서는 PowerShell을 관리자 권한으로 실행하여 다음 명령어를 실행하세요:"
        print_info "powershell -c \"irm bun.sh/install.ps1|iex\""
        echo
        read -p "Bun 설치를 완료했으면 Enter를 눌러주세요..."
        
        if ! command -v bun >/dev/null 2>&1; then
            print_error "Bun이 설치되지 않았습니다. 설치 후 다시 실행해주세요."
            exit 1
        fi
    fi
fi
echo

# 의존성 설치
print_info "프로젝트 의존성 설치 중..."
if ! bun install; then
    print_error "의존성 설치에 실패했습니다"
    exit 1
fi
print_success "의존성 설치 완료"
echo

# .env 파일 설정
print_info "환경 설정 파일 확인 중..."
if [[ -f ".env" ]]; then
    print_warning ".env 파일이 이미 존재합니다"
    read -p "기존 파일을 덮어쓰시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp .env.example .env
        print_success ".env 파일을 업데이트했습니다"
    else
        print_info "기존 .env 파일을 유지합니다"
    fi
else
    cp .env.example .env
    print_success ".env 파일을 생성했습니다"
fi
echo

# 설정 가이드
print_info "🔧 설정 가이드"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "다음 단계를 완료해주세요:"
echo
print_warning "1. .env 파일 편집"
echo "   - RPC_URL: Ethereum Mainnet RPC URL 입력"
echo "   - DEPOSIT_AMOUNT: 예치할 USDC 금액 설정"
echo "   - PRIVATE_KEYS: 지갑 Private Key 입력"
echo
print_warning "2. 지갑 준비사항 확인"
echo "   - 충분한 USDC 잔액 (예치금액 + 여유분)"
echo "   - ETH 가스비 (약 0.01 ETH 이상)"
echo "   - KYC 완료된 지갑만 사용"
echo
print_warning "3. RPC 서비스 준비"
echo "   - Infura: https://infura.io"
echo "   - Alchemy: https://alchemy.com"
echo "   - 기타 신뢰할 수 있는 RPC 제공자"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# 실행 테스트
print_info "설치 확인 테스트 중..."
if bun run --help >/dev/null 2>&1; then
    print_success "Bun 실행 환경이 정상적으로 설정되었습니다"
else
    print_error "Bun 실행 환경에 문제가 있습니다"
    exit 1
fi
echo

# 완료 메시지
print_success "🎉 설치가 완료되었습니다!"
echo
echo "사용 방법:"
echo "  1. .env 파일을 편집하여 설정 완료"
echo "  2. 봇 실행: bun run start"
echo "  3. 개발 모드: bun run dev"
echo
print_info "📖 자세한 사용법은 README.md를 참고하세요"
echo
print_warning "⚠️  중요: 목표 시간 10분 전에 봇을 실행하는 것을 권장합니다"
echo "목표 시간: 2025년 11월 6일 23:00:00 (KST)"
echo