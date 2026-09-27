# 참고 및 소스 출처

## WebANT

- 프로젝트: https://github.com/dvmarinoff/WebANT
- 작성자: dvmarinoff 및 프로젝트 기여자
- 참조 커밋: `edec8881286586fc03979bf2608799b3bfc15d32`
- 라이선스: AGPL-3.0 (`src/vendor/webant/LICENSE.txt`)
- 그대로 포함한 파일: `src/fec.js`, `src/common.js`, `src/functions.js`, `src/utils.js` → `src/vendor/webant/`
- `src/ant-protocol.ts`: upstream `message.js`의 프레임 구조 및 `devices.js`의 FE-C 프로필/명령 흐름을 참고, 디코더는 위 원본 fec.js를 직접 호출합니다.
- `src/web-ant.ts`: upstream `web-serial-polyfill.js`의 WebUSB bulk endpoint 접근과 `driver.js`의 전송 분리 구조를 참고하여 새로 구현했습니다. OS 문자열 감지 대신 기능 감지, 실제 startup/응답 대기, timeout, connection generation, 리소스 해제를 추가했습니다.
- upstream 전체 데모/전역 상태 버스는 포함하지 않았습니다.

## Flux

- 프로젝트: https://github.com/pitisec/Flux (dvmarinoff/Auuki 포크)
- 참조 커밋: `57727ce7d5126ea09191f84cb8987639f07331ed`
- `src/ant/channel.js`, `src/ant/web-serial.js`, `src/ant/fec.js`, `src/ant/search-channel.js`와 BLE 구조를 조사했습니다.
- 사용자 요청에 따라 ANT 구현의 우선 기준을 WebANT로 정했습니다.
- Flux의 주행 자산이나 UI 코드를 복사하지 않았습니다.
- 이번 업데이트에서 `src/workouts/workouts.js`의 Butter, Baguette, Maple, Dijon, Pasta, Blackcurrant ZWO를 `public/workouts/`에 보존하고, `src/workouts/flux.json`에 시간/파워/반복 구조를 정규화했습니다 (AGPL-3.0).
- `src/workouts/zwo.js`의 램프/IntervalsT 구성과 `src/ble/ftms/control-point.js`, `fitness-machine-feature.js`의 인코딩 및 지원 비트를 참고했습니다.
- 기본 훈련의 목표 케이던스 범위, 한글 이름/설명, Z2 30분 단축형은 VELORA에서 추가했습니다.

## 기타

- Three.js: https://github.com/mrdoob/three.js (MIT)
- ant-plus: https://github.com/Loghorn/ant-plus (MIT), 선택적 로컬 브리지
- ws: https://github.com/websockets/ws (MIT)
- Zwift 스크린샷은 사용자 제공 레이아웃 참고 자료로만 사용했으며 게임 내 이미지/상표/3D 모델을 포함하지 않았습니다.
- 트랙, 지형, 나무, 산, 자전거, 라이더는 절차적 형상으로 직접 생성합니다.

이 저장소는 WebANT 코드를 포함하므로 AGPL-3.0 조건으로 제공합니다. 루트 LICENSE와 이 출처 파일을 함께 보관하십시오.


## Ramp Test 참고

- Flux `src/workouts/workouts.js`의 Ramp Test: 300초 46%, 이후 60초마다 52%부터 6%p 증가하는 단계를 사용합니다. 최대 1,000 W 제어 범위 밖 단계는 제외합니다.
- 사용자 제공 [Velo MAP Ramp Test 설명](https://velo.outsideonline.com/road/road-training/how-to-do-a-map-ramp-test/?scope=anon): 워밍업 후 매분 파워를 높여 한계까지 수행하는 MAP 평가 개념을 참고했습니다. 기사 예시의 200 W 시작/20 W 증분 프로토콜을 그대로 구현한 것은 아닙니다.
- [TrainerRoad Ramp Test FAQ](https://support.trainerroad.com/hc/en-us/articles/360006903031-Ramp-Test-FAQs): 최고 1분 파워의 75%를 FTP로 추정하는 계산 기준. Flux 설명의 마지막 목표 단계 대신 시간 가중 실측 60초 평균을 사용합니다. 서로 다른 램프 프로토콜과 개인별 생리적 차이 때문에 추정값으로 명시합니다.


## Strava 웹 화면 / 데스크톱

- Strava의 파일 업로드 및 활동 편집 화면을 2026-09-27 직접 관찰해 독립적인 DOM 어댑터를 작성했습니다. Strava 소스나 비공개 API는 사용하지 않습니다.
- [Electron 장치 연결](https://www.electronjs.org/docs/latest/tutorial/devices): USB/Bluetooth 선택 처리.
- [Chrome Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth): 웹 버전의 지원 플랫폼 안내.
- 산의 눈/암석 메시, 여섯 코스 환경, 앱 아이콘은 이 프로젝트에서 자체 생성했습니다.
