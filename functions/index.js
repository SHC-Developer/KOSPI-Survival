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

// 종목 설정
const STOCK_CONFIGS = [
  { id: '1', name: '삼성전자', type: 'bluechip', initialPrice: 72000, meanPrice: 75000, kappa: 0.02, sigma: 0.03 },
  { id: '2', name: 'SK하이닉스', type: 'bluechip', initialPrice: 185000, meanPrice: 190000, kappa: 0.025, sigma: 0.04 },
  { id: '3', name: 'LG전자', type: 'bluechip', initialPrice: 95000, meanPrice: 100000, kappa: 0.02, sigma: 0.035 },
  { id: '4', name: 'NAVER', type: 'bluechip', initialPrice: 195000, meanPrice: 210000, kappa: 0.03, sigma: 0.045 },
  { id: '5', name: '카카오', type: 'bluechip', initialPrice: 42000, meanPrice: 45000, kappa: 0.035, sigma: 0.05 },
  { id: '6', name: '현대차', type: 'bluechip', initialPrice: 245000, meanPrice: 250000, kappa: 0.02, sigma: 0.03 },
  { id: '7', name: 'LG화학', type: 'bluechip', initialPrice: 380000, meanPrice: 400000, kappa: 0.025, sigma: 0.04 },
  { id: '8', name: '퀀텀바이오', type: 'theme', initialPrice: 8500, meanPrice: 7000, kappa: 0.05, sigma: 0.15 },
  { id: '9', name: 'AI솔루션', type: 'theme', initialPrice: 15200, meanPrice: 12000, kappa: 0.06, sigma: 0.18 },
  { id: '10', name: '메타코인', type: 'theme', initialPrice: 4800, meanPrice: 4000, kappa: 0.07, sigma: 0.20 },
];

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

// ============== Cloud Functions ==============

// 유틸: sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1분마다 주가 업데이트 (Cloud Scheduler) - 내부에서 6번 (10초 간격) 업데이트
exports.updateStockPrices = onSchedule({
  schedule: "* * * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  timeoutSeconds: 120,
}, async (event) => {
  try {
    // 서버 상태 확인
    const serverDoc = await db.doc('game/serverStatus').get();
    const serverData = serverDoc.exists ? serverDoc.data() : { isRunning: false };
    
    if (!serverData.isRunning) {
      console.log('Server is stopped. Skipping price update.');
      return;
    }
    
    // 1분 동안 6번 업데이트 (10초 간격)
    for (let batch = 0; batch < 6; batch++) {
      // 현재 주가 가져오기
      const stockDoc = await db.doc('game/stockPrices').get();
      let prices = stockDoc.exists ? stockDoc.data().prices : getInitialPrices();
      let gameTick = stockDoc.exists ? (stockDoc.data().gameTick || 0) : 0;
      let currentDay = stockDoc.exists ? (stockDoc.data().currentDay || 1) : 1;
      let dayTickCount = gameTick % TICKS_PER_DAY;
      
      // 10틱(10초) 동안 업데이트
      for (let i = 0; i < 10; i++) {
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
      }
      
      // Firebase에 저장
      await db.doc('game/stockPrices').set({
        prices,
        gameTick,
        currentDay,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Batch ${batch + 1}/6: Day ${currentDay}, Tick ${gameTick}`);
      
      // 마지막 배치가 아니면 10초 대기
      if (batch < 5) {
        await sleep(10000);
      }
    }
    
    console.log('Stock prices update cycle completed.');
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
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
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
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true, message: 'Stock prices reset' };
});

