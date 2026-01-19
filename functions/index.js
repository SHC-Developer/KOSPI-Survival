const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ============== 상수 정의 ==============
const TICKS_PER_DAY = 1800;
const DT = 1 / TICKS_PER_DAY;
const SQRT_DT = Math.sqrt(DT);
const BLUECHIP_TICK_CAP = 0.02;
const THEME_TICK_CAP = 0.08;
const DAILY_UPPER_LIMIT = 1.30;
const DAILY_LOWER_LIMIT = 0.70;

// 50초 동안 1초마다 업데이트, 10초 갭
const UPDATE_DURATION = 50;
const NEWS_GAP_DURATION = 10;

// 종목 설정 (4개: 대형주 2개 + 작전주 2개)
const STOCK_CONFIGS = [
  { id: '1', name: '삼성전자', type: 'bluechip', initialPrice: 72000, meanPrice: 75000, kappa: 0.02, sigma: 0.03, jumpIntensity: 0.1 },
  { id: '2', name: 'SK하이닉스', type: 'bluechip', initialPrice: 185000, meanPrice: 190000, kappa: 0.025, sigma: 0.04, jumpIntensity: 0.15 },
  { id: '3', name: '퀀텀바이오', type: 'theme', initialPrice: 8500, meanPrice: 7000, kappa: 0.05, sigma: 0.15, jumpIntensity: 0.6 },
  { id: '4', name: 'AI솔루션', type: 'theme', initialPrice: 15200, meanPrice: 12000, kappa: 0.06, sigma: 0.18, jumpIntensity: 0.7 },
];

// 뉴스 템플릿
const NEWS_TEMPLATES = {
  GOOD: [
    "{name}, 분기 실적 예상치 크게 상회",
    "{name}, 대규모 수주 계약 체결",
    "{name}, 신규 사업 진출 발표",
    "{name}, 기관 매수세 급증",
    "{name}, 외국인 대량 매수 포착",
    "{name}, 정부 지원 사업 선정",
    "{name}, 신기술 특허 취득",
    "{name}, 해외 진출 성공",
    "{name}, 배당금 대폭 인상 예고",
    "{name}, M&A 성사 임박",
  ],
  BAD: [
    "{name}, 분기 실적 예상치 크게 하회",
    "{name}, 대규모 리콜 발표",
    "{name}, 핵심 인력 대거 이탈",
    "{name}, 기관 매도세 급증",
    "{name}, 외국인 대량 매도 포착",
    "{name}, 규제 당국 조사 착수",
    "{name}, 경쟁사에 시장 점유율 잠식",
    "{name}, 주요 고객사 계약 해지",
    "{name}, 분식회계 의혹 제기",
    "{name}, 경영진 비리 혐의",
  ],
};

// ============== 유틸리티 함수 ==============

// Box-Muller 변환을 이용한 정규분포 난수 생성
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 호가 단위 계산
function getTickSize(price) {
  if (price >= 500000) return 1000;
  if (price >= 100000) return 500;
  if (price >= 50000) return 100;
  if (price >= 10000) return 50;
  if (price >= 5000) return 10;
  if (price >= 1000) return 5;
  return 1;
}

// 호가 반올림
function roundToTickSize(price) {
  const tickSize = getTickSize(price);
  return Math.round(price / tickSize) * tickSize;
}

// OU 프로세스 가격 업데이트
function updatePriceOU(stock, config) {
  const isBluechip = config.type === 'bluechip';
  const tickCap = isBluechip ? BLUECHIP_TICK_CAP : THEME_TICK_CAP;
  
  const logPrice = Math.log(stock.currentPrice);
  const logMean = Math.log(config.meanPrice);
  
  const tickSigma = config.sigma * SQRT_DT;
  
  // OU 프로세스
  const meanReversion = config.kappa * (logMean - logPrice) * DT;
  const randomNoise = tickSigma * gaussianRandom();
  const trendContribution = (stock.trendNoise || 0) * tickSigma * 0.3;
  
  let logReturn = meanReversion + randomNoise + trendContribution;
  
  // 캡 적용
  const logCap = Math.log(1 + tickCap);
  logReturn = Math.max(-logCap, Math.min(logCap, logReturn));
  
  let newPrice = Math.exp(logPrice + logReturn);
  newPrice = roundToTickSize(newPrice);
  newPrice = Math.max(newPrice, 100);
  
  // 상하한가 적용
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return newPrice;
}

// 초기 주가 데이터 생성
function getInitialPrices() {
  const prices = {};
  STOCK_CONFIGS.forEach(config => {
    prices[config.id] = {
      currentPrice: config.initialPrice,
      previousClose: config.initialPrice,
      openPrice: config.initialPrice,
      upperLimit: Math.round(config.initialPrice * DAILY_UPPER_LIMIT),
      lowerLimit: Math.round(config.initialPrice * DAILY_LOWER_LIMIT),
      trendNoise: (Math.random() - 0.5) * 2,
    };
  });
  return prices;
}

// 뉴스 이벤트 생성
function generateNewsEvent(stock, config, gameTick, currentDay) {
  const isGood = Math.random() > 0.5;
  const templates = isGood ? NEWS_TEMPLATES.GOOD : NEWS_TEMPLATES.BAD;
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // 점프 크기 결정
  let jumpPercent;
  if (config.type === 'bluechip') {
    // 대형주: ±5% ~ ±20%
    jumpPercent = (0.05 + Math.random() * 0.15) * config.jumpIntensity;
  } else {
    // 작전주: ±20% ~ ±60%
    jumpPercent = (0.20 + Math.random() * 0.40) * config.jumpIntensity;
  }
  
  if (!isGood) jumpPercent = -jumpPercent;
  
  return {
    id: `news-${gameTick}-${config.id}`,
    time: gameTick,
    day: currentDay,
    title: template.replace("{name}", config.name),
    description: isGood 
      ? `${config.name}에 대한 강력한 매수 신호가 포착되었습니다.`
      : `${config.name}에 대한 투자 주의가 필요합니다.`,
    effect: isGood ? 'GOOD' : 'BAD',
    targetStockId: config.id,
    jumpPercent: jumpPercent * 100, // 퍼센트로 저장
  };
}

// 뉴스 점프 적용
function applyNewsJump(stock, jumpPercent) {
  let newPrice = stock.currentPrice * (1 + jumpPercent / 100);
  newPrice = roundToTickSize(newPrice);
  
  // 상/하한가 제한
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return newPrice;
}

// ============== Cloud Functions ==============

// 유틸: sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1분마다 주가 업데이트 (Cloud Scheduler) - 50초 업데이트 + 10초 뉴스 갭
exports.updateStockPrices = onSchedule({
  schedule: "* * * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  timeoutSeconds: 540, // 9분 (안전 마진)
  memory: "256MiB",
}, async (event) => {
  try {
    // 서버 상태 확인
    const serverDoc = await db.doc('game/serverStatus').get();
    const serverData = serverDoc.exists ? serverDoc.data() : { isRunning: false };
    
    if (!serverData.isRunning) {
      console.log('Server is stopped. Skipping price update.');
      return;
    }
    
    // 현재 주가 가져오기
    let stockDoc = await db.doc('game/stockPrices').get();
    let prices = stockDoc.exists ? stockDoc.data().prices : getInitialPrices();
    let gameTick = stockDoc.exists ? (stockDoc.data().gameTick || 0) : 0;
    let currentDay = stockDoc.exists ? (stockDoc.data().currentDay || 1) : 1;
    let dayTickCount = gameTick % TICKS_PER_DAY;
    
    console.log(`Starting update cycle. Day ${currentDay}, Tick ${gameTick}`);
    
    // Phase 1: 50초 동안 1초마다 가격 업데이트
    for (let tick = 0; tick < UPDATE_DURATION; tick++) {
      // 하루 종료 체크
      if (dayTickCount >= TICKS_PER_DAY) {
        // 새로운 날 시작
        currentDay++;
        dayTickCount = 0;
        
        // 전일 종가 업데이트 및 상하한가 재설정
        STOCK_CONFIGS.forEach(config => {
          const stock = prices[config.id];
          const newPrevClose = stock.currentPrice;
          prices[config.id] = {
            ...stock,
            previousClose: newPrevClose,
            openPrice: newPrevClose,
            upperLimit: Math.round(newPrevClose * DAILY_UPPER_LIMIT),
            lowerLimit: Math.round(newPrevClose * DAILY_LOWER_LIMIT),
            trendNoise: (Math.random() - 0.5) * 2,
          };
        });
      }
      
      // 주가 업데이트
      STOCK_CONFIGS.forEach(config => {
        const stock = prices[config.id];
        const newPrice = updatePriceOU(stock, config);
        
        // 추세 노이즈 업데이트 (180틱마다)
        let newTrendNoise = stock.trendNoise || 0;
        if (dayTickCount % 180 === 0) {
          const targetTrend = (Math.random() - 0.5) * 2;
          newTrendNoise = newTrendNoise * 0.3 + targetTrend * 0.7;
        }
        
        prices[config.id] = {
          ...stock,
          currentPrice: newPrice,
          trendNoise: newTrendNoise,
        };
      });
      
      gameTick++;
      dayTickCount++;
      
      // Firebase에 저장 (isNewsPhase: false)
      await db.doc('game/stockPrices').set({
        prices,
        gameTick,
        currentDay,
        isNewsPhase: false,
        newsPhaseCountdown: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 마지막 틱이 아니면 1초 대기
      if (tick < UPDATE_DURATION - 1) {
        await sleep(1000);
      }
    }
    
    // Phase 2: 10초 뉴스 갭
    console.log('Starting news phase...');
    
    // 4개 종목 중 최소 1개 이상에 뉴스 발생
    const newsStockCount = Math.floor(Math.random() * 3) + 1; // 1~3개 종목
    const shuffledConfigs = [...STOCK_CONFIGS].sort(() => Math.random() - 0.5);
    const selectedConfigs = shuffledConfigs.slice(0, newsStockCount);
    
    const newsEvents = selectedConfigs.map(config => {
      const stock = prices[config.id];
      return generateNewsEvent(stock, config, gameTick, currentDay);
    });
    
    // 뉴스 이벤트를 Firebase에 저장 (클라이언트에서 표시용)
    await db.doc('game/newsEvents').set({
      events: newsEvents,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 3초 "뉴스 집중" 경고 시간
    await db.doc('game/stockPrices').update({
      isNewsPhase: true,
      newsPhaseCountdown: 10,
      newsWarningActive: true,
    });
    
    await sleep(3000); // 3초 대기
    
    // 뉴스 경고 해제, 뉴스 표시 시작
    await db.doc('game/stockPrices').update({
      newsWarningActive: false,
      newsPhaseCountdown: 7,
    });
    
    // 7초 뉴스 표시 시간 (뉴스 점프 적용)
    // 뉴스 점프를 적용한 가격 업데이트
    newsEvents.forEach(news => {
      const config = STOCK_CONFIGS.find(c => c.id === news.targetStockId);
      if (config) {
        const stock = prices[config.id];
        const newPrice = applyNewsJump(stock, news.jumpPercent);
        prices[config.id] = {
          ...stock,
          currentPrice: newPrice,
        };
      }
    });
    
    // 뉴스 적용된 가격 저장
    await db.doc('game/stockPrices').set({
      prices,
      gameTick,
      currentDay,
      isNewsPhase: true,
      newsPhaseCountdown: 7,
      newsWarningActive: false,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 7초 동안 카운트다운
    for (let i = 6; i >= 0; i--) {
      await sleep(1000);
      await db.doc('game/stockPrices').update({
        newsPhaseCountdown: i,
      });
    }
    
    // 뉴스 페이즈 종료
    await db.doc('game/stockPrices').update({
      isNewsPhase: false,
      newsPhaseCountdown: 0,
    });
    
    console.log(`Update cycle completed. Day ${currentDay}, Tick ${gameTick}`);
  } catch (error) {
    console.error('Error updating stock prices:', error);
  }
});

// 서버 시작/중지 (Admin용)
exports.toggleServer = onCall({
  region: "asia-northeast3",
}, async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can toggle server');
  }
  
  const { action } = request.data; // 'start' or 'stop'
  
  if (action === 'start') {
    // 서버 시작
    await db.doc('game/serverStatus').set({
      isRunning: true,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      startedBy: userEmail
    });
    
    // 주가 초기화 (없으면)
    const stockDoc = await db.doc('game/stockPrices').get();
    if (!stockDoc.exists) {
      await db.doc('game/stockPrices').set({
        prices: getInitialPrices(),
        gameTick: 0,
        currentDay: 1,
        isNewsPhase: false,
        newsPhaseCountdown: 0,
        newsWarningActive: false,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    return { success: true, message: 'Server started' };
  } else if (action === 'stop') {
    // 서버 중지
    await db.doc('game/serverStatus').set({
      isRunning: false,
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
      stoppedBy: userEmail
    });
    
    return { success: true, message: 'Server stopped' };
  }
  
  throw new HttpsError('invalid-argument', 'Invalid action');
});

// 서버 상태 초기화 (최초 배포 시)
exports.initializeServer = onCall({
  region: "asia-northeast3",
}, async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can initialize server');
  }
  
  // 서버 상태 초기화
  await db.doc('game/serverStatus').set({
    isRunning: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 주가 초기화
  await db.doc('game/stockPrices').set({
    prices: getInitialPrices(),
    gameTick: 0,
    currentDay: 1,
    isNewsPhase: false,
    newsPhaseCountdown: 0,
    newsWarningActive: false,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 뉴스 초기화
  await db.doc('game/newsEvents').set({
    events: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true, message: 'Server initialized' };
});

// 주가 리셋 (Admin용)
exports.resetStockPrices = onCall({
  region: "asia-northeast3",
}, async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can reset stock prices');
  }
  
  // 주가 초기화
  await db.doc('game/stockPrices').set({
    prices: getInitialPrices(),
    gameTick: 0,
    currentDay: 1,
    isNewsPhase: false,
    newsPhaseCountdown: 0,
    newsWarningActive: false,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true, message: 'Stock prices reset' };
});
