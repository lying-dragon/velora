# 실행과 공유

## 내 Mac에서

`~/Applications/VELORA.app`을 더블클릭하세요. Dock에 유지하면 다음부터 한 번에 열 수 있습니다. 앱이 화면 서버와 저장 서비스를 자동 실행합니다. FTP·체중·훈련·코스 선택·첫 안내 숨김은 재시작 후 복원됩니다. 브라우저에서 사용하던 컴퓨터 백업도 읽습니다.

현재 패키지는 Apple Silicon Mac용입니다. 앱 전용 Strava 창에는 처음 한 번 로그인해야 합니다. 센서 권한도 처음 연결 시 선택합니다. 별도 Node USB 브리지는 앱에 번들하지 않았으며 WebANT 직접 USB 연결을 우선 사용합니다.

## 다른 사람에게

- 개인 Mac 테스트: `release/VELORA-mac-arm64.zip`과 `release/VELORA-source.zip`을 함께 전달합니다. 압축을 풀고 앱을 응용 프로그램으로 복사합니다. 현재 빌드는 서명·공증되지 않아 macOS가 처음 실행을 차단할 수 있습니다. 공개 배포는 Apple Developer ID로 서명·공증한 DMG를 권장합니다.
- 웹 체험판: `release/VELORA-web.zip`의 dist 내용물을 정적 HTTPS 호스팅에 배포합니다. 상대 경로 빌드로 하위 디렉터리도 지원합니다. 서버 비밀이나 사용자 설정 파일은 포함하지 않습니다. 사용자마다 브라우저에 설정을 저장하며 PC 디스크 백업 및 Strava 자동화는 데스크톱 앱에서만 지원합니다. 공개 웹 주소는 https://lying-dragon.github.io/velora/ 입니다. main 브랜치에 푸시하면 테스트·빌드 후 GitHub Pages로 배포합니다.
- Windows: Chrome/Edge 웹 버전 또는 소스 실행을 사용할 수 있습니다. 이 Mac에서 만든 앱은 Windows에서 실행되지 않습니다. Windows 패키징과 장치 드라이버 검증은 별도 Windows 환경에서 진행해야 합니다.
- AGPL-3.0 소스와 라이선스를 함께 제공합니다. 수정판을 공개 호스팅할 때도 사용자가 대응 소스를 받을 수 있어야 합니다.

## 휴대폰과 태블릿

| 기기 | 사용할 수 있는 범위 |
|---|---|
| Android Chrome | HTTPS 웹 버전의 3D·훈련과 지원 장비의 Web Bluetooth. ANT+ USB는 OTG·동글·브라우저별 확인 필요 |
| iPhone / iPad | 데모, 훈련 편집. 현재 웹 버전에서 Bluetooth/ANT+ 직접 센서 연결 미지원 |
| 모든 모바일 | 데스크톱 Strava 자동화 미지원. 종료 카드·TCX·PNG를 내려받아 수동 공유 |

[Chrome Web Bluetooth 지원 안내](https://developer.chrome.com/docs/capabilities/bluetooth). 모바일 실기기와 실제 센서는 아직 검증하지 않았습니다. 모바일에서 PC의 `127.0.0.1` 주소는 사용할 수 없고 공유용 HTTPS 주소가 필요합니다. 홈 화면 설치(PWA)를 지원하며 기기·브라우저별 저장소는 서로 동기화되지 않습니다.

## 빌드

```sh
npm install
npm run package:desktop
npm run package:web
```

개발 소스와 사용자 데이터는 분리됩니다. `~/.velora`를 공유 ZIP에 넣지 마세요. 앱의 Strava 로그인은 운영체제의 Electron 사용자 데이터 폴더에 저장되며 다른 사람에게 전달하지 않습니다.
