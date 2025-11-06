@echo off
setlocal enabledelayedexpansion

REM ═══════════════════════════════════════════════════════════════
REM Hourglass Deposit Bot 설치 스크립트 (Windows)
REM ═══════════════════════════════════════════════════════════════

title Hourglass Deposit Bot 설치

echo 🏛️  Hourglass Deposit Bot 설치를 시작합니다...
echo.

REM Bun 설치 확인
echo ℹ️  Bun 설치 상태 확인 중...
bun --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('bun --version') do set BUN_VERSION=%%i
    echo ✅ Bun이 이미 설치되어 있습니다 ^(버전: !BUN_VERSION!^)
) else (
    echo ⚠️  Bun이 설치되어 있지 않습니다.
    echo.
    echo PowerShell을 관리자 권한으로 실행하여 다음 명령어를 실행하세요:
    echo powershell -c "irm bun.sh/install.ps1|iex"
    echo.
    pause
    
    REM 설치 후 다시 확인
    bun --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ Bun이 설치되지 않았습니다. 설치 후 다시 실행해주세요.
        pause
        exit /b 1
    )
)
echo.

REM 의존성 설치
echo ℹ️  프로젝트 의존성 설치 중...
bun install
if %errorlevel% neq 0 (
    echo ❌ 의존성 설치에 실패했습니다
    pause
    exit /b 1
)
echo ✅ 의존성 설치 완료
echo.

REM .env 파일 설정
echo ℹ️  환경 설정 파일 확인 중...
if exist ".env" (
    echo ⚠️  .env 파일이 이미 존재합니다
    set /p "OVERWRITE=기존 파일을 덮어쓰시겠습니까? (y/N): "
    if /i "!OVERWRITE!"=="y" (
        copy ".env.example" ".env" >nul
        echo ✅ .env 파일을 업데이트했습니다
    ) else (
        echo ℹ️  기존 .env 파일을 유지합니다
    )
) else (
    copy ".env.example" ".env" >nul
    echo ✅ .env 파일을 생성했습니다
)
echo.

REM 설정 가이드
echo ℹ️  🔧 설정 가이드
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 다음 단계를 완료해주세요:
echo.
echo ⚠️  1. .env 파일 편집
echo    - RPC_URL: Ethereum Mainnet RPC URL 입력
echo    - DEPOSIT_AMOUNT: 예치할 USDC 금액 설정
echo    - PRIVATE_KEYS: 지갑 Private Key 입력
echo.
echo ⚠️  2. 지갑 준비사항 확인
echo    - 충분한 USDC 잔액 ^(예치금액 + 여유분^)
echo    - ETH 가스비 ^(약 0.01 ETH 이상^)
echo    - KYC 완료된 지갑만 사용
echo.
echo ⚠️  3. RPC 서비스 준비
echo    - Infura: https://infura.io
echo    - Alchemy: https://alchemy.com
echo    - 기타 신뢰할 수 있는 RPC 제공자
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

REM 설치 완료
echo ✅ 🎉 설치가 완료되었습니다!
echo.
echo 사용 방법:
echo   1. .env 파일을 편집하여 설정 완료
echo   2. 봇 실행: bun run start
echo   3. 개발 모드: bun run dev
echo.
echo ℹ️  📖 자세한 사용법은 README.md를 참고하세요
echo.
echo ⚠️  중요: 목표 시간 10분 전에 봇을 실행하는 것을 권장합니다
echo 목표 시간: 2025년 11월 6일 23:00:00 ^(KST^)
echo.
pause