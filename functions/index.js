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

// 30분(1800초) 동안 1초마다 업데이트 = 1일
// Cloud Scheduler가 30분마다 트리거
const MARKET_DURATION = 1800; // 30분 = 1800초 = 1일
const NEWS_INTERVAL = 60; // 1분(60틱)마다 뉴스 이벤트

// 종목 설정 (4개: 대형주 2개 + 작전주 2개)
// jumpIntensity 조정: 대형주 상향, 작전주 하향 (더 균형 잡힌 변동폭)
const STOCK_CONFIGS = [
  { id: '1', name: '삼성전자', type: 'bluechip', initialPrice: 72000, meanPrice: 75000, kappa: 0.02, sigma: 0.03, jumpIntensity: 0.3 },   // 1.5% ~ 6%
  { id: '2', name: 'SK하이닉스', type: 'bluechip', initialPrice: 185000, meanPrice: 190000, kappa: 0.025, sigma: 0.04, jumpIntensity: 0.35 }, // 1.75% ~ 7%
  { id: '3', name: '퀀텀바이오', type: 'theme', initialPrice: 8500, meanPrice: 7000, kappa: 0.05, sigma: 0.15, jumpIntensity: 0.4 },    // 8% ~ 24%
  { id: '4', name: 'AI솔루션', type: 'theme', initialPrice: 15200, meanPrice: 12000, kappa: 0.06, sigma: 0.18, jumpIntensity: 0.45 },   // 9% ~ 27%
];

// 가짜 뉴스 확률 (30%)
const FAKE_NEWS_PROBABILITY = 0.3;

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
  
  // 가짜 뉴스 여부 (30% 확률)
  const isFakeNews = Math.random() < FAKE_NEWS_PROBABILITY;
  
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
  
  // 가짜 뉴스인 경우: 역방향 또는 효과 감소
  let actualJumpPercent = jumpPercent;
  if (isFakeNews) {
    const fakeEffect = Math.random();
    if (fakeEffect < 0.5) {
      // 50%: 역방향 (호재→하락, 악재→상승)
      actualJumpPercent = -jumpPercent * (0.3 + Math.random() * 0.5); // 30%~80% 역방향
    } else {
      // 50%: 효과 없음 또는 미미함
      actualJumpPercent = jumpPercent * (Math.random() * 0.2); // 0%~20% 효과
    }
  }
  
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
    jumpPercent: actualJumpPercent * 100, // 실제 적용될 퍼센트 (가짜 뉴스 효과 반영)
    isFakeNews: isFakeNews, // 가짜 뉴스 여부 (클라이언트에서 결과 확인용)
    displayedEffect: isGood ? 'GOOD' : 'BAD', // 표시된 효과 (뉴스 내용 기준)
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

// 30분마다 주가 업데이트 (Cloud Scheduler) - 30분 동안 매초 업데이트 후 장 마감
exports.updateStockPrices = onSchedule({
  schedule: "*/30 * * * *", // 30분마다 (0분, 30분)
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  timeoutSeconds: 2100, // 35분 (30분 + 여유)
  memory: "512MiB",
}, async (event) => {
  const cycleStartTime = Date.now();
  
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
    
    // 새로운 장 시작 - 전일 종가 업데이트
    console.log(`=== Day ${currentDay} Market Open ===`);
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
    
    // 장 개장 상태 저장
    await db.doc('game/stockPrices').set({
      prices,
      gameTick,
      currentDay,
      isMarketClosed: false,
      isNewsPhase: false,
      newsPhaseCountdown: 0,
      marketClosingMessage: null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 30분(1800초) 동안 매초 업데이트
    for (let tick = 0; tick < MARKET_DURATION; tick++) {
      const targetTime = cycleStartTime + (tick * 1000);
      
      // 뉴스 이벤트 체크 (1분마다)
      const isNewsTime = tick > 0 && tick % NEWS_INTERVAL === 0;
      
      if (isNewsTime) {
        // 뉴스 페이즈 시작
        console.log(`News event at tick ${tick}`);
        
        // 4개 종목 중 1~2개에 뉴스 발생
        const newsStockCount = Math.floor(Math.random() * 2) + 1;
        const shuffledConfigs = [...STOCK_CONFIGS].sort(() => Math.random() - 0.5);
        const selectedConfigs = shuffledConfigs.slice(0, newsStockCount);
        
        const newsEvents = selectedConfigs.map(config => {
          const stock = prices[config.id];
          return generateNewsEvent(stock, config, gameTick, currentDay);
        });
        
        // 뉴스 저장
        await db.doc('game/newsEvents').set({
          events: newsEvents,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 뉴스 경고 (3초)
        await db.doc('game/stockPrices').update({
          isNewsPhase: true,
          newsPhaseCountdown: 10,
          newsWarningActive: true,
        });
        
        await sleep(3000);
        
        // 뉴스 점프 적용
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
        
        await db.doc('game/stockPrices').set({
          prices,
          gameTick,
          currentDay,
          isMarketClosed: false,
          isNewsPhase: true,
          newsPhaseCountdown: 7,
          newsWarningActive: false,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 7초 대기
        await sleep(7000);
        
        // 뉴스 페이즈 종료
        await db.doc('game/stockPrices').update({
          isNewsPhase: false,
          newsPhaseCountdown: 0,
        });
        
        // 뉴스 시간 보정 (10초 소요)
        continue;
      }
      
      // 주가 업데이트
      STOCK_CONFIGS.forEach(config => {
        const stock = prices[config.id];
        const newPrice = updatePriceOU(stock, config);
        
        let newTrendNoise = stock.trendNoise || 0;
        if (tick % 180 === 0) {
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
      
      // Firebase에 저장
      await db.doc('game/stockPrices').set({
        prices,
        gameTick,
        currentDay,
        isMarketClosed: false,
        isNewsPhase: false,
        newsPhaseCountdown: 0,
        dayProgress: Math.round((tick / MARKET_DURATION) * 100), // 진행률 (%)
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 다음 틱 목표 시간까지 대기
      if (tick < MARKET_DURATION - 1) {
        const nextTargetTime = cycleStartTime + ((tick + 1) * 1000);
        const waitTime = Math.max(0, nextTargetTime - Date.now());
        if (waitTime > 0) {
          await sleep(waitTime);
        }
      }
    }
    
    // 장 마감 처리
    currentDay++;
    
    await db.doc('game/stockPrices').set({
      prices,
      gameTick,
      currentDay,
      isMarketClosed: true,
      isNewsPhase: false,
      newsPhaseCountdown: 0,
      marketClosingMessage: "📢 장이 마감되었습니다. 약 1~3분 이후 다음 장이 개장합니다.",
      dayProgress: 100,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const totalElapsed = Date.now() - cycleStartTime;
    console.log(`=== Day ${currentDay - 1} Market Closed === Duration: ${Math.round(totalElapsed / 1000)}s`);
    
    // 함수 종료 - 다음 30분에 Cloud Scheduler가 다시 트리거
  } catch (error) {
    console.error('Error updating stock prices:', error);
    
    // 에러 발생 시 장 마감 상태로 전환
    try {
      await db.doc('game/stockPrices').update({
        isMarketClosed: true,
        marketClosingMessage: "⚠️ 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      });
    } catch (e) {
      console.error('Failed to update error state:', e);
    }
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
